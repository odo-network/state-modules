import { MODULE_NAME, STATE_SELECTOR, emptyFrozenObject } from './context';
import { getSelectedState, checkActionCondition } from './utils';
import * as handle from './handlers';

export function select(k, props = emptyFrozenObject, state) {
  let path = k;
  if (typeof k === 'function') {
    return k(this.state, props);
  }
  if (k === state) {
    return this.state;
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

function iterateActionSubscribers(action, subscribers) {
  // we implement batching here but we can improve it further if needed
  // by unwinding any array type batching so they can also be included
  // and we can reduce total necessary checks.  Not sure if that is necessary
  // or beneficial at this time.
  subscribers.forEach((onMatch, condition) => {
    if (checkActionCondition(action, condition)) {
      onMatch.forEach(handler => handler(action));
    }
  });
}

let updateID = 0;

class MemoizedUpdateActions {
  #memoized = new Map();

  #context;

  // eslint-disable-next-line
  updateID = updateID++;

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

export function runAllUpdateSubscribers(context, subscribers) {
  const handlers = new Set();
  subscribers.updates.forEach(set => {
    set.forEach(h => handlers.add(h));
  });
  const actions = new MemoizedUpdateActions(context);
  handlers.forEach(handler => handler(actions));
}

export function dispatch(descriptor, _action) {
  if (!_action) {
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${descriptor.config.mid} | Tried to dispatch an empty action`);
  } else if (
    _action.type === undefined ||
    _action.type === null ||
    (typeof _action.type !== 'string' && typeof _action.type !== 'number' && typeof _action.type !== 'symbol')
  ) {
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
      descriptor.config.mid
    } | Tried to dispatch an action without a type property expects { type: string | number | symbol, ... }`);
  }

  let action = { ..._action };
  let changedValues;

  if (descriptor.subscribers && descriptor.subscribers.actions.size > 0) {
    iterateActionSubscribers(action, descriptor.subscribers.actions);
  }

  const prevState = descriptor.state;

  try {
    if (descriptor.hooks && descriptor.hooks.before) {
      action = handle.actionHook('before', descriptor, action);
      if (action === null) return;
    }
    if (descriptor.reducers.has(action.type)) {
      changedValues = handle.routeAction(descriptor, action);
    }
    if (descriptor.hooks && descriptor.hooks.after) {
      handle.hook('after', descriptor, action, prevState, changedValues);
    }
    if (descriptor.effects && descriptor.effects.has(action.type)) {
      // async effects are executed last and are not waited on before
      // updating subscribers about what has happened thus far (if anything).
      handle.asyncEffects(descriptor, action);
    }
    if (changedValues && descriptor.subscribers && descriptor.subscribers.updates.size > 0) {
      iterateUpdateSubscribers(descriptor.context, descriptor.subscribers, changedValues);
    }
  } catch (e) {
    console.error(
      `[${MODULE_NAME}] | ERROR | Module ${descriptor.config.mid} | An Error occurred while dispatching action: `,
      action,
      e,
    );
    handle.hook('error', descriptor, action, e);
    throw e;
  }

  return changedValues;
}
