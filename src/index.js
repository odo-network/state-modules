import handleNewStateModule from './build';
import { MODULE_NAME } from './context';

import { createConnection, defaultStateConnector } from './connect';

import { forceMergeState } from './handlers';
import * as action from './actions';
import * as utils from './utils';
import * as parse from './parse';

class StateModule {
  /**
   * The mid is the state modules id and used to identify it.  It will be automatically assigned
   * if none is provided during instatiation.
   */
  mid;

  #setup;

  #prevState;

  /**
   * Our maangers descriptorate state which should not be revealed publicly.  This will hold the context
   * of the StateManager.  We pass the "context" of this state to public reducer/effect calls.
   */
  #descriptor = {
    config: undefined,
    state: Object.create(null),
    hooks: undefined,
    actions: Object.create(null),
    helpers: Object.create(null),

    // stores reducers by the processed dispatch type such that Map(action.type => reducerFunction)
    reducers: new Map(),
    // stores each component that is added to the module.  This is used to allow a module to re-define itself and/or
    // hot reload (TODO) by comparing properties when changed and removing changed properties (if any).
    components: new Map(),
    // any effects that need to be handled asynchronously
    // effects: new Map(),
    // added dynamically when used
    // subscribers: new Map(),
    // selectors: new Map(),
    // queue: { creates: new Set(), resolves: new Set() }
  };

  constructor(setup) {
    this.#setup = setup;
    const { config, hooks, scope } = setup;
    const descriptor = this.#descriptor;
    this.mid = config.mid;
    descriptor.config = config;
    descriptor.hooks = hooks;
    if (typeof scope === 'object') {
      descriptor.scope = scope;
    }
    descriptor.context = Object.freeze({
      get config() {
        return descriptor.config;
      },
      get components() {
        return Array.from(descriptor.components.keys());
      },
      get state() {
        return descriptor.state;
      },
      get actions() {
        return descriptor.actions;
      },
      get selectors() {
        return descriptor.selectors;
      },
      get scope() {
        return descriptor.scope;
      },
      get helpers() {
        return descriptor.helpers;
      },
      select: action.select.bind(descriptor),
      dispatch: this.dispatch,
    });
  }

  /**
   * Returns the components id's that have been added to the State Module.
   */
  get components() {
    return Array.from(this.#descriptor.components.keys());
  }

  /**
   * Returns the actions of the State Module which are wrapped in a dispatch() call.
   */
  get actions() {
    return { ...this.#descriptor.actions };
  }

  get selectors() {
    if (!this.#descriptor.selectors) return {};
    return { ...this.#descriptor.selectors };
  }

  get context() {
    return this.#descriptor.context;
  }

  get scope() {
    return this.#descriptor.scope;
  }

  reset = (setup = this.#setup) => {
    if (this.#descriptor.subscribers) {
      if (this.#descriptor.subscribers.actions.size) {
        this.#descriptor.subscribers.actions.forEach(subscription => {
          subscription.cancel();
        });
      }
    }

    this.#prevState = this.#descriptor.state;

    Object.assign(this.#descriptor, {
      config: setup.config,
      hooks: undefined,
      state: Object.create(null),
      actions: Object.create(null),
      helpers: Object.create(null),
    });

    this.#descriptor.reducers.clear();
    this.#descriptor.components.clear();

    if (this.#descriptor.selectors) {
      delete this.#descriptor.selectors;
    }
    if (this.#descriptor.effects) {
      this.#descriptor.effects.clear();
    }
    if (this.#descriptor.queue) {
      delete this.#descriptor.queue;
    }
  };

  /*
    Rehydrates all subscribers to update their values.
    Generally this will only be done when hot reloading
    or resetting state modules.
  */
  rehydrate = () => {
    /* We need to set the previous state back onto the
       state so the reload is "hot".  This means that
       updates to the default state in components may
       not work as expected.  Fixing this would mean a
       custom implementation of immuta's `mergeWithDraft`
       which would need to determine what values were manually
       changed on defaultState and override this function.

       This seems like a huge perf drain.  For the most part
       changing these values will always require a refresh.

       Another option is to implement a versioning option which
       would essentially identify a component as dirty and force
       use the new components values instead. */
    if (this.#prevState) {
      forceMergeState(this.#descriptor, this.#prevState);
      this.#prevState = undefined;
    }
    if (this.#descriptor.subscribers && this.#descriptor.subscribers.updates.size) {
      action.runAllUpdateSubscribers(this.#descriptor.context, this.#descriptor.subscribers);
    }
  };

  /**
   * Dispatches an action to be handled by the components within the State Module.
   * @param {Object} action
   */
  dispatch = _action => action.dispatch(this.#descriptor, _action);

  /**
   * Calls selectors and provides them with the current state.  When receiving a function
   * the function will receive the selectors object and expects a selector to be returned.
   *
   * @param {string | (selectors) => selector} key Which selector should be called
   */
  select = (k, props) => this.#descriptor.context.select(k, props, this);

  addScope = scope => {
    if (!this.#descriptor.scope) {
      this.#descriptor.scope = {};
    }
    Object.assign(this.#descriptor.scope, scope);
  };

  createConnector = (connector = this.#descriptor.config.connector || defaultStateConnector) => {
    if (typeof connector !== 'function') {
      throw new TypeError(
        `[${MODULE_NAME}] | ERROR | Module ${
          this.#descriptor.config.mid
        } | Expected a connector setup in state.config.connector or provided to state.connect().Connector should be a function.`,
      );
    }
    return (withSelectors, withDispatchers) => this.connect(
      withSelectors,
      withDispatchers,
      connector,
    );
  };

  /**
   * Returns the defined connector which can be used to create subscriptions
   * based on the received values.
   */
  connect = (
    withSelectors,
    withDispatchers,
    connector = this.#descriptor.config.connector || defaultStateConnector,
  ) => {
    if (typeof connector !== 'function') {
      throw new TypeError(
        `[${MODULE_NAME}] | ERROR | Module ${
          this.#descriptor.config.mid
        } | Expected a connector setup in state.config.connector or provided to state.connect().Connector should be a function.`,
      );
    }
    return createConnection(this.#descriptor, withSelectors, withDispatchers, connector);
  };

  /**
   * An alias for StateModule.component
   */
  create = component => this.component(component);

  /**
   * Creates a State Component that will be merged into the StateModule.  If asynchronous, will add
   * the promise so that `state.resolve()` returns a Promise guaranteeing it is resolved before
   * resolving.
   */
  component = (component, ...args) => {
    const descriptor = this.#descriptor;
    const response = handleNewStateModule(descriptor, component, args);
    if (response && response.then) {
      if (!descriptor.queue) {
        descriptor.queue = {
          creates: new Set(),
          resolves: new Set(),
        };
      }
      descriptor.queue.creates.add(response);
      response
        .then(() => {
          descriptor.queue.creates.delete(response);
          if (descriptor.queue.resolves.size > 0 && descriptor.queue.creates.size === 0) {
            descriptor.queue.resolves.forEach(p => p.resolve(1));
            descriptor.queue.resolves.clear();
          }
        })
        .catch(e => {
          descriptor.queue.creates.delete(response);
          descriptor.queue.resolves.forEach(p => p.reject(e));
          descriptor.queue.resolves.clear();
        });
    }
    return this;
  };

  /**
   * Composes multiple components at once.  This can also help when building many asynchronously handled
   * components as we are able to bundle the resulting promises rather than needing to handle many within
   * the processing queue.
   */
  compose = (...components) => {
    const descriptor = this.#descriptor;
    const promises = [];
    components.forEach(component => {
      /* Each Module must be added to the Manager */
      const response = handleNewStateModule(descriptor, component);
      if (response && response.then) {
        promises.push(response);
      }
    });
    if (promises.length) {
      if (!descriptor.queue) {
        descriptor.queue = {
          creates: new Set(),
          resolves: new Set(),
        };
      }
      const promise = Promise.all(promises)
        .then(() => {
          descriptor.queue.creates.delete(promise);
          if (descriptor.queue.creates.size === 0 && descriptor.queue.resolves.size > 0) {
            descriptor.queue.resolves.forEach(p => p.resolve(1));
            descriptor.queue.resolves.clear();
          }
        })
        .catch(e => {
          descriptor.queue.creates.delete(promise);
          descriptor.queue.resolves.forEach(p => p.reject(e));
          descriptor.queue.resolves.clear();
        });
      descriptor.queue.creates.add(promise);
    }
    return this;
  };

  /**
   * Allows subscribing to actions or values within the state directly.
   */
  subscribe = (to, condition, once) => {
    switch (to) {
      case 'action':
        return utils.subscribeToAction(this.#descriptor, condition, once);
      case 'selector': {
        const subscriber = {
          context: this.#descriptor.context,
          selectors: utils.buildSelectors(this.#descriptor, undefined, condition),
        };
        return {
          subscribe: subscription => utils.subscribeToSelector(this.#descriptor, subscriber.selectors, once).subscribe({
            next(actions, props) {
              subscriber.state = actions.getState(subscriber.selectors, props);
              if (subscription.next) {
                subscription.next(subscriber);
              }
            },
            complete(reason) {
              if (subscription.complete) {
                subscription.complete(reason);
              }
            },
          }),
        };
      }
      default: {
        throw new TypeError(
          `[${MODULE_NAME}] | ERROR | Module ${
            this.#descriptor.config.mid
          } | Can not connect to module, no connector has been defined.`,
        );
      }
    }
  };

  print = () => {
    console.group('--- state-modules data ---');
    // console.log('Descriptor: ', this.#descriptor);
    console.groupEnd();
  };

  resolve = () => new Promise((resolve, reject) => {
    const descriptor = this.#descriptor;
    if (!descriptor.queue || descriptor.queue.creates.size === 0) {
      return resolve(0);
    }
    descriptor.queue.resolves.add({ resolve, reject });
  });
}

export default function createStateModule(stateProps = {}) {
  const settings = parse.moduleSettings(stateProps);
  // if (StateManagers.has(settings.config.mid)) {
  //   if (module && Object.prototype.hasOwnProperty.call(module, 'hot')) {
  //     // hot reloading
  //   } else {
  //     throw new Error(`[${MODULE_NAME}] | ERROR | Module ID ${
  //       settings.config.mid
  //     } already exists.  If you wanted to modify an existing module, use state.configure instead.`);
  //   }
  // }
  const manager = new StateModule(settings);
  // StateManagers.set(settings.config.mid, [manager, stateProps, settings]);

  return manager;
}
