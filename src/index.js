import handleNewStateModule from './build';
import { MODULE_NAME, emptyFrozenObject } from './context';

import * as action from './actions';
import * as utils from './utils';

function createConnectSubscription(descriptor, subscriber) {
  return {
    /**
     * Starts the subscription and begins calling the callback whenever a match is found
     */
    subscribe: (subscription, once = false) =>
      utils.subscribeToSelector(descriptor, subscriber.selectors, once).subscribe({
        next(actions) {
          subscriber.state = actions.getState(subscriber.selectors);
          subscription.next(subscriber);
        },
        complet() {
          if (subscription.complete) {
            subscription.complete();
          }
        },
      }),
  };
}

function createConnection(descriptor, data, _connector) {
  const connector = _connector || descriptor.config.connector;

  if (!connector) {
    throw new TypeError(`[${MODULE_NAME}] | ERROR | Module ${
      descriptor.config.mid
    } | Can not connect to module, no connector has been defined.`);
  }

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
    context: descriptor.context,
    dispatchers: data.withDispatchers ? data.withDispatchers(descriptor.actions) : emptyFrozenObject,
    selectors: utils.buildSelectors(
      descriptor,
      undefined,
      data.withSelectors(descriptor.selectors, descriptor.state),
    ),
  };

  if (data.withMerger) {
    subscriber.merger = data.withMerger;
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
    routes: new Map(),
    reducers: new Map(),
    components: new Map(),
    queue: {
      creates: new Set(),
      resolves: new Set(),
    },
    // added dynamically when used
    // subscribers: new Map(),
    // selectors: new Map(),
  };

  constructor(_settings) {
    const { config, hooks, selectors } = utils.parseModuleSettings(_settings);
    const descriptor = this.#descriptor;
    this.mid = config.mid;
    descriptor.config = config;
    descriptor.hooks = hooks;
    if (selectors) {
      descriptor.selectors = Object.assign({}, selectors);
    }
    descriptor.context = {
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
    };
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
  connect = (connector = this.#descriptor.config.connector) => (withSelectors, withDispatchers, withMerger) =>
    createConnection(
      this.#descriptor,
      {
        withSelectors,
        withDispatchers,
        withMerger,
      },
      connector,
    );

  create = (...components) => Reflect.apply(this.component, this, components);

  component = (...components) => {
    const descriptor = this.#descriptor;
    const promises = [];
    components.forEach(component => {
      /* Each Module must be added to the Manager */
      promises.push(handleNewStateModule(descriptor, component));
    });
    const promise = Promise.all(promises)
      .then(() => {
        descriptor.queue.creates.delete(promise);
        if (descriptor.queue.creates.size === 0 && descriptor.queue.resolves.size > 0) {
          descriptor.queue.resolves.forEach(p => p.resolve());
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
    return this;
  };

  resolve = () =>
    new Promise((resolve, reject) => {
      const descriptor = this.#descriptor;
      if (descriptor.queue.creates.size === 0) {
        return resolve();
      }
      descriptor.queue.resolves.add({ resolve, reject });
    });
}

export default function createStateModule(stateProps) {
  return new StateModule(stateProps);
}
