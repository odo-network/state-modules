# State Modules

[![npm](https://img.shields.io/npm/v/state-modules.svg)](https://github.com/odo-network/state-modules)
[![Build Status](https://travis-ci.com/odo-network/state-modules.svg?branch=master)](https://travis-ci.com/odo-network/state-modules)
[![Known Vulnerabilities](https://snyk.io/test/github/odo-network/state-modules/badge.svg?targetFile=package.json)](https://snyk.io/test/github/odo-network/state-modules?targetFile=package.json)
[![Coveralls github](https://img.shields.io/coveralls/github/odo-network/state-modules.svg)](https://github.com/odo-network/state-modules)
[![license](https://img.shields.io/github/license/odo-network/state-modules.svg)](https://github.com/odo-network/state-modules)

State Modules is an immutable state management library allowing the orchestration of your state in an efficient and predictable way. State Modules is largely **reactive** and maintains many powerful models for handling asynchronous scoping in a lazy way.

State Modules use **ES6 Proxies** to capture mutations performed against a "draft state". If changes occur while reducing a dispatched action, updates are dispatched directly to only those components which have subscribed to changes for the given values.

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

## Libraries

- [**react-state-modules**](https://github.com/odo-network/react-state-modules)

## Simple Examples

### State Manager

```javascript
import createState from "state-modules";

const state = createState();

const created = Date.now();

state.component({
  config: { cid: "counter" },
  state: {
    counter: {
      created,
      updated: created,
      value: 0
    }
  },
  selectors: {
    counterValue: "counter.value"
  },
  actions: {
    increment: ["by"],
    decrement: ["by"]
  },
  reducers: {
    INCREMENT(draft, { by = 1 }) {
      draft.counter.value += by;
      draft.counter.updated = Date.now();
    },
    DECREMENT(draft, { by = 1 }) {
      draft.counter.value -= by;
      draft.counter.updated = Date.now();
    }
  }
});

state.actions.increment(5);
state.actions.decrement(1);
state.actions.decrement();

// get the selector 'counterValue' and return results
const currentValue = state.select("counterValue"); // 3
```
