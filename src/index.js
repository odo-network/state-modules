import handleNewStateModule from './build';
import { MODULE_NAME, STATE_SELECTOR, emptyFrozenObject } from './context';

import * as action from './actions';
import * as utils from './utils';

/**
 *
 * @param {*} descriptor
 * @param {*} subscriber
 */
function createConnectSubscription(descriptor, subscriber) {
  // if the connector is not dynamic, we are able to
  let lastUpdateID = -1;
  let memoizedState;
  return {
    /**
     * Starts the subscription and begins calling the callback whenever the connected selectors are modified in any way.
     */
    subscribe: (childSubscription, once = false) =>
      utils.subscribeToSelector(descriptor, subscriber.selectors, once).subscribe({
        next(memoizedActions, props) {
          // when we do not have dynamic selectors we can guarantee that all connected components will have the same state.  In this case
          // we do not want to process the same selectors over and over.  Instead we are able to directly memoize the state based on the
          // connected component so that any further handlers that are called can directly return that value instead.
          if (!subscriber.dynamic) {
            if (memoizedActions.updateID !== lastUpdateID) {
              lastUpdateID = memoizedActions.updateID;
              memoizedState = memoizedActions.getState(subscriber.selectors, props);
            }
            return childSubscription.next(memoizedState, memoizedActions.updateID);
          }
          // when we are using dynamic selectors the state will depend on the props of each subscriber at the time.  In this case we can only
          // memoize globally using the memoizedActions send to us.  This will memoize based on identical selector calls made across components
          // rather than for all instances of the same component.
          return childSubscription.next(
            memoizedActions.getState(subscriber.selectors, props),
            memoizedActions.updateID,
          );
        },
        complete(reason) {
          memoizedState = undefined;
          if (childSubscription.complete) {
            childSubscription.complete(reason, subscriber);
          }
        },
      }),
    /**
     * Allows retrieval of the state represented by the given selectors immediately after
     * connecting the component. This is generally used so that the default state that is
     * selected can be given on an initial render of the connected UI.
     *
     * @param {?SelectorProps} props Optionally provide props to feed to any dynamic selectors
     */
    getSelectorState: (props, forceUpdateState) => {
      if (!subscriber.dynamic) {
        if (!memoizedState || forceUpdateState) {
          memoizedState = utils.getSelectedState(descriptor.state, subscriber.selectors, props);
        }
        return memoizedState;
      }
      return utils.getSelectedState(descriptor.state, subscriber.selectors, props);
    },
  };
}

/**
 *
 * @param {*} descriptor
 * @param {*} data
 * @param {*} _connector
 */
function createConnection(descriptor, data, _connector) {
  const connector = _connector || descriptor.config.connector;

  if (data.withSelectors.length === 1) {
    // do something?
  } else {
    // when the connector directly selects the state we can not optimize
    // the subscription and must provide the selected state every time
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
      descriptor.config.mid
    } | Second state selection argument (state) is not yet supported`);
    // selectors = withSelectors(descriptor.selectors, descriptor.state);
    // TODO | Finish
  }

  const subscriber = {
    dynamic: false,
    context: descriptor.context,
    dispatchers: data.withDispatchers ? data.withDispatchers(descriptor.actions) : emptyFrozenObject,
    selectors: utils.buildSelectors(
      descriptor,
      undefined,
      data.withSelectors(descriptor.selectors, descriptor.state),
    ),
  };

  if (subscriber.selectors[STATE_SELECTOR].dynamic) {
    subscriber.dynamic = true;
  }

  return connector(subscriber, createConnectSubscription(descriptor, subscriber));
}

class StateModule {
  /**
   * The mid is the state modules id and used to identify it.  It will be automatically assigned
   * if none is provided during instatiation.
   */
  mid;
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

  constructor(_settings) {
    const { config, hooks } = utils.parseModuleSettings(_settings);
    const descriptor = this.#descriptor;
    this.mid = config.mid;
    descriptor.config = config;
    descriptor.hooks = hooks;
    descriptor.context = Object.freeze({
      config,
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

  get context() {
    return this.#descriptor.context;
  }

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
  select = (k, props) => this.#descriptor.context.select(k, props);

  /**
   * Returns a function that can be used to connect to the state module using the
   * given connector.
   */
  connect = (connector = this.#descriptor.config.connector) => {
    if (typeof connector !== 'function') {
      throw new TypeError(`[${MODULE_NAME}] | ERROR | Module ${
        this.#descriptor.config.mid
      } | Expected a connector setup in state.config.connector or provided to state.connect().  Connector should be a function.`);
    }
    return (withSelectors, withDispatchers, withMerger) =>
      createConnection(
        this.#descriptor,
        {
          withSelectors,
          withDispatchers,
          withMerger,
        },
        connector,
      );
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
  component = component => {
    const descriptor = this.#descriptor;
    const response = handleNewStateModule(descriptor, component);
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
          throw e;
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
          throw e;
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
          subscribe: subscription =>
            utils.subscribeToSelector(this.#descriptor, subscriber.selectors, once).subscribe({
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
        throw new TypeError(`[${MODULE_NAME}] | ERROR | Module ${
          this.#descriptor.config.mid
        } | Can not connect to module, no connector has been defined.`);
      }
    }
  };

  resolve = () =>
    new Promise((resolve, reject) => {
      const descriptor = this.#descriptor;
      if (!descriptor.queue || descriptor.queue.creates.size === 0) {
        return resolve(0);
      }
      descriptor.queue.resolves.add({ resolve, reject });
    });
}

export default function createStateModule(stateProps) {
  return new StateModule(stateProps);
}
