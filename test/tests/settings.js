/* @flow */
import { expect } from 'chai';
import { performance } from 'perf_hooks';
import State, { defaultMerger } from '../../src';

const hooksRan = new Set();

const created = performance.now();

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

describe('configuration checks', () => {
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
  it('has state.components', () => expect(state.components).to.be.an('array'));
  it('has state.actions', () => expect(state.actions).to.be.a('object'));
  it('has state.dispatch', () => expect(state.dispatch).to.be.a('function'));
  it('has state.connect', () => expect(state.connect).to.be.a('function'));
  it('has state.component', () => expect(state.component).to.be.a('function'));
  it('has state.create', () => expect(state.create).to.be.a('function'));
  it('has state.component', () => expect(state.compose).to.be.a('function'));
  it('has state.select', () => expect(state.select).to.be.a('function'));
  it('has state.resolve', () => expect(state.resolve).to.be.a('function'));
});

describe('dispatch hooks', () => {
  const changed = state.actions.counter.set(0);

  it('should have returned empty changed values when state changed after action', () => {
    expect(changed).to.be.equal(undefined);
  });

  it('should have ran the "before" hook', () => expect(hooksRan.has('before')).to.be.true);
  it('should have ran the "after" hook', () => expect(hooksRan.has('after')).to.be.true);
  it('should not run the "change" hook when not changed', () => expect(hooksRan.has('change')).to.be.true);

  const changed2 = state.actions.counter.increment();

  it('should have returned changed values when state changed after action', () => {
    expect(changed2).to.be.an('array');
    expect(changed2.length).to.be.above(0);
  });

  it('should run the "change" hook when changing the value', () => expect(hooksRan.has('change')).to.be.true);

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
  state.component({
    config: { cid: 'add-decrement-handler' },
    actions: {
      decrement: ['by'],
    },
    reducers: {
      DECREMENT({ by = 1 }, draft) {
        draft.counter.value -= by;
        draft.counter.lastChanged = performance.now();
      },
    },
  });

  it('should now include "add-decrement-handler" cid', () => {
    expect(state.components).to.include('add-decrement-handler');
  });

  it('should now have the decrement property', () => {
    expect(state.actions).to.have.property('decrement');
    expect(state.actions.decrement).to.be.a('function');
  });

  it('should propertly execute the extended command (decrement)', () => {
    const changedValues = state.actions.decrement();
    expect(changedValues).to.include('counter');
    expect(changedValues).to.include('counter.value');
  });

  it('should have a value of 0 after decrement', () => {
    expect(state.select('counterValue')).to.be.equal(0);
  });
});

describe('ignore prop never dispatches due to hook override', () => {
  it('should ignore dispatches that have the ignore property', () => {
    expect(state.actions.increment(10, { ignore: true })).to.be.equal(undefined);

    expect(state.actions.increment(10)).to.include('counter.value');
  });
});

describe('utility functions work as expected', () => {
  it('should have defaultMerger that returns itself', () => {
    const obj = { a: 1 };
    expect(defaultMerger(obj)).to.be.equal(obj);
  });
});
