# State Modules

## UNFINISHED

State Modules is a lightweight immutable state management library inspired by the pattern provided when combining `redux`, `redux-saga`, and `redux-saga-process`. More details to come.

> It currently depends on [`immuta`](https://www.github.com/odo-network/immuta), `lodash`, and our internal `to-redux-type` libraries. We plan to remove the `lodash` dependency before production.

## Installation

```
yarn add state-modules
```

## Flow Coverage

When complete, this library will provide 100% Flow Coverage

## Reference Documentation

### function `createState` (default export)

```javascript
import createState from "state-modules";
```

#### Type Signature

```javascript
createState(config: StateManagerConfig): StateManager
```

### type `StateManagerConfig`

#### Type Signature

```javascript
type StateManagerConfig = {|
  config: {|
    mid: StateModuleID
  |},
  hooks?: {|
    before?: Iterable<BeforeHookFunction>,
    change?: Iterable<StateChangeHookFunction>,
    after?: Iterable<AfterHookFunction>,
    error?: Iterable<ErrorHookFunction>
  |},
  selectors?: {
    [selectorID: string]: StateSelector
  }
|};
```

#### Example

```javascript
{
  config: { mid: 'my-module' },
  // Hooks allow simple hooking into the lifecycle of the state
  hooks: {
    before: [action => console.group('DISPATCHING: ', action)],
    change: [
      (prevState, nextState, changedValues) =>
        console.log(
          'State Changed from: \n',
          prevState,
          '\n --> to --> \n',
          nextState, '\n',
          changedValues
        ),
    ],
    error: [e => console.error('Error: ', e)],
    after: [() => console.groupEnd()],
  },
}
```

### interface `StateManager`

#### Type Signature

```javascript
interface StateManager {
  get modules(): Array<StateComponentID>;
  get actions(): StateActionDispatchers;
  create(...modules: Array<StateComponentConfig>): StateManager;
  connect(
    withState: StateConnectState,
    withDispatchers: StateConnectDispatchers
  ): (component: React.Component<*>) => React.Component<*>;
  dispatch(action: {
    +type: string,
    [key: string]: any
  }): Promise<void | StateNewState>;
}
```

### type `StateComponentConfig`

#### Type Signature

```javascript
type StateComponentConfig = {
  config: {|
    cid: StateComponentID,
    prefix: StateActionPrefix,
    loadsOnAction: StateActionType
  |}
};
```

#### Example

```javascript
{
  config: {
    /* Unique Component ID */
    cid: 'counter',
    /* Prefixes all types with COUNTER_ when defined */
    prefix: 'COUNTER',
    /* Asynchronously loads the scope and runs the process when APP_READY is dispatched */
    loadsOnAction: 'APP_READY',
    /* We can also use a function here */
    // loadsOnAction: action => action.type === 'APP_READY'
  },
  /* Asynchronously loaded Scope - loaded before the "componentWillMount" function */
  //  Available as this.scope to any functions called
  scope: () => import('./scope'),
  /* Extend the Core Schema - Will error if collides with another value */
  /* When keys collide on a common state value, they are merged.  Colissions on defined keys will provide errors. */
  state: {
    counter: {
      count: 0,
    },
    settings: {
      lastCounterSet: 0,
    },
  },
  /* Actions are used to create action creators `set: ['to']` dispatches `{ type: 'COUNTER_SET', to: arguments[0] }` */
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
    SET(action, state) {
      state.counter.count = action.to;
      state.settings.lastCounterSet = Date.now();
    },
    DECREMENT(action, state) {
      state.counter.count -= action.by || 1;
    },
  },
  hooks: {
    async loads() {

    },
    async before(action) {

    },
    async change(prevState, nextState, changedValues) {

    },
    async error(e) {

    },
    async after() {

    },
  },
  /* Sagas allow us to handle side effects that need to occur before state can be updated */
  //  * Additionally, certain keys can be defined to hook into a state modules lifecycle
  sagas: {
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
}
```

## Example: state-modules

Example below is incomplete

```javascript
import createState from "./src/index";

const state = createState({
  config: { mid: "my-module" },
  // Hooks allow simple hooking into the lifecycle of the state
  hooks: {
    // Before action is dispatched, may return an action with new properties
    before: [action => console.group("DISPATCHING: ", action)],
    // Whenever the state changes, gets previous and next as well as an object
    // with only the changed values.
    change: [
      (prevState, nextState, changedValues) =>
        console.log(
          "State Changed from: \n",
          prevState,
          "\n --> to --> \n",
          nextState,
          "\n",
          changedValues
        )
    ],
    // After the dispatch has occurred.
    after: [() => console.groupEnd()],
    // Any error that occurs within the realm of the dispatch
    error: [e => console.error("Error: ", e)]
  }
});

// Create a State Component to add to our module
state.create({
  config: { cid: "my-first-component" },
  // initial state to merge into module (no collisions allowed)
  state: {
    data: {
      value: "one"
    }
  },
  // selectors are used to capture common data structures and values
  // of our state to be used
  selectors: {
    value: state => state.data.value
  },
  // actions to dispatch when called.
  actions: {
    // state.actions.sweet(1, 2) --> state.dispatch({ type: 'SWEET', paramOne: 1, paramTwo: 2 })
    sweet: ["paramOne", "paramTwo"]
  },
  reducers: {
    SWEET: (action, draftState) => {
      // data is immutable - we are actually mutating a proxy (@see immer)
      draftState.data.value = action.paramOne + action.paramTwo;
    }
  }
});

// State Components can be split up - they will be merged and validated with errors thrown if there are
// any conflicts.
state.create({
  config: { cid: "my-first-component-async" },
  actions: {
    // --> { type: 'SWEET_ASYNC', ... }
    sweetAsync: ["paramOne", "paramTwo"]
  },
  routes: {
    sweetAsync: "handleSweetAsync"
  },
  sagas: {
    async handleSweetAsync(action) {
      // not technically asynchronous in this case
      await this.actions.sweet(action);
    }
  }
});

// actions always return promise but will resolve synchronously
// if there are no sagas involved with the dispatch
//
// state is { data: { value: 'one' } }
state.actions.sweet(1, 2).then(changedValues => {
  // state is { data: { value: 12 } }
  // in this case changedValues is the same as the state
});

state.actions.sweetAsync(4, 5).then(changedValues => {
  // state is { data: { value: 45 } }
  // in this case changedValues is the same as the state
  state.select("value"); // 45
});
```

## Example: react-state-modules

### UNFINISHED

> Example is preliminary example and not yet complete.

```javascript
import * as React from "react";
import state from "./state";

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
Below would be the same in this case as:

state.connect()(MyComponent)
*/
export default state.connect(
  /* Indicate the shape of the state based on imported selectors */
  (selectors, state) => ({
    value: selectors.value
  }),
  /* Indicate the actions you wish to import */
  //  Below is same as if we left empty or did actions => actions
  actions => ({
    sweet: actions.sweet,
    sweetAsync: actions.sweetAsync
  })
)(MyComponent);
```
