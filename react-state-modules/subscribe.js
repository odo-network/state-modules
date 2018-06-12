export const subscriptions = new WeakMap();

/**
 * Each time a component subscribes to the state it will provide its
 * parameters to create our Observable.  It's params are the static
 * values at the time of evaluation.
 * @param {*} element
 * @param {*} eventName
 */
export default function subscribe(modules, select, actions) {
  return new Observable(observer => {
    // Create an event handler which sends data to the sink
    const handler = event => keys.some(key => event.key === key) && observer.next(event);

    // Return a cleanup function which will cancel the event stream
    return () => {
      // Detach the event handler from the element
    };
  });
}

const subscriber = subscribe('keydown');

subscriber.subscribe(['a']);
