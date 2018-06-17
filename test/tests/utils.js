/* @flow */
import { expect } from 'chai';
import { hasProperty } from '../../src/utils';

describe('utils', () => {
  it('utils.hasProperty should check for property existence', () => {
    expect(hasProperty).to.be.a('function');
    expect(hasProperty({ key: undefined }, 'key')).to.be.true;
    expect(hasProperty({}, 'key')).to.be.false;
  });
});
