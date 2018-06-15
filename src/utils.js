import { MODULE_NAME, STATE_SELECTOR, emptyFrozenObject, noop } from './context';
import createSubscriber from './subscriber';

// Used for automatic id assignment of state modules.
let i = 0;

export function parseModuleSettings(_settings) {
  const settings = { ..._settings };
  // Check to see if a module id (mid) is provided in the "config" property and auto create one if not
  settings.config = Object.assign({}, settings.config);
  if (!settings.config.mid) {
    i += 1;
    settings.config.mid = `state-module-${i}`;
  }
  // Check if hooks are defined, if they are remove them if they do not contain at least a single entry
  // Also allows hooks to return any value other than function to indicate they should not be included.
  // Empty hooks after parsing end up being removed all together.
  if (settings.hooks) {
    settings.hooks = Object.assign({}, settings.hooks);
    for (const hook in settings.hooks) {
      if (Object.prototype.hasOwnProperty.call(settings.hooks, hook)) {
        if (Array.isArray(settings.hooks[hook]) || settings.hooks[hook] instanceof Set) {
          settings.hooks[hook] = Array.from(settings.hooks[hook]).filter(h => typeof h === 'function');
          if (settings.hooks[hook].length === 0) {
            delete settings.hooks[hook];
          }
        }
      }
    }
  }
  return settings;
}

function collisionError(key, value, descriptor, module) {
  return `[${MODULE_NAME}] | ERROR | Module ${descriptor.config.mid} | Component ${
    module.config.cid
  } | State Collision: You have already defined ${key} with value of type ${String(value)}`;
}

export function merge(obj, withObj, descriptor, module) {
  if (obj instanceof Map && withObj instanceof Map) {
    withObj.forEach((value, key) => {
      if (obj.has(key)) {
        throw new Error(collisionError(key, value, descriptor, module));
      }
      obj.set(key, value);
    });
  } else if (obj instanceof Set && withObj instanceof Set) {
    withObj.forEach(value => obj.add(value));
  } else {
    Object.keys(withObj).forEach(key => {
      const value = withObj[key];
      if (obj[key] || obj[key] === null || typeof obj[key] === 'boolean' || typeof obj[key] === 'number') {
        if (
          typeof obj[key] !== 'object' ||
          typeof value !== 'object' ||
          Array.isArray(obj[key]) ||
          Array.isArray(value)
        ) {
          throw new Error(collisionError(key, value, descriptor, module));
        }
        merge(obj[key], value, descriptor, module);
      } else {
        obj[key] = value;
      }
    });
  }
}

function addDynamicToAncestor(ancestor, fn) {
  if (!ancestor.dynamic) {
    ancestor.dynamic = new Set();
  }
  ancestor.dynamic.add(fn);
}

