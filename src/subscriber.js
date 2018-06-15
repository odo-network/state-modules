import { noop } from './context';

/**
 * Attempts to mirror the ES6 Observable API as much as possible so this interface is utilized.  Major differences
 * are that arguments from the Subscriber construction and the subscribe call are provided to the observer call.
 */
export class Subscriber {
  #cb;
  #args;
  constructor(cb, args) {
    this.#cb = cb;
    this.#args = args;
  }
  subscribe = (subscription, ...args) => new Subscription(this.#cb, subscription, ...this.#args, ...args);
}

/**
 * Subscription is returned any time the Subscriber.subscribe() is called and will the subscription functions response will
 * be merged into the properties of the instance so that they may be used by the creator if needed.
 *
 * When the observer is called, the matching instance of Subscription will be bound as the context of the function.
 */
class Subscription {
  constructor(cb, _subscription, ...args) {
    const subscription = Object.assign(
      {
        start: noop,
        next: noop,
        complete: noop,
      },
      _subscription,
    );
    Object.assign(this, cb.call(this, subscription, ...args));
  }
}

export default function createSubscriber(subscriberFunction, ...args) {
  return new Subscriber(subscriberFunction, args);
}
