# Reference Documentation

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
}
```

### type `BeforeHookFunction`

#### Summary

Before hooks are executed before a dispatched actions is handled by the `StateManager`. If a hook returns a `null` value, the dispatch will be cancelled. If a new action is returned, the new action will be used. If it returned nothing (or undefined), the original action will be dispatched.

#### Type Signature

```javascript
type BeforeHookFunction = (
  action: StateDispatchedAction
) => action | null | void;
```

### type `ChangeHookFunction`

#### Summary

Change hooks are executed only when the state has been changed in some way.

#### Type Signature

```javascript
type ChangeHookFunction = (
  action: StateDispatchedAction,
  prevState: State,
  changedValues: Array<StatePath>
) => any;
```

### type `AfterHookFunction`

#### Summary

After hooks are executed after the dispatch has been processed and the state reducers have been called. There is no guarantee that the state effects have been completely resolved at this point.

#### Type Signature

```javascript
type AfterHookFunction = (
  action: StateDispatchedAction,
  prevState: State,
  changedValues: Array<StatePath>
) => any;
```

### type `ErrorHookFunction`

#### Summary

Error hooks are executed if an error occurs during the processing of a dispatch.

#### Type Signature

```javascript
type ErrorHookFunction = (action: StateDispatchedAction, error: Error) => any;
```

### interface `StateManager`

#### Type Signature

```javascript
interface StateManager {
  mid: string;

  get components(): Array<State$ComponentID>;
  get actions(): StateActionDispatchers;

  select<R>(selector: string | string[] | (state: State) => R):  R

  component(...components: Array<State$ComponentConfig>): State$Manager;

  dispatch(action: State$DispatchedAction): Promise<void | State$ChangedPaths>;

  subscribeToSelector(): State$Subscription

  subscribeToAction(): State$Subscription;

  connect(
    withState: StateConnectState,
    withDispatchers: StateConnectDispatchers
  ): (component: React.Component<*>) => React.Component<*>;

  resolve(): Promise<void>
}
```

### type `StateComponentConfig`

#### Type Signature

```javascript
type StateComponentConfig = {
  config: {|
    cid: State$ComponentID,
    prefix?: string,
    loadsOnAction?: State$ActionSelector,
    scopeID?: string
  |},
  scope?: () => Promise<State$ComponentScope>,
  state?: State$StateFragment,
  actions?: State$ActionCreators,
  reducers?: State$Reducers,
  routes?: State$EffectRoutes,
  effects?: State$Effects,
  selectors?: State$Selectors,
  hooks?: State$ComponentHooks
};
```
