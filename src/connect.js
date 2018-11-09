import { MODULE_NAME, STATE_SELECTOR, emptyFrozenObject } from './context';

import * as utils from './utils';

export function defaultStateConnector(a, listener) {
  let fn = () => {};
  const subscription = listener.subscribe({
    next(nextState) {
      fn(nextState, subscription);
    },
  });
  return _fn => {
    fn = _fn;
  };
}

/**
 *
 * @param {*} descriptor
 * @param {*} subscriber
 */
export function createConnectSubscription(descriptor, subscriber) {
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
export function createConnection(descriptor, withSelectors, withDispatchers, connector) {
  if (withSelectors.length <= 1) {
    // do something?
  } else {
    // when the connector directly selects the state we can not optimize
    // the subscription and must provide the selected state every time
    throw new Error(`[${MODULE_NAME}] | ERROR | Module ${
      descriptor.config.mid
    } | Second state selection argument (state) is not yet supported`);
  }

  const subscriber = {
    dynamic: false,
    context: descriptor.context,
    dispatchers: withDispatchers ? withDispatchers(descriptor.actions) : emptyFrozenObject,
    selectors: utils.buildSelectors(descriptor, undefined, withSelectors(descriptor.selectors, descriptor.state)),
  };

  if (subscriber.selectors[STATE_SELECTOR].dynamic) {
    subscriber.dynamic = true;
  }

  return connector(subscriber, createConnectSubscription(descriptor, subscriber));
}