export function buildSelectors(descriptor, component, selectors, _ancestors) {
  if (typeof selectors === 'object' && selectors[STATE_SELECTOR]) {
    // handle nested but pre-build selectors
    _ancestors.forEach(ancestor => {
      selectors[STATE_SELECTOR].children.forEach(child => {
        ancestor.children.add(child);
      });
      if (selectors[STATE_SELECTOR].dynamic) {
        selectors[STATE_SELECTOR].dynamic.forEach(fn => {
          addDynamicToAncestor(ancestor, fn);
        });
      }
    });
    return selectors;
  } else if (typeof selectors === 'function') {
    _ancestors.forEach(ancestor => {
      addDynamicToAncestor(ancestor, selectors);
    });
    return selectors;
  } else if (Array.isArray(selectors) || typeof selectors === 'string') {
    const path = Array.isArray(selectors) ? selectors.join('.') : selectors;
    _ancestors.forEach(ancestor => ancestor.children.add(path));
    return path;
  } else if (!selectors || typeof selectors !== 'object') {
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${descriptor.config.mid} ${
      component ? `| Component ${component.config.cid} |` : ''
    } state selector must be string or plain object but got ${String(selectors)}`);
  }

  const meta = {
    children: new Set(),
  };

  const ancestors = new Set(_ancestors).add(meta);

  const selector = { [STATE_SELECTOR]: meta, ...selectors };

  // we need to prepare the selector by parsing and discovering all child paths of state it selects
  for (const selectorID in selector) {
    if (Object.prototype.hasOwnProperty.call(selector, selectorID)) {
      selector[selectorID] = buildSelectors(descriptor, component, selector[selectorID], ancestors);
    }
  }

  return selector;
}

/**
 * Iterates a selection object and builds an identical object
 * with all strings replaced with
 * @param {*} state
 * @param {*} selected
 */
export function getSelectedState(state, selected, props = emptyFrozenObject) {
  if (!selected) {
    throw new Error(`[${MODULE_NAME}] | ERROR | getSelectedState | Received falsey value (${String(selected)}), expects string, array, function, or plain object.`);
  } else if (typeof selected === 'function') {
    return getSelectedState(state, selected(props), props);
  } else if (typeof selected === 'string') {
    return selected.split('.').reduce((p, c) => (p ? p[c] : p), state);
  } else if (Array.isArray(selected)) {
    return selected.reduce((p, c) => (p ? p[c] : p), state);
  }
  const result = {};
  for (const selectedProperty in selected) {
    if (Object.prototype.hasOwnProperty.call(selected, selectedProperty)) {
      result[selectedProperty] = getSelectedState(state, selected[selectedProperty]);
    }
  }
  return result;
}

export function subscribeToAction(descriptor, condition, once = false) {
  if (!descriptor.subscribers) {
    descriptor.subscribers = {
      actions: new Map(),
      updates: new Map(),
    };
  }
  return createSubscriber(actionSubscriptionHandler, descriptor.subscribers, condition, once);
}

export function subscribeToSelector(descriptor, selector, once = false) {
  if (!descriptor.subscribers) {
    descriptor.subscribers = {
      actions: new Map(),
      updates: new Map(),
    };
  }
  return createSubscriber(selectorSubscriptionHandler, descriptor, selector, once);
}

function actionSubscriptionHandler(actions, subscriptions, condition, once) {
  // Create an event handler which sends data to the sink
  const handler = action => {
    actions.next(action);
    if (once) {
      cancel();
    }
  };

  // A cleanup function which will cancel the event stream
  const cancel = () => {
    unsubscribeHandlerFromPath(subscriptions.actions, handler, condition);
    actions.complete();
  };

  subscribeHandlerToPath(subscriptions.actions, handler, condition);

  return {
    unsubscribe: cancel,
    cancel,
  };
}

export function hasProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

function selectorSubscriptionHandler(actions, descriptor, selector, once) {
  // when using dynamic props, we need to capture extra values and keep track of
  // the prop transitions of the connected value
  let props;
  // a map to hold the computed values of the previous props change
  let dynamicMap;
  // a map to hold a reference counter
  let dynamicRefCounts;

  const hasDynamicSelectors = Boolean(selector[STATE_SELECTOR].dynamic);

  const cancel = () => {
    unsubscribeFromSelector(descriptor.subscribers.updates, dynamicMap, selector, handler);
    actions.complete();
  };

  const handler = action => {
    actions.next(action);
    if (once) {
      cancel();
    }
  };

  // each of our children must be subscribed to - these are static values which
  // will live throughout the entire lifecycle of the component.
  selector[STATE_SELECTOR].children.forEach(path => {
    subscribeHandlerToPath(descriptor.subscribers.updates, handler, path);
  });

  return {
    dynamic: hasDynamicSelectors,
    setSelectorProps: !hasDynamicSelectors
      ? noop
      : nextProps => {
        if (nextProps === props) return;
        props = nextProps;
        if (!dynamicMap) {
          dynamicMap = new Map();
          dynamicRefCounts = {};
        }
        selector[STATE_SELECTOR].dynamic.forEach(fn => {
          let prevPath;
          let computedPath = fn(nextProps, descriptor.state);
          if (Array.isArray(computedPath)) {
            computedPath = computedPath.join('.');
          }
          if (dynamicMap.has(fn)) {
            prevPath = dynamicMap.get(fn);
            if (prevPath === computedPath) {
              // if our computedKey is the same as before then we do nothing
              return;
            }
            dynamicRefCounts[prevPath] -= 1;
            if (dynamicRefCounts[prevPath] === 0) {
              // no conflict in dynamic for prevKey (multiple dynamic fns here dont subscribe to prevPath) - check if
              // children has this key and unsubscribe if not
              if (!selector[STATE_SELECTOR].children.has(prevPath)) {
                unsubscribeHandlerFromPath(descriptor.subscribers.updates, handler, prevPath);
              }
              delete dynamicRefCounts[prevPath];
            }
          }
          if (!dynamicRefCounts[computedPath]) {
            dynamicRefCounts[computedPath] = 1;
            if (!selector[STATE_SELECTOR].children.has(computedPath)) {
              // we only need to subscribe if we arent already subscribed
              subscribeHandlerToPath(descriptor.subscribers.updates, handler, computedPath);
            }
          } else {
            // we are already subscribed from another dynamic selector
            dynamicRefCounts[computedPath] += 1;
          }
          dynamicMap.set(fn, computedPath);
        });
      },
    unsubscribe: cancel,
    cancel,
  };
}

function subscribeHandlerToPath(subscriptions, handler, path) {
  const set = subscriptions.get(path) || new Set();
  set.add(handler);
  subscriptions.set(path, set);
}

function unsubscribeHandlerFromPath(subscriptions, handler, path) {
  const set = subscriptions.get(path);
  if (set) {
    set.delete(handler);
    if (set.size === 0) {
      subscriptions.delete(path);
    }
  }
}

function unsubscribeFromSelector(subscriptions, dynamicMap, selector, handler) {
  selector[STATE_SELECTOR].children.forEach(path => {
    unsubscribeHandlerFromPath(subscriptions, handler, path);
  });
  if (dynamicMap) {
    // when we subscribe to dynamic selectors (functions based on props), we also need to
    // remove ourselves from those paths
    dynamicMap.forEach((fn, path) => {
      if (!selector[STATE_SELECTOR].children.has(path)) {
        unsubscribeHandlerFromPath(subscriptions, handler, path);
      }
    });
  }
}
