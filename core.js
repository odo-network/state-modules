// ? Consider implementing lightweight replacement of immer?
import produce from 'immer';
import handleNewStateModule from './build';
import { MODULE_NAME } from './context';
import diff from './diff';

import connectState from './connect';

// Used for storing the private methods and properties of each manager
const ManagerPrivateState = new WeakMap();

// Used for automatic id assignment of state modules.
let i = 0;

function handleStateChange(prevState, nextState) {
  const changedValues = diff(nextState, prevState);
  return changedValues;
}

async function handleAsyncRoutes(priv, action, routes) {
  let lock = false;
  const promises = [];
  const handleLock = () => {
    lock = true;
  };
  for (const [asyncReducer] of routes) {
    lock = false;
    const promise = await asyncReducer.call(priv.context, action, handleLock);
    if (lock) {
      await promise;
    } else {
      promises.push(promise);
    }
  }
  if (promises.length) {
    await Promise.all(promises);
  }
}

async function handleRouteAction(priv, action) {
  const { type } = action;
  let stateChanged = false;
  let changedValues;
  const nextState = produce(priv.state, draftState => {
    priv.reducers.get(type)?.forEach((descriptor, reducer) => {
      reducer.call(priv.context, action, draftState);
    });
  });
  if (priv.state !== nextState) {
    stateChanged = true;
    changedValues = handleStateChange(priv.state, nextState);
    if (priv.hooks) {
      await handleAsyncHook('change', priv, priv.state, nextState, changedValues);
    }
    priv.state = nextState;
  }
  const routes = priv.routes.get(type);
  if (routes) await handleAsyncRoutes(priv, action, routes);
  return { stateChanged, changedValues };
}

async function handleAsyncActionHook(hook, priv, action) {
  let nextAction = action;
  if (priv.hooks?.[hook]) {
    for (const hookFn of priv.hooks[hook]) {
      const newAction = await hookFn.call(priv.context, action);
      if (typeof newAction === 'object') {
        nextAction = newAction;
      }
    }
  }
  return nextAction;
}

async function handleAsyncHook(hook, priv, ...args) {
  if (priv.hooks?.[hook]) {
    for (const hookFn of priv.hooks[hook]) {
      await hookFn.call(priv.context, ...args);
    }
  }
}

class StateManager {
  /**
   * The mid is the state modules id and used to identify it.
   */
  mid = undefined;

  constructor({ config, hooks, selectors }) {
    const self = this;

    const priv = {
      state: {},
      config: {},
      actions: {},
      routes: new Map(),
      reducers: new Map(),
      schema: new WeakMap(),
      components: new Map(),
    };

    ManagerPrivateState.set(self, priv);

    if (config) {
      Object.assign(priv.config, config);
    } else {
      i += 1;
      config.mid = `state-module-${i}`;
    }
    this.mid = config.mid;
    if (selectors) priv.selectors = Object.assign({}, selectors);
    if (hooks) priv.hooks = Object.assign({}, hooks);

    priv.context = {
      get state() {
        return self.state;
      },
      get actions() {
        return self.actions;
      },
      get selectors() {
        return self.selectors;
      },
      dispatch: self.dispatch,
    };
  }

  get components() {
    const priv = ManagerPrivateState.get(this);
    return [...priv.components.keys()];
  }

  get actions() {
    const priv = ManagerPrivateState.get(this);
    return { ...priv.actions };
  }

  dispatch = async _action => {
    const priv = ManagerPrivateState.get(this);
    if (!_action) {
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${priv.config.mid} | Tried to dispatch an empty action`);
    } else if (!_action.type) {
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
        priv.config.mid
      } | Tried to dispatch an action without a type property expects { type: string, ... }`);
    }

    let action = { ..._action };
    let stateChanged = false;
    let changedValues;

    try {
      if (priv.hooks) {
        action = await handleAsyncActionHook('before', priv, action);
        if (!action) {
          return;
        } else if (!action.type) {
          throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
            priv.config.mid
          } | A middleware hook mutated the "action" and it no longer has a type property.  Expects { type: string, ... }`);
        }
      }
      if (priv.reducers.has(action.type) || priv.routes.has(action.type)) {
        ({ stateChanged, changedValues } = await handleRouteAction(priv, action));
      }
      if (priv.hooks) {
        await handleAsyncHook('after', priv, stateChanged, changedValues);
      }
    } catch (e) {
      console.error(
        `[${MODULE_NAME}] | ERROR | Module ${priv.config.mid} | An Error occurred while dispatching action: `,
        action,
        e,
      );
      if (priv.hooks) {
        await handleAsyncHook('error', priv, e);
      }
      throw e;
    }
    return changedValues;
  };

  select = k => {
    const priv = ManagerPrivateState.get(this);
    return priv.selectors[k](priv.state);
  };

  connect = (withModules, withState, withDispatchers) => {
    const priv = ManagerPrivateState.get(this);
    const dispatchers = withDispatchers(priv.actions);
    return connectState(this, withModules, withState, dispatchers);
  };

  create = (...modules) => {
    const priv = ManagerPrivateState.get(this);
    modules.forEach(module => {
      /* Each Module must be added to the Manager */
      handleNewStateModule.call(this, priv, module);
    });
    return this;
  };
}

export default function State(stateProps) {
  return new StateManager(stateProps);
}
