import * as React from 'react';

// Context lets us pass a value deep into the component tree
// without explicitly threading it through every component.
// Create a context for the current theme (with "light" as the default).
const { Provider, Consumer } = React.createContext();

export default class StateModuleProvider extends React.Component {
  render() {
    return <Provider>{this.props.children}</Provider>;
  }
}
