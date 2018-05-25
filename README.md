# State Modules

## UNFINISHED

State Modules is a lightweight immutable state management library inspired by the pattern provided when combining `redux`, `redux-saga`, and `redux-saga-process`. More details to come.

> It currently depends on `immer`, `lodash`, and our internal `to-redux-type` libraries. We plan to remove the `lodash` dependency and may remove `immer` at some point as well.

## Installation

```
yarn add state-modules
```

## Flow Coverage

When complete, this library will provide 100% Flow Coverage

## Reference Documentation

### `createState` (default export)

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
    mid: string
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
