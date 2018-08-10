const hasOwn = Object.prototype.hasOwnProperty;

function is(x, y) {
  if (x === y) {
    return x !== 0 || y !== 0 || 1 / x === 1 / y;
  }
  return x !== x && y !== y;
}

export function deepEqual(objA, objB) {
  if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) {
    return false;
  }

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;

  for (let i = 0; i < keysA.length; i += 1) {
    if (!hasOwn.call(objB, keysA[i])) {
      return false;
    }
    const a2 = Reflect.get(objA, keysA[i]);
    const b2 = Reflect.get(objB, keysA[i]);

    if (typeof a2 === 'object') {
      if (!deepEqual(a2, b2)) {
        return false;
      }
    } else if (!is(a2, b2)) {
      return false;
    }
  }

  return true;
}

export function shallowEqual(objA, objB) {
  if (is(objA, objB)) return true;

  if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) {
    return false;
  }

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;

  for (let i = 0; i < keysA.length; i += 1) {
    if (!hasOwn.call(objB, keysA[i]) || !is(objA[keysA[i]], objB[keysA[i]])) {
      return false;
    }
  }

  return true;
}
