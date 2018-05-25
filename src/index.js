// ? Consider implementing lightweight replacement of immer?
import produce from 'immer';
import handleNewStateModule from './build';
import { MODULE_NAME } from './context';
import diff from './diff';

// Used for storing the private methods and properties of each manager
const ManagerPrivateState = new WeakMap();

// Used for automatic id assignment of state modules.
let i = 0;

/**
 * Called when the state is changed during an action dispatch.
 * Builds a diff of the changed values and returns them.  Any other handling
 * of changed state should occur here.
 *
 * @param {Object} priv The State Module's private state
 * @param {Object} prevState Previous State
 * @param {Object} nextState Changed State
 */
async function handleStateChange(priv, prevState, nextState) {
  const changedValues = diff(nextState, prevState);
  if (priv.hooks) {
    await handleAsyncHook('change', priv, priv.state, nextState, changedValues);
  }
  // eslint-disable-next-line no-param-reassign
  priv.state = nextState;
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
    changedValues = handleStateChange(priv, priv.state, nextState);
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

  if (!nextAction.type) {
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
      priv.config.mid
    } | A middleware hook mutated the "action" and it no longer has a type property.  Expects { type: string, ... }`);
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
      priv.config.mid = `state-module-${i}`;
    }
    this.mid = config.mid;

    if (selectors) priv.selectors = Object.assign({}, selectors);
    if (hooks) priv.hooks = Object.assign({}, hooks);

    priv.context = {
      get state() {
        return priv.state;
      },
      get actions() {
        return priv.actions;
      },
      get selectors() {
        return priv.selectors;
      },
      dispatch: self.dispatch,
    };
  }

  /**
   * Returns the components that have been added to the State Module.
   */
  get components() {
    const priv = ManagerPrivateState.get(this);
    return [...priv.components.keys()];
  }

  /**
   * Returns the actions of the State Module which are wrapped in a dispatch() call.
   */
  get actions() {
    const priv = ManagerPrivateState.get(this);
    return { ...priv.actions };
  }

  /**
   * Dispatches an action to be handled by the components within the State Module.
   * @param {Object} action
   */
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
        if (!action) return;
      }
      if (priv.reducers.has(action.type) || priv.routes.has(action.type)) {
        ({ stateChanged, changedValues } = await handleRouteAction(priv, action));
      }
      await handleAsyncHook('after', priv, stateChanged, changedValues);
    } catch (e) {
      console.error(
        `[${MODULE_NAME}] | ERROR | Module ${priv.config.mid} | An Error occurred while dispatching action: `,
        action,
        e,
      );
      await handleAsyncHook('error', priv, e);
      throw e;
    }
    return changedValues;
  };

  /**
   * Calls selectors and provides them with the current state.  When receiving a function
   * the function will receive the selectors object and expects a selector to be returned.
   *
   * @param {string | (selectors) => selector} key Which selector should be called
   */
  select = k => {
    const priv = ManagerPrivateState.get(this);
    if (typeof k === 'function') {
      return k(priv.selectors)(priv.state);
    }
    return priv.selectors[k](priv.state);
  };

  /**
   * Connect the State Module to some function using a higher-order function.
   * Generally used with React to connect to components using react-state-modules
   *
   * @param {} withState
   * @param {} withDispatchers
   */
  connect = (withState, withDispatchers) => {
    const priv = ManagerPrivateState.get(this);
    if (typeof priv.config.connect !== 'function') {
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
        priv.config.mid
      } | Connect was called on a module which was not provides a config.connect property.  You likely need to import "react-state-modules" and provide it to config.connect`);
    }
    const dispatchers = withDispatchers(priv.actions);
    return priv.config.connect(this, withState, dispatchers);
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
