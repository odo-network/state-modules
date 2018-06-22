import { expect } from 'chai';
import { performance } from 'perf_hooks';
import State from '../../src';

const hooksRan = new Set();

const created = performance.now();

export function getStateModule() {
  const state = State({
    config: {
      mid: 'my-module',
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
    helpers: {
      myHelper() {
        // empty
      },
    },
    reducers: {
      SET(draft, { to }) {
        if (to !== this.state.counter.value) {
          draft.counter.lastChanged = performance.now();
          draft.counter.value = to;
        }
      },
      INCREMENT(draft, { by = 1 }) {
        draft.counter.value += by;
        draft.counter.lastChanged = performance.now();
      },
    },
    actions: {
      increment: ['by'],
      counter: {
        increment: ['by'],
        set: ['to'],
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

describe('configuration checks', () => {
  const state = getStateModule();
  it("should return configured component ids of ['counter']", () =>
    expect(state.components).to.include('counter'));
  it('should return the configured action dispatchers', () => {
    expect(state.actions).to.be.a('object');
    expect(state.actions).to.have.property('increment');
    expect(state.actions).to.have.property('counter');
  });
  it('should have mid of "my-module"', () => expect(state.mid).to.be.equal('my-module'));
  it('should properly assign mid when not provided', () => expect(State().mid).to.be.equal('state-module-1'));
  it('should properly assign mid when not provided', () => expect(State().mid).to.be.equal('state-module-2'));
});

describe('state module has public api methods expected', () => {
  const state = getStateModule();
  it('has state.components', () => expect(state.components).to.be.an('array'));
  it('has state.actions', () => expect(state.actions).to.be.a('object'));
  it('has state.dispatch', () => expect(state.dispatch).to.be.a('function'));
  it('has state.connect', () => expect(state.connect).to.be.a('function'));
  it('has state.component', () => expect(state.component).to.be.a('function'));
  it('has state.create', () => expect(state.create).to.be.a('function'));
  it('has state.component', () => expect(state.compose).to.be.a('function'));
  it('has state.select', () => expect(state.select).to.be.a('function'));
  it('has state.resolve', () => expect(state.resolve).to.be.a('function'));
  it('has helpers in context', () => expect(state.context.helpers).to.be.a('object'));
});

describe('dispatch hooks 2', () => {
  const state = getStateModule();

  const changed = state.actions.counter.set(0);

  it('should have returned empty changed values when state changed after action', () => {
    expect(changed).to.be.equal(undefined);
  });

  const hasBefore = hooksRan.has('before');
  const hasAfter = hooksRan.has('after');
  const hasChange = hooksRan.has('change');

  it('should have ran the "before" hook', () => expect(hasBefore).to.equal(true));
  it('should have ran the "after" hook', () => expect(hasAfter).to.equal(true));
  it('should not run the "change" hook when not changed', () => expect(hasChange).to.equal(false));

  const changed2 = state.actions.counter.increment();

  it('should have returned changed values when state changed after action', () => {
    expect(changed2).to.be.an('array');
    expect(changed2.length).to.be.above(0);
  });

  it('should run the "change" hook when changing the value', () =>
    expect(hooksRan.has('change')).to.be.equal(true));

  it('should have the right counter selected state value', () => {
    const counter = state.select('counter');
    expect(counter).to.be.deep.equal({
      value: 1,
      created,
      lastChanged: counter.lastChanged,
    });
  });
});

describe('extending module works (synchronous)', () => {
  const state = getStateModule();

  state.component({
    config: { cid: 'add-decrement-handler' },
    actions: {
      decrement: ['by'],
    },
    reducers: {
      DECREMENT(draft, { by = 1 }) {
        draft.counter.value -= by;
        draft.counter.lastChanged = performance.now();
      },
    },
  });

  it('should now include "add-decrement-handler" cid', () => {
    expect(state.components).to.be.a('array');
    expect(state.components).to.include('add-decrement-handler');
  });

  it('should now have the decrement property', () => {
    expect(state.actions).to.have.property('decrement');
    expect(state.actions.decrement).to.be.a('function');
  });

  it('should propertly execute the extended command (decrement)', () => {
    const changedValues = state.actions.decrement();
    expect(changedValues).to.not.be.equal(undefined);
    expect(changedValues).to.include('counter');
    expect(changedValues).to.include('counter.value');
  });

  it('should have a value of -1 after decrement', () => {
    const value = state.select('counterValue');
    expect(value).to.equal(-1);
  });

  it('should also allow state.create as an alias to state.component', () => {
    state.create({
      config: { cid: 'test-component' },
      state: {
        random: 1,
      },
    });
    expect(state.components).to.include('test-component');
  });
});

describe('ignore prop never dispatches due to hook override', () => {
  const state = getStateModule();

  it('should ignore dispatches that have the ignore property', () => {
    expect(state.actions.increment(10, { ignore: true })).to.be.equal(undefined);

    expect(state.actions.increment(10)).to.include('counter.value');
  });
});

describe('state.select works as expected', () => {
  const state = getStateModule();

  it('should allow a string to select a configured selector', () => {
    const value = state.select('counterValue');
    expect(value).to.be.a('number');
  });

  it('should allow an array to select a configured selector', () => {
    const value = state.select(['counterValue']);
    expect(value).to.be.a('number');
  });

  it('should allow a function to select the state manually', () => {
    const value = state.select(s => s.counter.value);
    expect(value).to.be.a('number');
  });

  it('should pass props to the function if provided in call', () => {
    const value = state.select((s, p) => s.counter[p.prop], { prop: 'value' });
    expect(value).to.be.a('number');
  });

  it('should pass empty frozen object if no props are provided to selector function', () => {
    const value = state.select((s, p) => typeof p === 'object' && Object.isFrozen(p));
    expect(value).to.equal(true);
  });
});

describe('state.dispatch works as expected', () => {
  const state = getStateModule();

  it('allows manual dispatching of actions', () => {
    state.dispatch({
      type: 'INCREMENT',
      by: 5,
    });
    expect(state.select('counterValue')).to.equal(5);
  });

  it('throws an error if "type" is not in a dispatch', done => {
    try {
      state.dispatch({ by: 5 });
    } catch (e) {
      done();
    }
  });

  it('throws an error if "type" is not a string, number, or symbol', () => {
    let errors = 0;
    try {
      state.dispatch({ type: {}, by: 5 });
    } catch (e) {
      errors += 1;
    }
    try {
      state.dispatch({ type: [], by: 5 });
    } catch (e) {
      errors += 1;
    }
    state.dispatch({ type: Symbol.for('MY_ACTION'), by: 5 });
    state.dispatch({ type: 5, by: 5 });
    state.dispatch({ type: 'INCREMENT', by: 5 });
    expect(errors).to.equal(2);
  });

  it('throws an error if "action" dispatched is undefined', () => {
    let errors = 0;
    try {
      state.dispatch();
    } catch (e) {
      errors += 1;
    }
    expect(errors).to.equal(1);
  });
});
