/* @flow */
import test from 'ava';
import { performance } from 'perf_hooks';
import State from '../src';

const hooksRan = new Set();

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
      created: Date.now(),
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

test('state.mid assigned properly', t => {
  t.is(state.mid, 'my-module');
  t.is(State({}).mid, 'state-module-1', 'auto assignment state-module-1');
  t.is(State({}).mid, 'state-module-2');
});

test.serial('state.components returns an array of components created', t => {
  t.deepEqual(state.components, ['counter'], 'state.components returns ["counter"]');
});

test.serial('dispatch hooks run as expected', async t => {
  await state.actions.counter.set(0);
  t.truthy(hooksRan.has('before'));
  t.truthy(hooksRan.has('after'));
  t.falsy(hooksRan.has('change'));
  await state.actions.counter.increment();
  t.truthy(hooksRan.has('change'));
  const currentCounter = state.select('counter');
  t.deepEqual(
    {
      value: 1,
      created: currentCounter.created,
      lastChanged: currentCounter.lastChanged,
    },
    currentCounter,
  );
});

test.serial('extending module works (synchronous)', async t => {
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
  t.truthy(state.components.includes('add-decrement-handler'));
  t.truthy(state.actions.decrement);

  const changedValues = await state.actions.decrement();

  t.truthy(changedValues.includes('counter.value'));

  t.is(state.select('counterValue'), 0);
});

test.serial('ignore prop never dispatches due to hook override', async t => {
  const changedValuesIgnored = await state.actions.increment(10, { ignore: true });

  t.truthy(!changedValuesIgnored);

  const changedValues = await state.actions.increment(10);

  t.truthy(changedValues.includes('counter.value'));
});
