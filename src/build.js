// TODO: Remove lodash as dependency
import _ from 'lodash';
import produce from 'immuta';
import toSnakeCase from 'to-redux-type';
import { MODULE_NAME, SAGA_LIFECYCLES } from './context';

function handleBoundAction(priv, cid, type, args, action, ...fnargs) {
  const createdAction = { type, ...action };
  fnargs.forEach((arg, idx) => {
    if (idx < args.length) {
      createdAction[args[idx]] = arg;
    } else if (typeof arg === 'object' && !Array.isArray(arg)) {
      Object.assign(createdAction, arg);
    } else {
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
        priv.config.mid
      } | called action ${cid}.${type} with too many arguments - argument ${idx} and onward are invalid.`);
    }
  });
  return priv.context.dispatch(createdAction);
}

function handleBuildState(priv, module, state) {
  if (!state) {
    console.warn(`[${MODULE_NAME}] | WARN | handleBuildState received empty state`);
    return;
  }

  priv.state = produce(priv.state, draftState => {
    _.mergeWith(draftState, state, (objValue, srcValue, key) => {
      if (typeof objValue !== 'object' && objValue !== undefined) {
        // TODO : Output proper error formatting
        console.error('FAIL: ', objValue, srcValue, key);
        throw new Error('ALREADY DEFINED');
      }
    });
  });
}

function handleBuildActions(priv, module, actions, _obj) {
  const obj = _obj || priv.actions;
  Object.keys(actions).forEach(_type => {
    if (!Array.isArray(actions[_type]) && typeof actions[_type] === 'object') {
      obj[_type] = obj[_type] || {};
      return handleBuildActions(priv, module, actions[_type], obj[_type]);
    } else if (obj[_type]) {
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${priv.config.mid} | component action ${
        module.config.cid
      }/**/${_type} already exists on the state module`);
    }
    const type = `${module.config.prefix}${toSnakeCase(_type)}`;
    const args = actions[_type] || [];
    const action = typeof args[0] === 'object' ? { ...args[0] } : {};
    obj[_type] = (...fnargs) => handleBoundAction(priv, module.config.cid, type, args, action, ...fnargs);
  });
}

export default function handleNewStateModule(priv, _module) {
  let module = _module;
  if (typeof _module === 'function') {
    // TODO : Need to pass this function a configuration for the module.
    module = _module();
  }

  if (typeof module !== 'object') {
    return;
  } else if (typeof module.config !== 'object' || !module.config.cid) {
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
      priv.config.mid
    } | Component didn't have a config or Component.config.cid was not defined`);
  }

  const { cid } = module.config;

  if (priv.components.has(cid)) {
    /* Only allow each cid to be registered once - using symbols for modules may be best? */
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
      priv.config.mid
    } | Component ${cid} has already been defined and may not be defined again`);
  }

  module.config.prefix = module.config.prefix ? `${toSnakeCase(module.config.prefix)}_` : '';

  priv.components.set(cid, module);

  const moduleDescriptor = {
    cid,
  };

  if (module.state) {
    /* Module handles part of our state */
    module.reduces = Object.keys(module.state);
    handleBuildState(priv, module, module.state);
  }

  if (module.reducers) {
    const reducers = { ...module.reducers };
    // * Each key in schema indicates a piece of state we need to reduce.
    Object.keys(reducers).forEach(_type => {
      const type = `${module.config.prefix}${toSnakeCase(_type)}`;
      const map = priv.reducers.get(type) || new Map();
      map.set(reducers[_type], moduleDescriptor);
      priv.reducers.set(type, map);
    });
  }

  if (module.routes) {
    const routes = { ...module.routes };
    /* Routes define all the sagas to execute when a given type executes */
    Object.keys(routes).forEach(_type => {
      const type = `${module.config.prefix}${toSnakeCase(_type)}`;
      const map = priv.routes.get(type) || new Map();
      const saga = module.sagas[routes[_type]];
      if (typeof saga !== 'function') {
        console.warn(`[${MODULE_NAME}] | WARN | Module ${priv.config.mid} | Route for component ${
          module.config.cid
        } not found in sagas: ${_type}`);
        return;
      }
      map.set(saga, moduleDescriptor);
      priv.routes.set(type, map);
    });
  }

  if (module.sagas) {
    /* If sagas are defined, check for lifecycle sagas */
    SAGA_LIFECYCLES.forEach(lifecycle => {
      if (typeof module.sagas[lifecycle] === 'function') {
        // TODO: Handle Lifecycles
      }
    });
  }

  if (module.actions) {
    const actions = { ...module.actions };
    if (!priv.actions) {
      priv.actions = {};
    }
    handleBuildActions(priv, module, actions);
  }

  if (module.selectors) {
    if (!priv.selectors) {
      priv.selectors = {};
    }
    Object.keys(module.selectors).forEach(selectorID => {
      if (priv.selectors[selectorID]) {
        throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
          priv.config.mid
        } | Selector ID ${selectorID} was already added to the state module.`);
      } else if (typeof module.selectors[selectorID] !== 'function') {
        throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
          priv.config.mid
        } | Selector ID ${selectorID} in ${cid} is not a function`);
      }
      priv.selectors[selectorID] = module.selectors[selectorID];
    });
  }
}
