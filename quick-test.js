/* @flow */
// Any quick tests that we want to run `yarn try`

import createState from './src/index';
// import connectReact from './react-state-modules/subscribe';

function simpleConnector(subscriber, actions) {
  return WrappedComponent => {
    const subscription = actions.subscribe({
      next(val) {
        console.log('Simple Connect NEXT: ', val.state);
      },
    });
    return {
      ...WrappedComponent,
      setProps: subscription.setSelectorProps,
    };
  };
}

const state = createState({
  config: { mid: 'my-module', connector: simpleConnector },
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

const created = Date.now();

state.create({
  config: { cid: 'counter' },
  state: {
    shared: { value: 0, created, updated: created },
    counters: {
      default: { value: 0, created, updated: created },
    },
  },
  selectors: {
    counterTotal: 'shared',
    counterByID: props => ['counters', props.counterID || 'default'],
  },
  actions: {
    create: ['counterID', 'initialValue'],
    increment: ['by', 'counterID'],
    decrement: ['by', 'counterID'],
  },
  helpers: {
    createCounter(draft, counterID, initialValue = 0) {
      const now = Date.now();
      draft.counters[counterID] = {
        value: initialValue,
        created: now,
        updated: now,
      };
    },
  },
  reducers: {
    CREATE({ counterID, initialValue = 0 }, draft) {
      this.helpers.createCounter(draft, counterID, initialValue);
    },
    INCREMENT({ by = 1, counterID = 'default' }, draft) {
      console.log(this.state);
      if (!draft.counters[counterID]) {
        this.helpers.createCounter(draft, counterID);
      }
      if (by === 0) return;

      const now = Date.now();

      const counter = draft.counters[counterID];

      draft.shared.value += by;
      draft.shared.updated = now;

      counter.value += by;
      counter.updated = now;
    },
    DECREMENT({ by = 1, counterID = 'default' }, draft) {
      if (!draft.counters[counterID]) {
        this.helpers.createCounter(draft, counterID);
      }
      if (by === 0) return;

      const now = Date.now();
      const counter = draft.counters[counterID];

      draft.shared.value -= by;
      draft.shared.updated = now;

      counter.value -= by;
      counter.updated = now;
    },
  },
});

const connector = state.connect();

// const reactConnector = state.createConnector(connectReact);

const Component = {
  props: {
    counterID: 'test',
  },
};

const connected = connector(
  selectors => ({
    // total: selectors.counterTotal,
    counterByID: selectors.counterByID,
  }),
  actions => actions,
  (props, state) => {
    console.log('Handle Merge!');
  },
)(Component);

console.log('Connected: ', connected);

connected.setProps({ counterID: 'test' });

state.actions
  .increment(2, 'test')
  .then(() => {
    console.log('Counter is now: ', state.select('counterByID', { counterID: 'test' }));

    return state.actions.decrement(1, 'test');
  })
  .then(() => {
    console.log('Counter is now: ', state.select('counterByID', { counterID: 'test' }));
    return state.actions.increment(1, 'test');
  })
  .catch(e => {
    console.error('Error: ', e);
  });

// // console.log('Connected: ', connected);

// // const state = createState();

// // // Create a State Component to add to our module
// // state.component({
// //   config: { cid: 'my-first-component' },

// //   // initial state to merge into module (no collisions allowed)
// //   state: {
// //     data: {
// //       value: 1,
// //     },
// //   },
// //   // selectors are used to capture common data structures and values
// //   // of our state to be used
// //   selectors: {
// //     value: {
// //       value: 'data.value',
// //       num: 'data.value',
// //       another: 'data.value',
// //     },
// //   },
// //   // actions to dispatch when called.
// //   actions: {
// //     // state.actions.sweet(1, 2) --> state.dispatch({ type: 'SWEET', paramOne: 1, paramTwo: 2 })
// //     sweet: ['paramOne', 'paramTwo'],
// //   },
// //   reducers: {
// //     SWEET: (action, draftState) => {
// //       // data is immutable - we are actually mutating a proxy (@see immer)
// //       draftState.data.value = draftState.data.value + action.paramOne + action.paramTwo;
// //     },
// //   },
// // });

// // const connected = state.connect(
// //   selectors => ({
// //     value: selectors.value,
// //     another: selectors.value,
// //   }),
// //   actions => ({
// //     sweet: actions.sweet,
// //   }),
// //   updates => {
// //     console.log('CONNECTED Updates!');
// //   },
// // );

// // let start;

// // // State Components can be split up - they will be merged and validated with errors thrown if there are
// // // any conflicts.
// // state
// //   .component({
// //     config: { cid: 'my-first-component-async', loadsOnAction: 'SWEET' },
// //     scope: () => import('./testimport'),
// //     actions: {
// //       // --> { type: 'SWEET_ASYNC', paramOne: arguments[0], paramTwo: arguments[1] }
// //       sweetAsync: ['paramOne', 'paramTwo'],
// //     },
// //     routes: {
// //       sweetAsync: 'handleSweetAsync',
// //     },
// //     effects: {
// //       async handleSweetAsync(action) {
// //         // not technically asynchronous in this case
// //         await this.actions.sweet(action.paramOne, action.paramTwo, { test: 'this' });
// //       },
// //     },
// //   })
// //   .resolve()
// //   .then(() => {
// //     start = performance.now();
// //     return state.actions.sweet(1, 2);
// //   })
// //   .then(changedValues =>
// //     console.log('Selected Value: ', state.select('value'), '\nChanged Values: ', changedValues))
// //   .then(() => state.actions.sweetAsync(4, 5))
// //   .then(() => {
// //     console.log('Selected Value: ', state.select('value.value'));
// //     console.log(performance.now() - start);
// //   })
// //   .catch(e => {
// //     console.error('Fail: ', e);
// //   });
