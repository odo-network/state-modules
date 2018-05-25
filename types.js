/* @flow */

// TODO : Implement the FlowTypes (and strengthen the type safety for them)
type SM$State = { [key: string]: any };
type SM$ChangedState = $Shape<SM$State>;
type SM$ModulePID = string;
type SM$Actions = {
  [reducerID: string]: {
    [actionID: string]: (...args: Array<*>) => $Call<SM$StateManager.dispatch, args>,
  },
};

export interface SM$StateManager {
  get modules(): Array<SM$ModulePID>;
  get actions(): SM$Actions;
  create(...modules: Array<SM$Module>): SM$StateManager;
  connect(
    modules: SM$ConnectModules,
    getState: SM$ConnectState,
    getDispatchers: Function,
  ): (component: React.Component<*>) => React.Component<*>;
  dispatch(action: { +type: string, [key: string]: any }): Promise<void | SM$ChangedState>;
  select(key: string): mixed;
}
