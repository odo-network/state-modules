# State Modules

## UNFINISHED

State Modules is a lightweight immutable state management library inspired by the pattern provided when combining `redux`, `redux-saga`, and `redux-saga-process`. More details to come.

## Installation

```
yarn add state-modules
```

## Flow Coverage

When complete, this library will provide 100% Flow Coverage

## Example

Example below is incomplete

```javascript
import createState from "./src/index";

const state = createState({
  config: { mid: "my-module" },
  // Hooks allow simple hooking into the lifecycle of the state
  hooks: {
    before: [action => console.group("DISPATCHING: ", action)],
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
    after: [() => console.groupEnd()],
    error: [e => console.error("Error: ", e)]
  }
});

// Create a State Component to add to our module
state.create({
  config: {
    cid: "my-first-component"
  },
  // initial state to merge into module (no collisions allowed)
  state: {
    data: {
      value: "one"
    }
  },
  // actions to dispatch when called
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
```
