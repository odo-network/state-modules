/* global Observable */
import { MODULE_NAME, SELECTOR_CHILDREN } from './context';

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
    Object.keys(settings.hooks).forEach(hook => {
      if (Array.isArray(settings.hooks[hook]) || settings.hooks[hook] instanceof Set) {
        settings.hooks[hook] = Array.from(settings.hooks[hook]).filter(h => typeof h === 'function');
        if (!settings.hooks[hook].length) {
          delete settings.hooks[hook];
        }
      }
    });
  }
  return settings;
}

function collisionError(key, value, priv, module) {
  return `[${MODULE_NAME}] | ERROR | Module ${priv.config.mid} | Component ${
    module.config.cid
  } | State Collision: You have already defined ${key} with value of type ${String(value)}`;
}

export function merge(obj, withObj, priv, module) {
  if (obj instanceof Map && withObj instanceof Map) {
    withObj.forEach((value, key) => {
      if (obj.has(key)) {
        throw new Error(collisionError(key, value, priv, module));
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
          throw new Error(collisionError(key, value, priv, module));
        }
        merge(obj[key], value, priv, module);
      } else {
        obj[key] = value;
      }
    });
  }
}

export function buildSelectors(priv, component, selectors, _ancestors = []) {
  if (typeof selectors === 'function') {
    return selectors;
  } else if (Array.isArray(selectors) || typeof selectors === 'string') {
    const value = Array.isArray(selectors) ? selectors.join('.') : selectors;
    _ancestors.forEach(ancestor => ancestor.add(value));
    return value;
  } else if (!selectors || typeof selectors !== 'object') {
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${priv.config.mid} ${
      component ? `| Component ${component.config.cid} |` : ''
    } state selector must be string or plain object but got ${String(selectors)}`);
  } else if (selectors[SELECTOR_CHILDREN]) {
    // handle nested but pre-build selectors
    _ancestors.forEach(ancestor => {
      selectors[SELECTOR_CHILDREN].forEach(child => {
        ancestor.add(child);
      });
    });
    return selectors[SELECTOR_CHILDREN];
  }
  const children = new Set();
  const ancestors = _ancestors.concat(children);
  const selector = { ...selectors };
  // we need to prepare the selector by parsing and discovering all child paths of state it selects
  Object.keys(selector).forEach(key => {
    selector[key] = buildSelectors(priv, component, selector[key], ancestors);
  });
  selector[SELECTOR_CHILDREN] = children;
  return selector;
}

export function getSelectorSubscription(snapshot, onUpdate, selectors) {
  return {
    next(actions) {
      snapshot.state = actions.getState(selectors);
      onUpdate(snapshot);
    },
  };
}

/**
 * Iterates a selection object and builds an identical object
 * with all strings replaced with
 * @param {*} state
 * @param {*} selected
 */
export function getSelectedState(state, selected, props) {
  if (!selected) {
    throw new Error(`[${MODULE_NAME}] | ERROR | getSelectedState | Received falsey value (${String(selected)}), expects string, array, function, or plain object.`);
  } else if (typeof selected === 'function') {
    const value = selected(props);
    return getSelectedState(state, value, props);
  } else if (typeof selected === 'string') {
    return selected.split('.').reduce((p, c) => (p ? p[c] : p), state);
  } else if (Array.isArray(selected)) {
    return selected.reduce((p, c) => (p ? p[c] : p), state);
  }
  const result = {};
  Object.keys(selected).forEach(key => {
    result[key] = getSelectedState(state, selected[key]);
  });
  return result;
}

export function subscribeToAction(priv, condition, once = false) {
  if (!priv.subscribers) {
    priv.subscribers = {
      actions: new Map(),
      updates: new Map(),
    };
  }
  return new Observable(observer => {
    // Create an event handler which sends data to the sink
    const handler = action => {
      observer.next(action);
      if (once && !observer.closed) {
        cancel();
      }
    };

    // A cleanup function which will cancel the event stream
    const cancel = () => {
      unsubscribeFromAction(priv, condition, handler);
      observer.complete();
    };

    const set = priv.subscribers.actions.get(condition) || new Set();
    set.add(handler);
    priv.subscribers.actions.set(condition, set);

    return cancel;
  });
}

export function hasProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

function unsubscribeFromAction(priv, condition, handler) {
  const set = priv.subscribers.actions.get(condition);
  if (set) {
    set.delete(handler);
    if (set.size === 0) {
      priv.subscribers.actions.delete(condition);
    }
  }
}

export function subscribeToSelector(priv, selector, once = false) {
  if (!priv.subscribers) {
    priv.subscribers = {
      actions: new Map(),
      updates: new Map(),
    };
  }
  return new Observable(observer => {
    // Create an event handler which sends data to the sink
    const handler = action => {
      observer.next(action);
      if (once && !observer.closed) {
        cancel();
      }
    };

    // A cleanup function which will cancel the event stream
    const cancel = () => {
      unsubscribeFromSelector(priv, selector, handler);
      observer.complete();
    };

    selector[SELECTOR_CHILDREN].forEach(key => {
      const set = priv.subscribers.updates.get(key) || new Set();
      set.add(handler);
      priv.subscribers.updates.set(key, set);
    });

    return cancel;
  });
}

function unsubscribeFromSelector(priv, selector, handler) {
  selector[SELECTOR_CHILDREN].forEach(key => {
    const set = priv.subscribers.updates.get(key);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        priv.subscribers.updates.delete(key);
      }
    }
  });
}
