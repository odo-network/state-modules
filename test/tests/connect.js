import { expect } from 'chai';
import { performance } from 'perf_hooks';
import State from '../../src';
import { STATE_SELECTOR } from '../../src/context';

const hooksRan = new Set();

const created = performance.now();

function simpleConnector(subscriber, actions) {
  return WrappedComponent => {
    const subscription = actions.subscribe({
      next(val) {
        console.log('Simple Connect NEXT: ', val.state);
      },
    });
    return {
      ...WrappedComponent,
      setProps: subscription.setSelectorProps,
    };
  };
}

export function getStateModule(connector) {
  const state = State({
    config: {
      mid: 'my-module',
      connector,
    },
    hooks: {
      before: [
        () => {
          hooksRan.add('before');
        },
        action => {
          if (action.ignore) {
            return null;
          }
        },
      ],
      change: [() => hooksRan.add('change')],
      after: [() => hooksRan.add('after')],
    },
  });

  state.component({
    config: {
      cid: 'counter',
    },
    state: {
      counter: {
        value: 0,
        created,
        lastChanged: 0,
      },
    },
    reducers: {
      SET({ to }, draft) {
        if (to !== this.state.counter.value) {
          draft.counter.lastChanged = performance.now();
        }
        draft.counter.value = to;
      },
      INCREMENT({ by = 1 }, draft) {
        draft.counter.value += by;
        draft.counter.lastChanged = performance.now();
      },
    },
    actions: {
      increment: ['by'],
      counter: {
        set: ['to'],
        increment: ['by'],
      },
    },
    selectors: {
      counter: 'counter',
      counterValue: 'counter.value',
      valueChanged: {
        some: 'counter.value',
        value: 'counter.value',
        lastChanged: 'counter.lastChanged',
      },
    },
  });

  return state;
}

describe('[state.connect] | state.connect config connector', () => {
  const state = getStateModule(simpleConnector);
  const connector = state.connect();

  it('uses the connector in config.connector if none is defined', () => {
    expect(connector).to.be.a('function');
    expect(connector.length).to.be.equal(3);
  });

  it('creates a connection when called', () => {
    const connected = connector(
      selectors => ({
        value: selectors.counterValue,
      }),
      actions => ({
        inrement: actions.increment,
      }),
    );
    expect(connected).to.be.a('function');
  });

  it('currently throws an error if selectors tries to use state', () => {
    let errors = 0;
    try {
      connector((selectors, s) => ({
        value: s.counter.value,
      }));
    } catch (e) {
      errors += 1;
    }
    expect(errors).to.equal(1);
  });
});

describe('[state.connect] | state.connect expects connector provided', () => {
  const state = getStateModule();

  it('throws an error when no connector is provided when calling state.connect', () => {
    let errors = 0;
    try {
      state.connect();
    } catch (e) {
      errors += 1;
    }
    expect(errors).to.equal(1);
  });

  it('allows passing the connector as an argument to state.connect', () => {
    const connector = state.connect(simpleConnector);
    expect(connector).to.be.a('function');
    expect(connector.length).to.be.equal(3);
  });
});

describe('[state.connect] | state.connect subscribe() works as expected', () => {
  const state = getStateModule();

  it('connects to the state as expected', done => {
    function testConnector(subscriber, actions) {
      expect(subscriber).to.have.property('context');
      expect(subscriber).to.have.property('dispatchers');
      expect(subscriber.dispatchers.increment).to.be.a('function');
      expect(subscriber).to.have.property('selectors');
      expect(subscriber).to.have.property('merger');
      expect(subscriber.merger).to.be.a('function');
      expect(subscriber.selectors.counter).to.equal('counter');
      expect(subscriber.selectors).to.have.property(STATE_SELECTOR);

      expect(actions.getSelectorState()).to.deep.equal({
        counter: {
          value: 0,
          created,
          lastChanged: 0,
        },
      });

      return WrappedComponent => {
        let complete = false;
        const subscription = actions.subscribe(
          {
            next(s) {
              if (complete) {
                throw new Error('Connector Should have cancelled after the first run! in state.connect subscribe() works as expected');
              }
              if (s.state.counter.value === 1) {
                complete = true;
              }
            },
            complete() {
              if (complete) {
                done();
              }
            },
          },
          // run once then cancel
          true,
        );
        subscription.setSelectorProps(WrappedComponent.props);
        return subscription;
      };
    }

    const Component = {
      props: {
        wrapperID: 'foo',
      },
    };

    const connector = state.connect(testConnector);

    const subscription = connector(
      selectors => ({
        counter: selectors.counter,
      }),
      actions => ({
        increment: actions.increment,
      }),
    )(Component);

    expect(subscription.dynamic).to.equal(false);
    expect(subscription.getSelectorState).to.be.a('function');
    expect(subscription.setSelectorProps).to.be.a('function');
    expect(subscription.unsubscribe).to.be.a('function');
    expect(subscription.cancel).to.be.equal(subscription.unsubscribe);

    expect(subscription.getSelectorState()).to.deep.equal({
      counter: {
        value: 0,
        created,
        lastChanged: 0,
      },
    });

    state.actions.increment();
    state.actions.increment();
  });
});
