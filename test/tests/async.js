import { expect } from 'chai';
import { performance } from 'perf_hooks';
import State from '../../src';

const created = performance.now();

export function getStateModule(loadsOnAction, scopeID, scope) {
  const state = State({
    config: {
      mid: 'my-module',
    },
  });

  state.component({
    config: {
      cid: 'counter',
      scopeID,
      loadsOnAction,
    },
    scope,
    state: {
      counter: {
        value: 0,
        created,
        lastChanged: 0,
      },
    },
    reducers: {
      SET(draft, { to }) {
        if (to !== this.state.counter.value) {
          draft.counter.lastChanged = performance.now();
        }
        draft.counter.value = to;
      },
      INCREMENT(draft, { by = 1 }) {
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

describe('[async] | Importing asynchronous scope', () => {
  const scopeID = 'myScope';
  const scope = () => import('./testimport');

  it('has scope once the asynchronous scope is resolved', async () => {
    const state = getStateModule(undefined, 'myScope', scope);

    expect(state.context.scope).to.be.a('object');
    expect(state.context.scope).to.not.have.property(scopeID);

    const promise = state.resolve();
    expect(promise.then).to.be.a('function');

    const flag = await promise;

    expect(flag).to.be.equal(1);

    const expectedScope = await scope();

    expect(state.context.scope).to.have.property(scopeID);
    expect(state.context.scope[scopeID]).to.deep.equal(expectedScope);
    expect(state.context.scope[scopeID].testImport()).to.be.equal(true);
  });

  it('resolves immediately if no scope is provided', async () => {
    const state = getStateModule();

    const flag = await state.resolve();

    expect(flag).to.be.equal(0);
  });

  it('rejects if the scope is invalid', async () => {
    let errors = 0;
    try {
      const state = getStateModule(undefined, 'myScope', () => import('./some_invalid_file'));

      await state.resolve();
    } catch (e) {
      errors += 1;
    }
    expect(errors).to.be.equal(1);
  });
});
