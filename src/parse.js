// Used for automatic id assignment of state modules.
let i = 0;

/**
 * Parse the received settings, do a simple cloning of the settings and
 * parse / remove invalid hooks.
 * @param {*} _settings
 */
export function moduleSettings(_settings) {
  const settings = { ..._settings };
  // Check to see if a module id (mid) is provided in the "config" property and auto create one if not
  settings.config = Object.assign({}, settings.config);
  if (!settings.config.mid) {
    i += 1;
    settings.config.mid = `state-module-${i}`;
  }
  // Check if hooks are defined, if they are remove them if they do not contain at least a single entry
  // Also allows hooks to return any value other than function to indicate they should not be included.
  // Empty hooks after parsing end up being removed all together.
  if (settings.hooks) {
    settings.hooks = Object.assign({}, settings.hooks);
    for (const hook in settings.hooks) {
      if (Object.prototype.hasOwnProperty.call(settings.hooks, hook)) {
        if (Array.isArray(settings.hooks[hook]) || settings.hooks[hook] instanceof Set) {
          settings.hooks[hook] = Array.from(settings.hooks[hook]).filter(h => typeof h === 'function');
          if (settings.hooks[hook].length === 0) {
            delete settings.hooks[hook];
          }
        }
      }
    }
  }
  return settings;
}
