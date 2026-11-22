/**
 * Sephral's Translator shows texts live. The floating bar of the view and the check (GM) is built by hand and keeps
 * the texts it was drawn with, so a render of a window does not reach it. The translator calls the hook
 * "sephrals-translator.refresh" with the changed keys and this module builds the bar again when one of its keys is
 * among them. Without the translator the hook is never called. The map layer itself draws no text.
 */

import {MODULE_ID} from "./config.mjs";
import {REFRESH_HOOK, touched} from "./refresh-logic.mjs";
import {updateBar} from "./view.mjs";

/**
 * Build the bar again when the changed keys touch it.
 * @param {{moduleId?: string, keys?: string[]|null}} payload
 * @returns {boolean}   True when the bar was built again
 */
export function onTranslatorRefresh(payload) {
  if ( !touched(payload, MODULE_ID).bar ) return false;
  updateBar();
  return true;
}

/** Listen to the hook. Call once in "init". */
export function startTranslatorRefresh() {
  Hooks.on(REFRESH_HOOK, onTranslatorRefresh);
}
