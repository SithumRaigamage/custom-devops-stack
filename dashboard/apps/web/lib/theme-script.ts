import {
  DEFAULT_DARK,
  DEFAULT_THEME_NAME,
  buildTheme,
  themeByName,
} from "./themes";

export const THEME_STORAGE_KEY = "stackpilot-theme";
export const THEME_STORAGE_VERSION = 1;

/** The default token map, so the first paint has colours before React hydrates. */
const DEFAULT_TOKENS = buildTheme(themeByName(DEFAULT_THEME_NAME), DEFAULT_DARK);

/**
 * Runs in <head> before paint so the default theme, or a saved one, is on <html>
 * immediately. It gets its values from buildTheme() rather than duplicating them in CSS.
 */
export const themeInitScript = `(function(){var root=document.documentElement;var defaults=${JSON.stringify(
  DEFAULT_TOKENS,
)};var tokens=defaults;var mode=${JSON.stringify(
  DEFAULT_DARK ? "dark" : "light",
)};var theme=${JSON.stringify(DEFAULT_THEME_NAME)};try{var raw=window.localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(raw){var saved=JSON.parse(raw);if(saved&&saved.version===${THEME_STORAGE_VERSION}){tokens=saved.tokens||defaults;if(saved.mode){mode=saved.mode;}if(saved.theme){theme=saved.theme;}}}}catch(e){}try{for(var key in tokens){if(Object.prototype.hasOwnProperty.call(tokens,key)){root.style.setProperty('--'+key,tokens[key]);}}root.dataset.mode=mode;root.dataset.theme=theme;root.style.colorScheme=mode;}catch(e){}})();`;
