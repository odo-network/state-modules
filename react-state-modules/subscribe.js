import connect from './connect';

/**
 * Each time a component subscribes to the state it will provide its
 * parameters to create our Observable.  It's params are the static
 * values at the time of evaluation.
 * @param {*} element
 * @param {*} eventName
 */
function register() {
  return connect();
}
