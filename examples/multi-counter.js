// state.js
import createState from 'state-modules';

const state = createState();

const created = Date.now();

state.component({
  config: { cid: 'counter' },
  state: {
    shared: { value: 0, created, updated: created },
    counters: {
      default: { value: 0, created, updated: created },
    },
  },
  selectors: {
    counterTotal: 'shared',
    counterByID: props => ['counters', props.counterID || 'default'],
  },
  actions: {
    create: ['counterID', 'initialValue'],
    increment: ['by', 'counterID'],
    decrement: ['by', 'counterID'],
  },
  reducers: {
    CREATE({ counterID, initialValue = 0 }, draft) {
      const now = Date.now();
      draft.counters[counterID] = {
        value: initialValue,
        created: now,
        updated: now,
      };
    },
    INCREMENT({ by = 1, counterID = 'default' }, draft) {
      const now = Date.now();
      if (!draft.counters[counterID]) {
        this.actions.create(counterID);
      }
      const counter = draft.counters[counterID];

      draft.shared.value += by;
      draft.shared.updated = now;

      counter.value += by;
      counter.updated = now;
    },
    DECREMENT({ by = 1, counterID = 'default' }, draft) {
      const now = Date.now();
      if (!draft.counters[counterID]) {
        this.actions.create(counterID);
      }
      const counter = draft.counters[counterID];

      draft.shared.value -= by;
      draft.shared.updated = now;

      counter.value -= by;
      counter.updated = now;
    },
  },
});

export default state;
