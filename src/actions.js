import { MODULE_NAME, STATE_SELECTOR, emptyFrozenObject } from './context';
import { getSelectedState } from './utils';
import * as handle from './handlers';

export function select(k, props = emptyFrozenObject) {
  let path = k;
  if (typeof k === 'function') {
    return k(this.state, props);
  }

  if (!this.selectors) {
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${this.config.mid} | does not have any pre-configured selectors`);
  } else if (typeof k === 'string') {
    path = k.split('.');
  }

  if (!Array.isArray(path)) {
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
      this.config.mid
    } | state.select expects a function, string[], or string as an argument.`);
  }

  const selected = path.reduce((p, c) => p[c], this.selectors);

  return getSelectedState(this.state, selected, props);
}

function iterateActionSubscribers(action, subscribers, promises = []) {
  subscribers.forEach((onMatch, condition) => {
    if (
      (typeof condition === 'function' && condition(action)) ||
      (typeof condition === 'string' && action.type === condition) ||
      (Array.isArray(condition) && condition.some(c => action.type === c))
    ) {
      onMatch.forEach(match => {
        const r = match(action, condition, match);
        if (r && typeof r?.then === 'function') {
          promises.push(r);
        }
      });
    }
  });
  return promises;
}

class MemoizedUpdateActions {
  #memoized = new Map();
  #context;
  constructor(context) {
    this.#context = context;
  }
  getState = (selectors, props) =>
    Object.keys(selectors).reduce((p, c) => {
      const selector = selectors[c];
      if (typeof selector === 'object' && selector[STATE_SELECTOR].dynamic) {
        p[c] = getSelectedState(this.#context.state, selector, props);
      } else if (this.#memoized.has(selector)) {
        p[c] = this.#memoized.get(selector);
      } else {
        const value = getSelectedState(this.#context.state, selector, props);
        this.#memoized.set(selector, value);
        p[c] = value;
      }
      return p;
    }, Object.create(null));
}

function iterateUpdateSubscribers(context, subscribers, changedValues) {
  const handlers = new Set();
  if (changedValues.length >= subscribers.updates.size) {
    subscribers.updates.forEach((set, key) => {
      if (changedValues.includes(key)) {
        set.forEach(h => handlers.add(h));
      }
    });
  } else {
    changedValues.forEach(change => {
      if (subscribers.updates.has(change)) {
        subscribers.updates.get(change).forEach(h => handlers.add(h));
      }
    });
  }
  const actions = new MemoizedUpdateActions(context);
  handlers.forEach(handler => handler(actions));
}

export function dispatch(priv, _action) {
  if (!_action) {
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${priv.config.mid} | Tried to dispatch an empty action`);
  } else if (!_action.type) {
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
      priv.config.mid
    } | Tried to dispatch an action without a type property expects { type: string, ... }`);
  }

  let action = { ..._action };
  let changedValues;

  if (priv.subscribers && priv.subscribers.actions.size > 0) {
    // const promises = iterateActionSubscribers(action, priv.subscribers.actions);
    iterateActionSubscribers(action, priv.subscribers.actions);
    // if (promises.length) await Promise.all(promises);
  }

  const prevState = priv.state;

  try {
    if (priv.hooks && priv.hooks.before) {
      action = handle.actionHook('before', priv, action);
      if (action === null) return;
    }
    if (priv.reducers.has(action.type)) {
      changedValues = handle.routeAction(priv, action);
    }
    if (priv.routes.has(action.type)) {
      // await handle.asyncRoutes(priv, action);
      // experiment to see effect of asynchronous effects not being awaited
      // (hoping to make action dispatch fully synchronous)
      handle.asyncRoutes(priv, action);
    }
    if (priv.hooks && priv.hooks.after) {
      handle.hook('after', priv, action, prevState, changedValues);
    }
    if (changedValues && priv.subscribers && priv.subscribers.updates.size > 0) {
      iterateUpdateSubscribers(priv.context, priv.subscribers, changedValues);
    }
  } catch (e) {
    console.error(
      `[${MODULE_NAME}] | ERROR | Module ${priv.config.mid} | An Error occurred while dispatching action: `,
      action,
      e,
    );
    handle.hook('error', priv, action, e);
    throw e;
  }

  return changedValues;
}
