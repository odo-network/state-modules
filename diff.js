/* @flow */
import _ from 'lodash';

// const r = objectDifference(
//   {
//     one: 'two',
//     three: 'five',
//     five: ['six', { seven: 'eight' }],
//     six: ['seven', { seven: 'eight' }],
//     seven: {
//       one: 'two',
//       three: 'four',
//       five: {
//         six: 'seven',
//         eight: 'nine',
//       },
//     },
//   },
//   {
//     one: 'two',
//     three: 'four',
//     five: ['six', { seven: 'eight' }],
//     six: ['seven', { seven: 'eight', nine: 'ten' }],
//     seven: {
//       one: 'two',
//       three: 'fours',
//       five: {
//         six: 'seven',
//         eight: 'nines',
//       },
//     },
//   },
//   {
//     shallowKeys: ['five'],
//   },
// );

type ObjectDifferenceParams = {
  deep: boolean,
  depth: number,
  shallowKeys: Array<string>,
  deepKeys: Array<string>,
  includeKeys: Array<string>,
  ignoreKeys: Array<string>,
};

type ObjectDiffResponse = {
  [changedKey: string]: any,
};

type ObjectDifferenceParamArguments = {
  ...ObjectDifferenceParams,
};

type ObjectDifferenceState = {
  depth: number,
};

const DEFAULT_PARAMS: ObjectDifferenceParams = {
  // do we want to resolve object deeply?
  deep: true,
  // how deep should we go?
  depth: Infinity,
  // any keys in the object that should never
  // be traversed deep.  If different, the entire
  // new value will be returned.
  //
  // TIP: shallowKeys will take precedence over deepKeys
  // if a conflict arises.
  shallowKeys: [],
  // any keys that should ALWAYS be resolved deep
  // regardless of any other settings.
  deepKeys: [],
  // any keys that should ALWAYS be included regardless
  // of if the value has changed.
  includeKeys: [],
  // any keys that should ALWAYS be ignored regardless
  // of if the value has changed.
  ignoreKeys: [],
};

const DEFAULT_STATE: ObjectDifferenceState = {
  depth: 0,
};

function checkObj(
  diff: Object,
  obj: Object,
  source: Object,
  params: ObjectDifferenceParams,
  state: ObjectDifferenceState,
): void {
  // determine what to do with an object type
  // based on the params and state values.
  state.depth += 1;

  const addValue = (key, value) => {
    if (params.ignoreKeys.includes(key)) {
      return;
    }
    if (typeof value === 'object') {
      diff[key] = _.cloneDeep(value);
    } else {
      diff[key] = value;
    }
  };

  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (source[key] === undefined) {
      addValue(key, value);
    } else if (!_.isEqual(source[key], value) || params.includeKeys.includes(key)) {
      // are we dealing with a plain object? { ...values }
      if (!_.isPlainObject(value)) {
        // arrays and plain values are copied over directly
        // TODO: Should we diff the array at some point?
        addValue(key, value);
      } else if ((!params.deep || state.depth > params.depth) && !params.deepKeys.includes(key)) {
        // if we are not resolving deep or reached the depth
        // value, then we copy over the entire value.
        addValue(key, value);
      } else if (params.shallowKeys.includes(key)) {
        // we do not traverse shallowKeys, however we do
        // clone them to prevent mutation worries and promote
        // the same general behavior across all parameter options.
        addValue(key, value);
      } else {
        // create a copy of the state for the next
        // level of depth to use so we dont run into
        // conflicts.
        //
        // add the object that will be mutated onto our diff value.
        diff[key] = {};
        checkObj(diff[key], obj[key], source[key], params, { ...state });
      }
    }
  }
}

/**
 * Capture the difference between objects with various
 * parameters available to customize the response.
 */
export default function objectDifference(
  obj: Object,
  source: Object,
  _params: ObjectDifferenceParamArguments = {},
): ObjectDiffResponse {
  const params: ObjectDifferenceParams = {
    ...DEFAULT_PARAMS,
    ..._params,
  };
  const state: ObjectDifferenceState = {
    ...DEFAULT_STATE,
  };
  const diff = {};
  checkObj(diff, obj, source, params, state);
  return diff;
}
