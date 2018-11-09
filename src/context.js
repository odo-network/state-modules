export const MODULE_NAME = 'StateModules';

export const STATE_SELECTOR = Symbol(`@@${MODULE_NAME}/SelectorMeta`);

export const emptyFrozenObject = Object.freeze(Object.create(null));

// eslint-disable-next-line
export function noop() {}

// export const StateManagers = new Map();
