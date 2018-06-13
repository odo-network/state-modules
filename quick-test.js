// Any quick tests that we want to run `yarn try`
import { performance } from 'perf_hooks';
import createState from './src/index';

const state = createState({
  config: { mid: 'my-module' },
  // Hooks allow simple hooking into the lifecycle of the state
  hooks: {
    // Before action is dispatched, may return an action with new properties
    before: [action => console.group('DISPATCHING: ', action)],
    // Whenever the state changes, gets previous and next as well as an object
    // with only the changed values.
    change: [(action, prevState, changedValues) => console.log('State Changed: ', changedValues)],
    // After the dispatch has occurred.
    after: [() => console.groupEnd()],
    // Any error that occurs within the realm of the dispatch
    error: [e => console.error('Error: ', e)],
  },
});

// Create a State Component to add to our module
state.component({
  config: { cid: 'my-first-component' },

  // initial state to merge into module (no collisions allowed)
  state: {
    data: {
      value: 1,
    },
  },
  // selectors are used to capture common data structures and values
  // of our state to be used
  selectors: {
    value: {
      value: 'data.value',
      num: 'data.value',
      another: 'data.value',
    },
  },
  // actions to dispatch when called.
  actions: {
    // state.actions.sweet(1, 2) --> state.dispatch({ type: 'SWEET', paramOne: 1, paramTwo: 2 })
    sweet: ['paramOne', 'paramTwo'],
  },
  reducers: {
    SWEET: (action, draftState) => {
      // data is immutable - we are actually mutating a proxy (@see immer)
      draftState.data.value = draftState.data.value + action.paramOne + action.paramTwo;
    },
  },
});

const connected = state.connect(
  selectors => ({
    value: selectors.value,
    another: 'data',
  }),
  actions => ({
    sweet: actions.sweet,
  }),
  updates => {
    console.log('Updates! ', updates);
  },
);

let start;

// State Components can be split up - they will be merged and validated with errors thrown if there are
// any conflicts.
state
  .component({
    config: { cid: 'my-first-component-async' },
    // scope: () => import('./testimport'),
    actions: {
      // --> { type: 'SWEET_ASYNC', paramOne: arguments[0], paramTwo: arguments[1] }
      sweetAsync: ['paramOne', 'paramTwo'],
    },
    routes: {
      sweetAsync: 'handleSweetAsync',
    },
    effects: {
      async handleSweetAsync(action) {
        // not technically asynchronous in this case
        await this.actions.sweet(action.paramOne, action.paramTwo, { test: 'this' });
      },
    },
  })
  // before all the values can be expected to be included within our state, we call
  // resolve() to await the resolution
  .resolve()
  .then(() => {
    start = performance.now();
    return state.actions.sweet(1, 2);
    // actions always return promise but will resolve synchronously
    // if there are no sagas involved with the dispatch
  })
  .then(changedValues =>
    // state is { data: { value: 12 } }
    // in this case changedValues is the same as the state
    console.log('Selected Value: ', state.select('value'), '\nChanged Values: ', changedValues))
  .then(() => state.actions.sweetAsync(4, 5))
  .then(changedValues => {
    // state is { data: { value: 45 } }
    // in this case changedValues is the same as the state
    console.log('Selected Value: ', state.select('value.value'), '\nChanged Values: ', changedValues);
    console.log(performance.now() - start);
  })
  .catch(e => {
    console.error('Fail: ', e);
  });
