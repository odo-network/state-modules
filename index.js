import * as React from 'react';
import { StateManager } from './core';

/*
  Called to build our states schema.
*/
const $ = StateManager({
  /* `config` to configure globally - passed to all state modules */
  config: {},
  /* Hooks are middleware that are called at specific parts of the lifecycle and allow modifying behavior */
  hooks: {
    //  Before a dispatch receives `action => mutatedAction`
    before: new Set(),
    //  After a dispatch (handled by all modules)
    after: new Set(),
    //  When an error occurs - receives detailed information on errors
    error: new Set(),
    //  When a state module loads (whether async or synchronously)
    load: new Set(),
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
  We create state modules (fragments) by calling $.create() on a StateManager instance.  Fragments/Modules are combined together
  to form our final state object and imported/used throughout our application as if they were one entity.

  State Modules may work together to construct a unified state representation however the user desires.
*/
$.create({
  config: {
    pid: 'counter',
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
  },
  /* routes allows you to create side effects for various dispatched actions, these will call your sagas based on the route given */
  routes: {
    increment: 'handleIncrement',
  },
  /* All state is immutable by default.  "Mutating" in a reducer is not mutating our actual state, but simply a "draft" state */
  //  * Since state is immutable across the board, if the actual values do not change while reduced, our components will not re-render
  reducers: {
    SET: (action, state) => {
      state.counter.count = action.to;
      state.settings.lastCounterSet = Date.now();
    },
    DECREMENT: (action, state) => {
      state.counter.count -= action.by || 1;
    },
  },
  /* Sagas allow us to handle side effects that need to occur before state can be updated */
  //  * Additionally, certain keys can be defined to hook into a state modules lifecycle
  sagas: {
    async starts() {
      console.log('APP_READY Received: Counter Process Starts');
    },
    // Taking the second argument indicates that we need to read and/or mutate the state.
    // Mutating the provided state object will create an "update" event.
    async handleIncrement(action, state, lock) {
      // If we want to "lock" our state until this function resolves, we may lock it, this forces
      // future calls to be deferred
      // lock('queue' | 'ignore' | 'error' | Function);
      console.log('INCREMENT Received - Incrementing by: ', action.by);
      state.counter.count += action.by || 1;
      state.settings.lastCounterSet = Date.now();
    },
  },
  /* Selectors are used to provide components with simple imported pieces of the state */
  selectors: {
    count: state => state.counter.count,
    lastSet: state => state.settings.lastCounterSet,
  },
});

$.counter.set(10);
/*
{
  type: 'COUNTER_SET',
  to: 10
}
*/
$.counter.increment(2);
/*
{
  type: 'COUNTER_INCREMENT',
  by: 2
}
*/

// $.get(['counter']) or
// $.select({ counter: { count: 'counter.count' }, settings: { lastCounterSet: 'counter.lastSet' }}) or
$.counter.get();
/*
  counter: {
    count: 12
  },
  settings: {
    lastCounterSet: 808089898298
  }
*/

/*
  State Modules may also be defined with subsets of the overall options.  They do not need to actually operate on
  any state.
*/
$.create({
  config: {
    pid: 'app',
    prefix: 'APP',
  },
  actions: {
    /* dispatches APP_READY */
    ready: null,
  },
});

@$.connect(
  /* Indicate which state modules you wish to attach to */
  ['app', 'counter'],
  /* Indicate the shape of the state based on imported selectors */
  (state, selectors) => ({
    count: selectors.counter.count,
    lastCounterSet: selectors.counter.lastSet,
  }),
  /* Indicate the actions you wish to import */
  //  Below is same as if we left empty or did actions => actions
  actions => ({
    app: {
      ready: actions.app.ready,
    },
    counter: {
      increment: actions.counter.increment,
      decrement: actions.counter.decrement,
      set: actions.counter.set,
    },
  }),
)
class MyComponent extends React.Component {
  componentWillMount() {
    const { app } = this.props.actions;
    // asynchronously loads counter whichs "loadsOnAction" APP_READY
    app.ready();
  }
  componentDidMount() {
    const { counter } = this.props.actions;
    // dispatches { type: 'COUNTER_INCREMENT', by: 1 }
    counter.increment(1);
  }
  render() {
    const { state, actions } = this.props;
    return (
      <div>
        <div>Current Count: ${state.count}</div>
        <button onClick={actions.counter.increment}>Increment</button>
      </div>
    );
  }
}

/*
  A few other design points
*/

/* $.create() also accepts a function which is called when building the state module, receives a configuration, and expects a module in response */
//  * This may be used to allow a module to be modified by the user at runtime.
$.create(config =>
  // Based on Config, modify the properties of the module
  ({
    config,
    actions: {
      execute: ['command'],
    },
    routes: {
      execute: 'handleExecuteCommand',
    },
    sagas: {
      * handleExecuteCommand(action) {
        switch (action.command) {
          case 'one': {
            console.log('Execute Command: one');
            break;
          }
          case 'two': {
            console.log('Execute Command: two');
            break;
          }
          default: {
            console.log('Unknown Command: ', action.command);
            break;
          }
        }
      },
    },
  }));

/*
  Multiple State Modules may be created at once, passed as additional arguments to $.create()
*/
$.create(counter, app);
