import mutate from 'immuta';
import toSnakeCase from 'to-redux-type';
import { MODULE_NAME, STATE_SELECTOR } from './context';
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

function handleBuildState(descriptor, component, state) {
  if (!state) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[${MODULE_NAME}] | WARN | handleBuildState received empty state`);
    }
    return;
  }
  descriptor.state = mutate(descriptor.state, draftState => {
    utils.merge(draftState, state, descriptor, component);
  });
}

function handleBuildActions(descriptor, component, actions, _obj) {
  const obj = _obj || descriptor.actions;
  Object.keys(actions).forEach(_type => {
    let args = actions[_type];
    if (!Array.isArray(args) && typeof args === 'object') {
      obj[_type] = obj[_type] || {};
      return handleBuildActions(descriptor, component, args, obj[_type]);
    } else if (obj[_type]) {
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${descriptor.config.mid} | component action ${
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
      dispatch: descriptor.context.dispatch,
      mid: descriptor.config.mid,
      cid: component.config.cid,
      action,
      args,
    });
  });
}

function handleBuildSelectors(descriptor, component) {
  if (!descriptor.selectors) {
    descriptor.selectors = {
      [STATE_SELECTOR]: {
        children: new Set(),
      },
    };
  }

  const ancestors = new Set().add(descriptor.selectors[STATE_SELECTOR]);

  Object.keys(component.selectors).forEach(selectorID => {
    if (descriptor.selectors[selectorID]) {
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
        descriptor.config.mid
      } | Selector ID ${selectorID} was already added to the state module.`);
    }
    descriptor.selectors[selectorID] = utils.buildSelectors(
      descriptor,
      component,
      component.selectors[selectorID],
      ancestors,
    );
  });

  // console.log('Selectors: ', descriptor.selectors[STATE_SELECTOR]);
}

function handleBuildReducers(descriptor, component) {
  // * Each key in schema indicates a piece of state we need to reduce.
  Object.keys(component.reducers).forEach(_type => {
    const type = `${component.config.prefix}${toSnakeCase(_type)}`;
    const set = descriptor.reducers.get(type) || new Set();
    set.add(component.reducers[_type]);
    descriptor.reducers.set(type, set);
  });
}

function handleBuildHelpers(descriptor, component) {
  Object.keys(component.helpers).forEach(helperID => {
    if (utils.hasProperty(descriptor.helpers, helperID)) {
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${descriptor.config.mid} | Component ${
        component.config.cid
      } | Defined routes but no matching effects exist.`);
    }
    descriptor.helpers[helperID] = component.helpers[helperID];
  });
}

function handleBuildRoutes(descriptor, component) {
  if (!component.effects && Object.keys(component.routes).length > 0) {
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${descriptor.config.mid} | Component ${
      component.config.cid
    } | Defined routes but no matching effects exist.`);
  }
  /* Routes define all the sagas to execute when a given type executes */
  for (const _type in component.routes) {
    if (Object.prototype.hasOwnProperty.call(component.routes, _type)) {
      const type = `${component.config.prefix}${toSnakeCase(_type)}`;
      const set = descriptor.routes.get(type) || new Set();
      const effect = component.effects[component.routes[_type]];
      if (typeof effect !== 'function') {
        throw new Error(`[${MODULE_NAME}] | ERROR | Module ${descriptor.config.mid} | Component ${
          component.config.cid
        } | Route ${_type} defined in routes but no matching effect exists.`);
      }
      set.add(effect);
      descriptor.routes.set(type, set);
    }
  }
}

function loadSynchronousComponentProperties(descriptor, component) {
  if (component.state) {
    handleBuildState(descriptor, component, component.state);
  }
  if (component.actions) {
    handleBuildActions(descriptor, component, component.actions);
  }
  if (component.selectors) {
    handleBuildSelectors(descriptor, component);
  }
  if (component.reducers) {
    handleBuildReducers(descriptor, component);
  }
  if (component.helpers) {
    handleBuildHelpers(descriptor, component);
  }
}

function loadAsynchronousComponentProperties(descriptor, component) {
  if (component.routes) {
    handleBuildRoutes(descriptor, component);
  }
  if (component.hooks && component.hooks.loads) {
    component.hooks.loads();
  }
}

async function loadComponentScope(descriptor, component) {
  if (!component.scope) return;
  if (!descriptor.scope) {
    descriptor.scope = {};
  }
  const scope = await component.scope();
  descriptor.scope[scope.id || component.config.scopeID || component.config.cid] = scope;
}

async function loadComponentScopeAndAsynchronousProperties(descriptor, component) {
  if (component.scope) {
    await loadComponentScope(descriptor, component);
  }
  loadAsynchronousComponentProperties(descriptor, component);
}

export default async function handleNewStateModule(descriptor, _component) {
  let component = _component;
  if (typeof component === 'function') {
    // TODO : Need to pass this function a configuration for the module.
    component = component(descriptor);
  }

  if (typeof component !== 'object') {
    return;
  } else if (typeof component.config !== 'object' || !component.config.cid) {
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
      descriptor.config.mid
    } | Component didn't have a config or Component.config.cid was not defined`);
  }

  if (descriptor.components.has(component.config.cid)) {
    /* Only allow each cid to be registered once - using symbols for modules may be best? */
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${descriptor.config.mid} | Component ${
      component.config.cid
    } has already been defined and may not be defined again`);
  }

  component.config.prefix = component.config.prefix ? `${toSnakeCase(component.config.prefix)}_` : '';

  descriptor.components.set(component.config.cid, component);

  loadSynchronousComponentProperties(descriptor, component);

  if (component.config.loadsOnAction) {
    // defer handling of this module until a specific type is imported - when this occurs we will still process
    // most values but will defer any async route handling for the component (and scope import) until the given
    // action is met
    utils.subscribeToAction(descriptor, component.config.loadsOnAction, true).subscribe({
      next() {
        loadComponentScopeAndAsynchronousProperties(descriptor, component);
      },
    });
    return;
  } else if (component.scope) {
    await loadComponentScope(descriptor, component);
  }

  loadAsynchronousComponentProperties(descriptor, component);
}
