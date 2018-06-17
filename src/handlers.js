import mutate from 'immuta';
import { MODULE_NAME } from './context';

const routePromises = new Set();
let lock = false;

function handleLock(value) {
  lock = !!value;
}

export async function asyncRoutes(descriptor, action) {
  const routes = descriptor.routes.get(action.type);

  for (const asyncReducer of routes) {
    lock = false;
    const promise = asyncReducer.call(descriptor.context, action, handleLock);
    if (lock) {
      await promise;
    } else {
      routePromises.add(promise);
    }
  }

  if (routePromises.size > 0) {
    const pall = Promise.all(routePromises);
    routePromises.clear();
    await pall;
  }
}

export function routeAction(descriptor, action) {
  let changedValues;
  const prevState = descriptor.state;

  mutate(
    prevState,
    draftState => {
      descriptor.reducers.get(action.type).forEach((_, reducer) => {
        reducer.call(descriptor.context, action, draftState);
      });
    },
    // Executed only when values are changed by the reducer calls above
    (nextState, changedMap) => {
      changedValues = [...changedMap.keys()].map(k => k.join('.'));
      descriptor.state = nextState;
      if (descriptor.hooks && descriptor.hooks.change) {
        hook('change', descriptor, action, prevState, changedValues);
      }
    },
  );

  return changedValues;
}

export function actionHook(hookID, descriptor, action) {
  let nextAction = action;

  if (descriptor.hooks?.[hookID]) {
    for (const hookFn of descriptor.hooks[hookID]) {
      const newAction = hookFn.call(descriptor.context, nextAction);
      if (typeof newAction === 'object') {
        nextAction = newAction;
      }
      if (nextAction === null) {
        break;
      }
    }
  }

  if (nextAction !== null && !nextAction.type) {
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
      descriptor.config.mid
    } | A middleware hook mutated the "action" and it no longer has a type property.  Expects { type: string, ... }`);
  }

  return nextAction;
}

export function hook(hookID, descriptor, ...args) {
  descriptor.hooks?.[hookID]?.forEach(hookFn => {
    hookFn.call(descriptor.context, ...args);
  });
}
