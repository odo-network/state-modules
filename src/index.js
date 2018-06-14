import handleNewStateModule from './build';
import { MODULE_NAME, SELECTOR_CHILDREN, ManagerPrivateState } from './context';

import * as action from './actions';

import {
  buildSelectors,
  subscribeToAction,
  subscribeToSelector,
  getSelectorSubscription,
  parseModuleSettings,
} from './utils';

function buildPrivateState(config, hooks, selectors, dispatch) {
  const priv = {
    config,
    state: {},
    hooks,
    actions: {},
    helpers: Object.create(null),
    routes: new Map(),
    reducers: new Map(),
    schema: new WeakMap(),
    components: new Map(),
    queue: {
      creates: new Set(),
      resolves: new Set(),
    },
    // added dynamically when used
    // subscribers: new Map(),
    // selectors: new Map(),
  };
  priv.context = {
    config,
    get components() {
      return priv.components.keys();
    },
    get state() {
      return priv.state;
    },
    get actions() {
      return priv.actions;
    },
    get selectors() {
      return priv.selectors;
    },
    get scope() {
      return priv.scope;
    },
    get helpers() {
      return priv.helpers;
    },
    select: action.select.bind(priv),
    dispatch,
  };
  if (selectors) priv.selectors = Object.assign({}, selectors);
  return priv;
}

class StateManager {
  /**
   * The mid is the state modules id and used to identify it.
   */
  mid = undefined;

  constructor(_settings) {
    const settings = parseModuleSettings(_settings);
    this.mid = settings.config.mid;
    ManagerPrivateState.set(
      this,
      buildPrivateState(settings.config, settings.hooks, settings.selectors, this.dispatch),
    );
  }

  /**
   * Returns the components id's that have been added to the State Module.
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
  dispatch = _action => {
    const priv = ManagerPrivateState.get(this);
    return action.dispatch(priv, _action);
  };

  /**
   * Calls selectors and provides them with the current state.  When receiving a function
   * the function will receive the selectors object and expects a selector to be returned.
   *
   * @param {string | (selectors) => selector} key Which selector should be called
   */
  select = (k, props) => {
    const priv = ManagerPrivateState.get(this);
    return priv.context.select(k, props);
  };

  subscribeToSelector = (_selector, subscription, once) => {
    if (!_selector) return;
    let selector = _selector;
    const priv = ManagerPrivateState.get(this);
    if (typeof selector === 'object' && !selector[SELECTOR_CHILDREN] && !Array.isArray(selector)) {
      selector = buildSelectors(priv, undefined, selector);
    }
    return subscribeToSelector(priv, selector, once).subscribe(subscription);
  };

  subscribeToAction = (condition, subscription, once) => {
    const priv = ManagerPrivateState.get(this);
    if (typeof condition !== 'string' && !Array.isArray(condition) && typeof condition !== 'function') {
      throw new TypeError(`[${MODULE_NAME}] | ERROR | Module ${priv.config.mid} | Invalid subscription selector: "${String(condition)}"`);
    }
    return subscribeToAction(priv, condition, once).subscribe(subscription);
  };

  connect = (withSelectors, withDispatchers, onUpdate) => {
    const priv = ManagerPrivateState.get(this);
    const snapshot = {
      context: priv.context,
      actions: withDispatchers(priv.actions),
    };
    let selectors;
    let subscription;
    if (withSelectors.length === 1) {
      // when only using state-modules selectors, we can intelligently route
      // the updates so that we directly execute on updates and never
      // otherwise
      selectors = withSelectors(priv.selectors);
      subscription = this.subscribeToSelector(selectors, getSelectorSubscription(snapshot, onUpdate, selectors));
    } else {
      // when the connector directly selects the state we can not optimize
      // the subscription and must provide the selected state every time
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
        priv.config.mid
      } | Second state selection argument (state) is not yet supported`);
      // selectors = withSelectors(priv.selectors, priv.state);

      // TODO | Finish
    }
    return subscription;
  };

  create = (...modules) => this.component(...modules);

  component = (...modules) => {
    const priv = ManagerPrivateState.get(this);
    const promises = [];
    modules.forEach(module => {
      /* Each Module must be added to the Manager */
      promises.push(handleNewStateModule(priv, module));
    });
    const promise = Promise.all(promises)
      .then(() => {
        priv.queue.creates.delete(promise);
        if (priv.queue.creates.size === 0 && priv.queue.resolves.size > 0) {
          priv.queue.resolves.forEach(p => p.resolve());
          priv.queue.resolves.clear();
        }
      })
      .catch(e => {
        priv.queue.creates.delete(promise);
        priv.queue.resolves.forEach(p => p.reject(e));
        priv.queue.resolves.clear();
      });
    priv.queue.creates.add(promise);
    return this;
  };

  resolve = () =>
    new Promise((resolve, reject) => {
      const priv = ManagerPrivateState.get(this);
      if (priv.queue.creates.size === 0) {
        return resolve();
      }
      priv.queue.resolves.add({ resolve, reject });
    });
}

export default function State(stateProps) {
  return new StateManager(stateProps);
}
