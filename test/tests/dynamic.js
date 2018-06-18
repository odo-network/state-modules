import { expect } from 'chai';
import { performance } from 'perf_hooks';
import State, { defaultMerger } from '../../src';

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
      counters: {
        default: { value: 0, created, updated: 0 },
      },
    },
    helpers: {
      createCounter(draft, counterID, initialValue = 0) {
        draft.counter[counterID] = {
          value: initialValue,
          updated: Date.now(),
        };
      },
    },
    reducers: {
      INCREMENT({ by = 1, counterID = 'default' }, draft) {
        if (!draft.counter[counterID]) {
          this.helpers.createCounter(draft, counterID);
        }
        if (by !== 0) {
          draft.counter.value += by;
          draft.counter[counterID].updated = Date.now();
        }
      },
    },
    actions: {
      increment: ['by', 'counterID'],
    },
    selectors: {
      counterByID: props => ['counter', props.counterID || 'default'],
    },
  });

  return state;
}

// describe('[dynamic] | dynamic selectors based on connected props', () => {
//   const state = getStateModule();

//   it('dynamic', async () => {
//     state.actions.increment(1, 'test');
//   });
// });
