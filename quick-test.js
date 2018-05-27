import _ from 'lodash';

const ObjOne = {
  one: {
    two: 2,
  },
};

const ObjTwo = {
  one: {
    one: 1,
  },
};

_.mergeWith(ObjOne, ObjTwo, () => undefined);

console.log(ObjOne);
