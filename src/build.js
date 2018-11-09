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
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${this.mid} | called action "${this.cid}.${
        createdAction.type
      }" with too many arguments - argument ${idx} and onward are invalid.`);
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
  for (const _type in actions) {
    if (Object.prototype.hasOwnProperty.call(actions, _type)) {
      let args = actions[_type];
      if (!Array.isArray(args) && typeof args === 'object') {
        obj[_type] = obj[_type] || {};
        return handleBuildActions(descriptor, component, args, obj[_type]);
      }
      if (obj[_type]) {
        throw new Error(`[${MODULE_NAME}] | ERROR | Module ${descriptor.config.mid} | component action "${
          component.config.cid
        }.${_type}" already exists on the module.`);
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
    }
  }
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

  for (const selectorID of Object.keys(component.selectors)) {
    if (descriptor.selectors[selectorID]) {
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
        descriptor.config.mid
      } | Selector ID "${selectorID}" was already added to the state module.`);
    }
    descriptor.selectors[selectorID] = utils.buildSelectors(
      descriptor,
      component,
      component.selectors[selectorID],
      ancestors,
    );
  }
}

function handleBuildReducers(descriptor, component) {
  // * Each key in schema indicates a piece of state we need to reduce.
  for (const _type of Object.keys(component.reducers)) {
    const type = `${component.config.prefix}${toSnakeCase(_type)}`;
    const map = descriptor.reducers.get(type) || new Map();
    map.set(component.config.cid, component.reducers[_type]);
    descriptor.reducers.set(type, map);
  }
}

function handleBuildHelpers(descriptor, component) {
  for (const helperID of Object.keys(component.helpers)) {
    if (utils.hasProperty(descriptor.helpers, helperID)) {
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${descriptor.config.mid} | Component ${
        component.config.cid
      } | Defined routes but no matching effects exist.`);
    }
    descriptor.helpers[helperID] = component.helpers[helperID];
  }
}

function handleBuildEffects(descriptor, component) {
  if (!descriptor.effects) {
    descriptor.effects = new Map();
  }
  /* Routes define all the sagas to execute when a given type executes */
  for (const _type of Object.keys(component.effects)) {
    const type = `${component.config.prefix}${toSnakeCase(_type)}`;
    const map = descriptor.effects.get(type) || new Map();
    const effect = component.effects[_type];
    if (typeof effect !== 'function') {
      throw new Error(`[${MODULE_NAME}] | ERROR | Module ${descriptor.config.mid} | Component ${
        component.config.cid
      } | Route "${_type}" defined in routes but no matching effect exists.`);
    }
    map.set(component.config.cif, effect);
    descriptor.effects.set(type, map);
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

function loadAsynchronousComponentProperties(descriptor, component, args) {
  if (component.effects) {
    handleBuildEffects(descriptor, component);
  }
  if (component.hooks && component.hooks.loads) {
    component.hooks.loads(descriptor, ...args);
  }
}

async function loadComponentScope(descriptor, component, args) {
  try {
    if (!descriptor.scope) {
      descriptor.scope = {};
    }
    const scope = await component.scope.apply(descriptor.context, args);
    if (scope) {
      descriptor.scope[component.config.scopeID || component.config.cid] = scope;
    }
  } catch (e) {
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${descriptor.config.mid} | Component ${
      component.config.cid
    } | Error while attempting to load scope: "${e.message}"`);
  }
}

async function loadComponentScopeAndAsynchronousProperties(descriptor, component, args) {
  if (component.scope) {
    await loadComponentScope(descriptor, component, args);
  }
  loadAsynchronousComponentProperties(descriptor, component, args);
}

function verifyStateComponent(descriptor, _component) {
  let component = _component;
  if (typeof component === 'function') {
    // TODO : Need to pass this function a configuration for the module.
    component = component(descriptor);
  }

  if (typeof component !== 'object') {
    return;
  }
  if (typeof component.config !== 'object' || !component.config.cid) {
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
      descriptor.config.mid
    } | Component didn't have a config or Component.config.cid was not defined`);
  }

  return component;
}

export default function handleNewStateComponent(descriptor, _component, args) {
  const component = verifyStateComponent(descriptor, _component);

  if (descriptor.components.has(component.config.cid)) {
    /* Only allow each cid to be registered once - using symbols for modules may be best? */
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${descriptor.config.mid} | Component "${
      component.config.cid
    }" has already been defined and may not be defined again`);
  }

  component.config.prefix = component.config.prefix ? `${toSnakeCase(component.config.prefix)}_` : '';

  descriptor.components.set(component.config.cid, component);

  loadSynchronousComponentProperties(descriptor, component, args);

  if (component.config.loadsOnAction) {
    // defer handling of this module until a specific type is imported - when this occurs we will still process
    // most values but will defer any async route handling for the component (and scope import) until the given
    // action is met
    utils.subscribeToAction(descriptor, component.config.loadsOnAction, true).subscribe({
      next() {
        loadComponentScopeAndAsynchronousProperties(descriptor, component, args);
      },
    });
    return;
  }
  if (component.scope) {
    return loadComponentScope(descriptor, component, args).then(() =>
      loadAsynchronousComponentProperties(descriptor, component, args));
  }

  return loadAsynchronousComponentProperties(descriptor, component, args);
}

export function handleRebuildStateComponent(descriptor, _component) {
  const component = verifyStateComponent(descriptor, _component);

  if (!descriptor.components.has(component.config.cid)) {
    /* If it doesnt exist then rebuild builds a new component */
    return handleNewStateComponent(descriptor, _component);
  }

  component.config.prefix = component.config.prefix ? `${toSnakeCase(component.config.prefix)}_` : '';

  descriptor.components.set(component.config.cid, component);

  if (component.reducers) {
    handleBuildReducers(descriptor, component);
  }
}
