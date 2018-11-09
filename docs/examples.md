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
  /* routes allows you to create side effects for various dispatched actions, these will call your sagas based on the route given */
  routes: {
    increment: 'handleAsyncIncrement',
  },
  /* Effects allow us to handle side effects that need to occur before state can be updated */
  //  * Additionally, certain keys can be defined to hook into a state modules lifecycle
  effects: {
    // Taking the second argument indicates that we need to read and/or mutate the state.
    // Mutating the provided state object will create an "update" event.
    async handleAsyncIncrement(action, lock) {
      // If we want to "lock" our state until this function resolves, we may lock it, this forces
      // any other matching routes to wait until this effect has resolved before being called
      // lock(Boolean);

    },
  },
  /* Selectors are used to provide components with simple imported pieces of the state */
  selectors: {
    counter: {
      count: 'counter.count',
      lastSet: 'settings.lastCounterSet'
    }
  },
}
```

## Example: react-native

```javascript
/* @flow */
import Orientation from "react-native-orientation";
import { Dimensions } from "react-native";

let state;
let listenerID;

type Orientation$Raw =
  | "PORTRAIT"
  | "LANDSCAPE"
  | "PORTRAITUPSIDEDOWN"
  | "UNKNOWN";

function parseOrientation(orientation: Orientation$Raw) {
  switch (orientation) {
    case "PORTRAIT":
    case "PORTRAITUPSIDEDOWN": {
      return "portrait";
    }
    case "LANDSCAPE": {
      return "landscape";
    }
    default: {
      return "unknown";
    }
  }
}

const component = {
  config: { cid: "screen" },
  state: {
    screen: {
      orientation: parseOrientation(Orientation.getInitialOrientation()),
      dimensions: Dimensions.get("screen")
    }
  },
  actions: {
    screenOrientation: ["orientation", "dimensions"]
  },
  reducers: {
    screenOrientation(draft, { orientation, dimensions }) {
      draft.screen.orientation = orientation;
      draft.screen.dimensions = dimensions;
    }
  },
  selectors: {
    screenOrientation: "screen.orientation",
    screenDimensions: "screen.dimensions",
    screen: "screen"
  }
};

function startOrientationListener() {
  Orientation.addOrientationListener(orientation => {
    const parsed = parseOrientation(orientation);
    if (parsed !== "unknown") {
      state.actions.screenOrientation(parsed, Dimensions.get("screen"));
    }
  });
  const parsed = parseOrientation(Orientation.getInitialOrientation());
  state.actions.screenOrientation(parsed, Dimensions.get("screen"));
}

export function build(_state) {
  state = _state;
  state.component(component);
  if (!listenerID) {
    startOrientationListener();
  }
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
state.create(config => ({
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
    value: {
      value: "data.value"
    }
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
}));

// State Components can be split up - they will be merged and validated with errors thrown if there are
// any conflicts.
state.create({
  config: { cid: "my-first-component-async" },
  actions: {
    // --> { type: 'SWEET_ASYNC', paramOne: arguments[0], paramTwo: arguments[1] }
    sweetAsync: ["paramOne", "paramTwo"]
  },
  routes: {
    sweetAsync: "handleSweetAsync"
  },
  effects: {
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
  selectors => ({
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
