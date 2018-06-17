/* @flow */
import { expect } from 'chai';
import { getSelectedState, hasProperty } from '../../src/utils';

describe('utils', () => {
  it('utils.hasProperty should check for property existence', () => {
    expect(hasProperty).to.be.a('function');
    expect(hasProperty({ key: undefined }, 'key')).to.be.true;
    expect(hasProperty({}, 'key')).to.be.false;
  });
});

describe('getSelectedState', () => {
  const state = {
    one: 'two',
    two: {
      three: 'four',
    },
  };

  it('should allow an object property to select given values in state', () => {
    const selector = {
      foo: 'one',
      bar: 'two.three',
    };
    const selected = getSelectedState(state, selector);
    expect(selected.foo).to.equal('two');
    expect(selected.bar).to.equal('four');
  });

  it('should allow passing props function to calculate state path', () => {
    const selected = getSelectedState(state, props => ['two', props.value], { value: 'three' });
    expect(selected).to.equal('four');
  });

  it('should allow a string property to select a given value in state', () => {
    const selected = getSelectedState(state, 'two.three');
    expect(selected).to.equal('four');
  });

  it('should allow an array property to select a given value in state', () => {
    const selected = getSelectedState(state, ['two', 'three']);
    expect(selected).to.equal('four');
  });

  it('should allow a combination of all the properties to select a value in state', () => {
    const selected = getSelectedState(
      state,
      {
        deep: {
          one: ['two', 'three'],
          two: props => ['two', props.value],
          three: 'two.three',
          four: props => ({
            five: ['two', props.value],
          }),
        },
      },
      { value: 'three' },
    );
    expect(selected.deep.one).to.equal('four');
    expect(selected.deep.two).to.equal('four');
    expect(selected.deep.three).to.equal('four');
    expect(selected.deep.four.five).to.equal('four');
    expect(selected).to.deep.equal({
      deep: {
        one: 'four',
        two: 'four',
        three: 'four',
        four: {
          five: 'four',
        },
      },
    });
  });
});
