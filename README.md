# State Modules

[![Coverage Status](https://coveralls.io/repos/github/odo-network/immuta/badge.svg?branch=master)](https://coveralls.io/github/odo-network/immuta?branch=master)

State Modules provide a powerful mechanism for immutable state management which pulls inspiration from `redux`, `redux-saga`, `redux-saga-process`, and [`immuta`](https://www.github.com/odo-network/immuta) (which in-turn is inspired by `immer`).

State Modules use ES6 Proxies to capture mutations performed against a "draft state". If changes occur while reducing a dispatched action, updates are dispatched directly to only those components which have subscribed to changes for the given values.

> **Note:** While reducers "appear" to be mutating the state, they are actually mutating an ES6 Proxy. References are then changed based on those mutations so that `nextState !== state` if any values change at any depth within the state.

## Installation

```
yarn add state-modules
```

## Flow Coverage

When complete, this library will provide 100% Flow Coverage

## Documentation

- [**Reference Documentation**](./docs/reference.md)
- [**Examples**](./docs/examples.md)

## Simple Examples

### State Manager

```javascript
// state.js
import createState from "state-modules";

const state = createState();

const created = Date.now();

state.component({
  config: { cid: "counter" },
  state: {
    counter: { value: 0, created, updated: created }
  },
  selectors: {
    counterValue: "counter.value",
    counter: "counter"
  },
  actions: {
    increment: ["by"],
    decrement: ["by"]
  },
  reducers: {
    INCREMENT({ by = 1 }, draft) {
      draft.counter.value += by;
      draft.counter.updated = Date.now();
    },
    DECREMENT({ by = 1 }, draft) {
      draft.counter.value -= by;
      draft.counter.updated = Date.now();
    }
  }
});

export default state;
```

### React Connector

```javascript
// component.jsx
import * as React from "react";
import state from "./state";

function MyComponent({ counterValue, counterIncrement, counterDecrement }) {
  return (
    <div>
      <div>Value: {counterValue}</div>
      <button onClick={() => counterIncrement(1)}>Increment 1</button>
      <button onClick={() => counterDecrement(1)}>Decrement 1</button>
      <button onClick={() => counterIncrement(5)}>Increment 5</button>
      <button onClick={() => counterIncrement(5)}>Decrement 5</button>
    </div>
  );
}

export default state.connect(
  selectors => ({
    counterValue: selectors.counterValue
  }),
  actions => ({
    counterIncrement: actions.increment,
    counterDecrement: actions.decrement
  }),
  (props, state, actions) => {
    return {
      ...props,
      ...state,
      ...actions
    };
  }
)(MyComponent);
```
