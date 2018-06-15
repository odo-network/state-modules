import mutate from 'immuta';
import { MODULE_NAME } from './context';

export async function asyncRoutes(priv, action) {
  const { type } = action;
  const routes = priv.routes.get(type);

  const promises = [];

  let lock = false;

  const handleLock = value => {
    lock = !!value;
  };

  for (const asyncReducer of routes) {
    lock = false;
    const promise = asyncReducer.call(priv.context, action, handleLock);
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

export function routeAction(priv, action) {
  let changedValues;
  const prevState = priv.state;

  mutate(
    prevState,
    draftState => {
      priv.reducers.get(action.type).forEach((descriptor, reducer) => {
        reducer.call(priv.context, action, draftState);
      });
    },
    // Executed only when values are changed by the reducer calls above
    (nextState, changedMap) => {
      changedValues = [...changedMap.keys()].map(k => k.join('.'));
      priv.state = nextState;
      if (priv.hooks && priv.hooks.change) {
        hook('change', priv, action, prevState, changedValues);
      }
    },
  );

  return changedValues;
}

export function actionHook(hookID, priv, action) {
  let nextAction = action;

  if (priv.hooks?.[hookID]) {
    for (const hookFn of priv.hooks[hookID]) {
      const newAction = hookFn.call(priv.context, nextAction);
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
      priv.config.mid
    } | A middleware hook mutated the "action" and it no longer has a type property.  Expects { type: string, ... }`);
  }

  return nextAction;
}

export function hook(hookID, priv, ...args) {
  priv.hooks?.[hookID]?.forEach(hookFn => {
    hookFn.call(priv.context, ...args);
  });
}
