import { expect } from 'chai';
import { performance } from 'perf_hooks';
import State from '../../src';

const created = performance.now();

export function getStateModule() {
  const state = State({
    config: { mid: 'subscription-tests' },
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
          draft.counter.value = to;
        }
      },
      INCREMENT({ by = 1 }, draft) {
        if (by !== 0) {
          draft.counter.lastChanged = performance.now();
          draft.counter.value += by;
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

describe('state.subscribe [action]', () => {
  const state = getStateModule();

  it('allows subscribing to an action [once]', done => {
    let complete = false;
    state.subscribe('action', 'INCREMENT', true).subscribe({
      next() {
        if (complete) {
          throw new Error('COMPLETE YET  NEXT WAS CALLED AGAIN!');
        }
      },
      complete() {
        complete = true;
        done();
      },
    });

    state.actions.increment();
    state.actions.increment();
  });

  it('allows subscribing to actions [ongoing]', done => {
    let complete = false;
    const subscription = state.subscribe('action', 'INCREMENT').subscribe({
      next() {
        if (complete) {
          subscription.unsubscribe();
        }
        complete = true;
      },
      complete() {
        done();
      },
    });

    state.actions.increment();
    state.actions.increment();
  });

  it('allows subscribing to an array of types', done => {
    let complete = false;
    const subscription = state.subscribe('action', ['INCREMENT', 'RANDOM']).subscribe({
      next() {
        if (complete) {
          subscription.unsubscribe();
        }
        complete = true;
      },
      complete() {
        done();
      },
    });
    state.actions.increment();
    state.dispatch({
      type: 'RANDOM',
    });
  });

  it('allows subscribing using a subscriber function', done => {
    let complete = false;
    state.subscribe('action', action => action.by === 3, true).subscribe({
      next() {
        if (!complete) {
          throw new Error('First dispatch should not have triggered next()');
        }
        done();
      },
    });
    state.actions.increment();
    complete = true;
    state.actions.increment(3);
  });

  it('allows subscribing to an array mixed of strings and subscriber functions', done => {
    let complete = false;
    const subscription = state.subscribe('action', ['RANDOM', action => action.by === 3]).subscribe({
      next() {
        if (complete) {
          subscription.unsubscribe();
        }
        complete = true;
      },
      complete() {
        done();
      },
    });
    state.actions.increment(3);
    state.dispatch({
      type: 'RANDOM',
    });
  });

  it('sends all expected properties to each next() invocation', done => {
    let complete = false;
    state.subscribe('action', 'INCREMENT', true).subscribe({
      next(action, context) {
        if (complete) {
          throw new Error('sends all expected properties executed after cancelled');
        }
        expect(action).to.deep.equal({
          type: 'INCREMENT',
          by: 1,
        });
        expect(context).to.have.property('state');
        expect(context).to.have.nested.property('state.counter.value');
        expect(context).to.have.property('select');
        expect(context).to.have.property('selectors');
        expect(context).to.have.property('components');
        expect(context).to.have.property('helpers');
        expect(context).to.have.property('config');
        expect(context.config.mid).to.equal('subscription-tests');
        expect(context).to.have.property('actions');
        expect(context.actions).to.have.property('increment');
        expect(context).to.have.property('scope');
      },
      complete() {
        complete = true;
        done();
      },
    });
    state.actions.increment(1);
  });

  it('returns a subscription object which can unsubscribe from the action on-demand', done => {
    const subscription = state.subscribe('action', 'NEVAH_GONNA_HAPPEN').subscribe({
      next() {
        throw new Error('should not have executed the next function in returns a subscription object test');
      },
      complete(reason) {
        expect(reason).to.equal('why_not?');
        done();
      },
    });
    expect(subscription).to.have.property('unsubscribe');
    expect(subscription).to.have.property('cancel');
    expect(subscription.cancel).to.equal(subscription.unsubscribe);
    expect(subscription.condition).to.equal('NEVAH_GONNA_HAPPEN');
    subscription.unsubscribe('why_not?');
  });
});

describe('state.subscribe [selector]', () => {
  const state = getStateModule();

  it('allows subscribing to a selector [once]', done => {
    let complete = false;
    state.subscribe('selector', { deep: { value: 'counter.value' } }, true).subscribe({
      next(snapshot) {
        if (complete) {
          throw new Error('COMPLETE YET NEXT WAS CALLED AGAIN! (Once Failure)');
        }
        const selected = snapshot.state;
        expect(selected).to.deep.equal({
          deep: {
            value: 1,
          },
        });
        expect(snapshot).to.have.property('context');
        complete = true;
      },
      complete() {
        done();
      },
    });

    state.actions.increment();
    state.actions.increment();
  });

  it('only triggers next() if a selected value changes', done => {
    let complete = false;
    state.subscribe('selector', { deep: { value: 'counter.value' } }, true).subscribe({
      next(snapshot) {
        if (complete) {
          throw new Error('COMPLETE YET NEXT WAS CALLED AGAIN! (Once Failure)');
        }
        complete = true;
        const selected = snapshot.state;
        expect(selected).to.deep.equal({
          deep: {
            value: 3,
          },
        });
        expect(snapshot).to.have.property('context');
      },
      complete() {
        done();
      },
    });

    state.actions.increment(0);
    state.actions.increment(1);
  });
});

describe('throws an error if invalid subscription', () => {
  const state = getStateModule();

  it('throws if not subscribing to valid subscription type', () => {
    let errors = 0;
    try {
      state.subscribe('bleh', {}, true);
    } catch (e) {
      errors += 1;
    }
    expect(errors).to.equal(1);
  });
});
