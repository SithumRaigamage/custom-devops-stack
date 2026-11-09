export const THEME_STORAGE_KEY = "stackpilot-theme";
export const THEME_STORAGE_VERSION = 1;

/**
 * Runs in <head> before paint so a saved theme is on <html> immediately.
 * ThemeProvider stores the resolved token map with the choice, so this script does not
 * need a copy of the theme generator.
 */
export const themeInitScript = `(function(){try{var raw=window.localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(!raw)return;var saved=JSON.parse(raw);if(!saved||saved.version!==${THEME_STORAGE_VERSION})return;var root=document.documentElement;var tokens=saved.tokens||{};for(var key in tokens){if(Object.prototype.hasOwnProperty.call(tokens,key)){root.style.setProperty('--'+key,tokens[key]);}}if(saved.mode){root.dataset.mode=saved.mode;root.style.colorScheme=saved.mode;}if(saved.theme){root.dataset.theme=saved.theme;}}catch(e){}})();`;
