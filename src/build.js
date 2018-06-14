// TODO: Remove lodash as dependency

import mutate from 'immuta';
import toSnakeCase from 'to-redux-type';
import { MODULE_NAME, SELECTOR_CHILDREN } from './context';
import * as utils from './utils';

function handleBoundAction(...fnargs) {
  const createdAction = Object.assign({}, this.action);
  fnargs.forEach((arg, idx) => {
    if (idx < this.args.length) {
      createdAction[this.args[idx]] = arg;
    } else if (typeof arg === 'object' && !Array.isArray(arg)) {
      Object.assign(createdAction, arg);
    } else {
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${this.mid} | called action ${this.cid}.${
        createdAction.type
      } with too many arguments - argument ${idx} and onward are invalid.`);
    }
  });
  return this.dispatch(createdAction);
}

function handleBuildState(priv, component, state) {
  if (!state) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[${MODULE_NAME}] | WARN | handleBuildState received empty state`);
    }
    return;
  }
  priv.state = mutate(priv.state, draftState => {
    utils.merge(draftState, state, priv, component);
  });
}

function handleBuildActions(priv, component, actions, _obj) {
  const obj = _obj || priv.actions;
  Object.keys(actions).forEach(_type => {
    let args = actions[_type];
    if (!Array.isArray(args) && typeof args === 'object') {
      obj[_type] = obj[_type] || {};
      return handleBuildActions(priv, component, args, obj[_type]);
    } else if (obj[_type]) {
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${priv.config.mid} | component action ${
        component.config.cid
      }.${_type} already exists on the module.`);
    } else if (args === null) {
      args = [];
    }
    const action = { type: `${component.config.prefix}${toSnakeCase(_type)}` };
    if (typeof args[0] === 'object') {
      Object.assign(action, args.shift());
    }
    obj[_type] = handleBoundAction.bind({
      dispatch: priv.context.dispatch,
      mid: priv.config.mid,
      cid: component.config.cid,
      action,
      args,
    });
  });
}

function handleBuildSelectors(priv, component) {
  if (!priv.selectors) {
    priv.selectors = {};
  }
  Object.keys(component.selectors).forEach(selectorID => {
    if (priv.selectors[selectorID]) {
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
        priv.config.mid
      } | Selector ID ${selectorID} was already added to the state module.`);
    }
    const children = new Set();
    const ancestors = [children];
    const selector = utils.buildSelectors(priv, component, component.selectors[selectorID], ancestors);
    if (typeof selector === 'object') {
      selector[SELECTOR_CHILDREN] = children;
    }
    priv.selectors[selectorID] = selector;
  });
}

function handleBuildReducers(priv, component) {
  // * Each key in schema indicates a piece of state we need to reduce.
  Object.keys(component.reducers).forEach(_type => {
    const type = `${component.config.prefix}${toSnakeCase(_type)}`;
    const set = priv.reducers.get(type) || new Set();
    set.add(component.reducers[_type]);
    priv.reducers.set(type, set);
  });
}

function handleBuildHelpers(priv, component) {
  Object.keys(component.helpers).forEach(helperID => {
    if (utils.hasProperty(priv.helpers, helperID)) {
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${priv.config.mid} | Component ${
        component.config.cid
      } | Defined routes but no matching effects exist.`);
    }
    priv.helpers[helperID] = component.helpers[helperID];
  });
}

function handleBuildRoutes(priv, component) {
  if (!component.effects && Object.keys(component.routes).length > 0) {
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${priv.config.mid} | Component ${
      component.config.cid
    } | Defined routes but no matching effects exist.`);
  }
  /* Routes define all the sagas to execute when a given type executes */
  Object.keys(component.routes).forEach(_type => {
    const type = `${component.config.prefix}${toSnakeCase(_type)}`;
    const set = priv.routes.get(type) || new Set();
    const effect = component.effects[component.routes[_type]];
    if (typeof effect !== 'function') {
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${priv.config.mid} | Component ${
        component.config.cid
      } | Route ${_type} defined in routes but no matching effect exists.`);
    }
    set.add(effect);
    priv.routes.set(type, set);
  });
}

function loadSynchronousComponentProperties(priv, component) {
  if (component.state) {
    handleBuildState(priv, component, component.state);
  }
  if (component.actions) {
    handleBuildActions(priv, component, component.actions);
  }
  if (component.selectors) {
    handleBuildSelectors(priv, component);
  }
  if (component.reducers) {
    handleBuildReducers(priv, component);
  }
  if (component.helpers) {
    handleBuildHelpers(priv, component);
  }
}

function loadAsynchronousComponentProperties(priv, component) {
  if (component.routes) {
    handleBuildRoutes(priv, component);
  }
  if (component.hooks && component.hooks.loads) {
    component.hooks.loads();
  }
}

async function loadComponentScope(priv, component) {
  if (!component.scope) return;
  if (!priv.scope) {
    priv.scope = {};
  }
  const scope = await component.scope();
  priv.scope[scope.id || component.config.scopeID || component.config.cid] = scope;
}

async function loadComponentScopeAndAsynchronousProperties(priv, component) {
  if (component.scope) {
    await loadComponentScope(priv, component);
  }
  loadAsynchronousComponentProperties(priv, component);
}

export default async function handleNewStateModule(priv, _component) {
  let component = _component;
  if (typeof component === 'function') {
    // TODO : Need to pass this function a configuration for the module.
    component = component(priv);
  }

  if (typeof component !== 'object') {
    return;
  } else if (typeof component.config !== 'object' || !component.config.cid) {
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
      priv.config.mid
    } | Component didn't have a config or Component.config.cid was not defined`);
  }

  if (priv.components.has(component.config.cid)) {
    /* Only allow each cid to be registered once - using symbols for modules may be best? */
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${priv.config.mid} | Component ${
      component.config.cid
    } has already been defined and may not be defined again`);
  }

  component.config.prefix = component.config.prefix ? `${toSnakeCase(component.config.prefix)}_` : '';

  priv.components.set(component.config.cid, component);

  loadSynchronousComponentProperties(priv, component);

  if (component.config.loadsOnAction) {
    // defer handling of this module until a specific type is imported - when this occurs we will still process
    // most values but will defer any async route handling for the component (and scope import) until the given
    // action is met
    utils.subscribeToAction(priv, component.config.loadsOnAction, true).subscribe({
      next() {
        loadComponentScopeAndAsynchronousProperties(priv, component);
      },
    });
    return;
  } else if (component.scope) {
    await loadComponentScope(priv, component);
  }

  loadAsynchronousComponentProperties(priv, component);
}
