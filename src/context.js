export const MODULE_NAME = 'StateModules';

export const SELECTOR_CHILDREN = Symbol(`@@${MODULE_NAME}/SelectorChildren`);

export const SELECTOR_PATH = Symbol(`@@${MODULE_NAME}/SelectorPath`);

// Used for storing the private methods and properties of each manager
export const ManagerPrivateState = new WeakMap();

export const emptyFrozenObject = Object.freeze(Object.create(null));
