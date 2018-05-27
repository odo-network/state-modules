/* @flow */
import test from 'ava';
import { performance } from 'perf_hooks';
import State from '../src';

const hooksRan = new Set();

const $ = State({
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

$.create({
  config: {
    cid: 'counter',
  },
  state: {
    counter: {
      value: 0,
      created: Date.now(),
      lastChanged: 0,
    },
  },
  reducers: {
    SET(action, state) {
      const newValue = action.to || 0;
      if (newValue !== state.counter.value) {
        state.counter.value = newValue;
        state.counter.lastChanged = performance.now();
      }
    },
    INCREMENT(action, state) {
      const newValue = state.counter.value + (typeof action.by === 'number' ? action.by : 1);
      if (newValue !== state.counter.value) {
        state.counter.value = newValue;
        state.counter.lastChanged = performance.now();
      }
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
    state: state => state,
    value: state => state.counter.value,
    valueChanged: state => ({
      some: 'value',
      value: state.counter.value,
      lastChanged: state.counter.lastChanged,
    }),
  },
});

test('$.mid assigned properly', t => {
  t.is($.mid, 'my-module');
  t.is(State({}).mid, 'state-module-1', 'auto assignment state-module-1');
  t.is(State({}).mid, 'state-module-2');
});

test.serial('$.components returns an array of components created', t => {
  t.deepEqual($.components, ['counter'], '$.components returns ["counter"]');
});

test.serial('dispatch hooks run as expected', async t => {
  await $.actions.counter.set(0);
  t.truthy(hooksRan.has('before'));
  t.truthy(hooksRan.has('after'));
  t.falsy(hooksRan.has('change'));
});

test.serial('dispatch returns changed state', async t => {
  const changedValues = await $.dispatch({
    type: 'INCREMENT',
    by: 2,
  });
  // it should not include "counter.created" since it wasnt changed
  t.deepEqual(
    changedValues,
    { counter: { value: 2, lastChanged: changedValues.counter.lastChanged } },
    'changedValues response properly indicates the changed values in the object',
  );
  t.truthy(hooksRan.has('change'), 'change hook runs as expected');
});

test.serial('$.actions properly dispatch', async t => {
  await $.actions.increment(1);
  const changedValues = await $.actions.counter.increment(1);
  t.deepEqual(changedValues, { counter: { value: 4, lastChanged: changedValues.counter.lastChanged } });
});

test.serial('before hook returning null will cancel dispatch', async t => {
  const changedValues = await $.actions.increment(1, { ignore: true });
  t.is(changedValues, undefined);
});

test.serial('$.select works as expected', t => {
  const state = $.select('state');
  const value = $.select('value');
  const valueAndLastChanged = $.select('valueChanged');
  t.is(4, value, 'selecting the value properly returns the expected value');
  t.deepEqual(
    valueAndLastChanged,
    {
      some: 'value',
      value: 4,
      lastChanged: state.counter.lastChanged,
    },
    'select returns the object the selector returns',
  );
  t.deepEqual(
    $.select(s => ({
      some: 'value',
      value: s.counter.value,
    })),
    { some: 'value', value: 4 },
    'select with a function provides state and returns result',
  );
});

test.serial('$.create properly merges values into the module', t => {
  t.is($.select(s => s.counter.secondValue), undefined);
  $.create({
    config: {
      cid: 'second-component',
    },
    state: {
      t: 1,
      counter: {
        secondValue: 100,
      },
    },
  });

  t.deepEqual($.components, ['counter', 'second-component'], '$.components has second-component');
  t.is($.select(s => s.counter.secondValue), 100);
});
