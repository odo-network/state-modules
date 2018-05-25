import createState from './src/libraries/state-modules/core';

/*
  Called to build our states schema.
*/
const $ = createState({
  /* `config` to configure globally - passed to all state modules */
  config: {
    mid: 'my-module',
  },
  /* Hooks are middleware that are called at specific parts of the lifecycle and allow modifying behavior */
  hooks: {
    //  Before a dispatch receives `action => mutatedAction`
    before: [
      action => {
        console.group('DISPATCHING: ', action);
      },
    ],
    //  After a dispatch (handled by all modules)
    after: [
      () => {
        console.groupEnd();
      },
    ],
    change: [
      (prevState, nextState, changed) => {
        console.group('Changed State!');
        console.log(' --> \n', prevState, '\n --> \n', nextState);
        console.log('Changed: ', changed);
        console.groupEnd();
      },
    ],
    //  When an error occurs - receives detailed information on errors
    error: [
      e => {
        console.error('ERROR: ', e.message);
      },
    ],
    //  When a state module loads (whether async or synchronously)
    // load: new Set(),
  },
  /* Define and provide "global selectors" used to combine data from multiple state selectors */
  selectors: {
    countObj: state => ({
      count: state.counter.count,
      lastSet: state.settings.lastCounterSet,
    }),
  },
});

/*
  State Modules may also be defined with subsets of the overall options.  They do not need to actually operate on
  any state.
*/
$.create({
  config: {
    cid: 'app',
    prefix: 'APP',
  },
  actions: {
    /* dispatches APP_READY */
    ready: null,
  },
});

$.create({
  config: {
    cid: 'something',
  },
  routes: {
    test: 'handleTestAction',
  },
  sagas: {
    async handleTestAction(action, produce, lock) {
      // lock();
      // console.log('Count: ', this.getState().counter.count);
      await this.actions.counter.decrement();
      // console.log('Count: ', this.getState().counter.count);
    },
  },
  actions: {
    test: null,
  },
  selectors: {
    lastSet: state => state.settings.lastCounterSet,
  },
});

$.create({
  config: {
    cid: 'counter',
    /* Prefixes all types with COUNTER_ when defined */
    prefix: 'COUNTER',
    /* Asynchronously loads the scope and runs the process when APP_READY is dispatched */
    loadsOnAction: 'APP_READY',
    /* We can also use a function here */
    // loadsOnAction: action => action.type === 'APP_READY'
  },
  /* Asynchronously loaded Scope - loaded before the initial hook */
  //  Available as this.scope to any functions called
  // scope: () => import('./scope'),
  /* Extend the Core Schema - Will error if collides with another value */
  state: {
    counter: {
      count: 0,
    },
    /* When keys collide on a common state value, they are merged.  Collissions on defined keys will provide errors. */
    settings: {
      lastCounterSet: 0,
    },
  },
  actions: {
    set: ['to'],
    increment: ['by'],
    decrement: ['by'],
    doIncrement: ['by'],
  },
  /* routes allows you to create side effects for various dispatched actions, these will call your sagas based on the route given */
  routes: {
    doIncrement: 'handleIncrement',
  },
  /* All state is immutable by default.  "Mutating" in a reducer is not mutating our actual state, but simply a "draft" state */
  //  * Since state is immutable across the board, if the actual values do not change while reduced, our components will not re-render
  reducers: {
    SET: (action, state) => {
      state.counter.count = action.to;
      state.settings.lastCounterSet = Date.now();
    },
    DECREMENT: (action, state) => {
      // console.log('Decrement');
      state.counter.count -= action.by || 1;
      state.settings.lastCounterSet = Date.now();
    },
    INCREMENT: (action, state) => {
      state.counter.count += action.by || 1;
      state.settings.lastCounterSet = Date.now();
    },
  },
  /* Sagas allow us to handle side effects that need to occur before state can be updated */
  //  * Additionally, certain keys can be defined to hook into a state modules lifecycle
  sagas: {
    * starts() {
      console.log('APP_READY Received: Counter Process Starts');
    },
    // Taking the second argument indicates that we need to read and/or mutate the state.
    // Mutating the provided state object will create an "update" event.
    async handleIncrement(action) {
      console.log('Doing An Increment!');
      await this.actions.counter.increment(action.by || 1);
    },
  },
  /* Selectors are used to provide components with simple imported pieces of the state */
  selectors: {
    count: state => state.counter.count,
  },
});

// console.log($);

$.actions.app
  .ready()
  .then(() => $.actions.counter.decrement())
  .then(() => $.actions.counter.doIncrement())
  .then(() => $.actions.counter.doIncrement())
  .then(() => $.actions.counter.doIncrement())
  .then(() => $.actions.something.test())
  .catch(err => {
    console.error('Fail: ', err);
  });

// console.log($.state);

console.log($);

console.log('Components: ', $.components);

setTimeout(() => {
  console.log($.select('count'));
}, 5000);
