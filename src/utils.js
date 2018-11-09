import { MODULE_NAME, STATE_SELECTOR, emptyFrozenObject, noop } from './context';
import createSubscriber from './subscriber';

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
    // Object.keys() performs better for larger objects (for in for smaller),
    // we use the object.keys method here as we will not know the size of the obj
    // beforehand
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
        // console.log('Merge ', key, ' into: ', obj);
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
    if (!_ancestors) {
      return selectors;
    }
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
  }
  if (typeof selectors === 'function') {
    _ancestors.forEach(ancestor => {
      addDynamicToAncestor(ancestor, selectors);
    });
    return selectors;
  }
  if (Array.isArray(selectors) || typeof selectors === 'string') {
    const path = Array.isArray(selectors) ? selectors.join('.') : selectors;
    _ancestors.forEach(ancestor => ancestor.children.add(path));
    return path;
  }
  if (!selectors || typeof selectors !== 'object') {
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
  for (const selectorID of Object.keys(selector)) {
    selector[selectorID] = buildSelectors(descriptor, component, selector[selectorID], ancestors);
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
  for (const selectedProperty of Object.keys(selected)) {
    result[selectedProperty] = getSelectedState(state, selected[selectedProperty], props);
  }
  return result;
}

export function checkActionCondition(action, condition) {
  if (
    (typeof condition === 'function' && condition(action)) ||
    (typeof condition === 'string' && action.type === condition) ||
    (Array.isArray(condition) && condition.some(c => (typeof c === 'function' ? c(action) : c === action.type)))
  ) {
    return true;
  }
  return false;
}

export function subscribeToAction(descriptor, condition, once = false) {
  if (!descriptor.subscribers) {
    descriptor.subscribers = {
      actions: new Map(),
      updates: new Map(),
    };
  }
  return createSubscriber(actionSubscriptionHandler, descriptor, condition, once);
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

function actionSubscriptionHandler(actions, descriptor, condition, once) {
  // Create an event handler which sends data to the sink
  const handler = action => {
    actions.next(action, descriptor.context);
    if (once) {
      handleCancel('once');
    }
  };

  // A cleanup function which will cancel the event stream
  let cancel = reason => {
    cancel = noop;
    unsubscribeHandlerFromPath(descriptor.subscribers.actions, handler, condition);
    actions.complete(reason);
  };

  // we need to define a handleCancel function so that we call the
  // appropriate canceller if it is changed
  function handleCancel(reason) {
    return cancel(reason);
  }

  subscribeHandlerToPath(descriptor.subscribers.actions, handler, condition);

  return {
    condition,
    unsubscribe: handleCancel,
    cancel: handleCancel,
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

  const handler = memoizedActions => {
    actions.next(memoizedActions, props, descriptor.context);
    if (once) {
      handleCancel('once');
    }
  };

  let cancel = reason => {
    cancel = noop;
    unsubscribeFromSelector(descriptor.subscribers.updates, dynamicMap, selector, handler);
    if (hasDynamicSelectors) {
      props = undefined;
      dynamicMap = undefined;
      dynamicRefCounts = undefined;
    }
    actions.complete(reason);
  };

  // we need to define a handleCancel function so that we call the
  // appropriate canceller if it is changed
  function handleCancel(reason) {
    return cancel(reason);
  }

  // each of our children must be subscribed to - these are static values which
  // will live throughout the entire lifecycle of the component.
  selector[STATE_SELECTOR].children.forEach(path => {
    subscribeHandlerToPath(descriptor.subscribers.updates, handler, path);
  });

  return {
    dynamic: hasDynamicSelectors,
    getSelectorState: p => getSelectedState(descriptor.state, selector, p || props),
    setSelectorProps: !hasDynamicSelectors
      ? noop
      : nextProps => {
        let response = false;
        if (nextProps === props) return response;
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
            response = true;
            dynamicRefCounts[prevPath] -= 1;
            if (dynamicRefCounts[prevPath] === 0) {
              // no conflict in dynamic for prevKey (multiple dynamic fns here dont subscribe to prevPath) - check if
              // children has this key and unsubscribe if not
              if (!selector[STATE_SELECTOR].children.has(prevPath)) {
                unsubscribeHandlerFromPath(descriptor.subscribers.updates, handler, prevPath);
              }
              delete dynamicRefCounts[prevPath];
            }
          } else {
            response = true;
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
        return response;
      },
    unsubscribe: handleCancel,
    cancel: handleCancel,
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
