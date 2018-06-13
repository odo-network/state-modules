// Any quick tests that we want to run `yarn try`
import { performance } from 'perf_hooks';
import createState from './src/index';

const state = createState();

state.component({
  config: { cid: 'counter' },
  state: {
    counter: {
      value: 1,
    },
  },
  selectors: {
    counterValue: 'counter.value',
  },
  actions: {
    increment: ['by'],
    decrement: ['by'],
  },
  reducers: {
    INCREMENT({ by = 1 }, draft) {
      draft.counter.value += by;
    },
    DECREMENT({ by = 1 }, draft) {
      draft.counter.value -= by;
    },
  },
});

state.actions
  .increment(5)
  .then(changedValues => state.actions.decrement(3))
  .then(changedValues => {
    console.log(state.select('counterValue'));
  });
