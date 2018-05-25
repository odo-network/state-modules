import * as React from 'react';
import hoistNonReactStatics from 'hoist-non-react-statics';
import createStateSubscription from './subscribe';

function getDisplayName(WrappedComponent) {
  return WrappedComponent.displayName || WrappedComponent.name || 'Component';
}

export default function connect(manager, modules, select) {
  return WrappedComponent => {
    class StatefulComponentConnector extends React.Component {
      componentWillMount() {
        const subscriber = createStateSubscription(modules, select, this);
        this.subscription = subscriber.subscribe({
          next: state => this.setState(() => state),
          error: err => {},
        });
      }
      componentWillUnmount() {
        this.subscription.unsubscribe();
      }
      render() {
        const { forwardedRef, ...props } = this.props;
        return <WrappedComponent ref={forwardedRef} {...props} state={this.state} />;
      }
    }

    hoistNonReactStatics(StatefulComponentConnector, WrappedComponent);

    // Note the second param "ref" provided by React.forwardRef.
    // We can pass it along to StatefulComponentConnector as a regular prop,
    // e.g. "forwardedRef" and it can then be attached to the Component.
    function forwardRef(props, ref) {
      return <StatefulComponentConnector {...props} forwardedRef={ref} />;
    }

    forwardRef.displayName = `Stateful(${getDisplayName(WrappedComponent)})`;

    return React.forwardRef(forwardRef);
  };
}
