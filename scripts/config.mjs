/**
 * Constants and small helpers shared by the scripts of the module. The module runs on Foundry 14 only: fog of war
 * per Level and the extension points of the fog manager it draws into came with 14.
 */

/** The id of this module. */
export const MODULE_ID = "sephrals-map-knowledge";

/** The socket of the module. */
export const SOCKET = `module.${MODULE_ID}`;

/** The folder of the module's templates. */
export const TEMPLATES = `modules/${MODULE_ID}/templates`;

/** The Foundry versions the module was verified against (see the self-test). */
export const TESTED_VERSIONS = {core: "14.370"};

/** The name of the canvas layer and of its scene control group. */
export const LAYER = "mapKnowledge";

/** The type of the Region behavior that reveals or hides an area. */
export const BEHAVIOR_TYPE = `${MODULE_ID}.reveal`;

/** The icon of the module. */
export const ICON = "fa-solid fa-map-location-dot";

/**
 * Read a setting of this module.
 * @param {string} key
 * @returns {*}
 */
export function setting(key) {
  return game.settings.get(MODULE_ID, key);
}

/**
 * Localize a key, with optional data.
 * @param {string} key
 * @param {object} [data]
 * @returns {string}
 */
export function t(key, data) {
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

/**
 * Escape a value for HTML.
 * @param {*} value
 * @returns {string}
 */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;",
    "'": "&#39;"})[ch]);
}

/**
 * Is a window open or on its way? While an application renders, its "rendered" flag is false, and a redraw asked
 * for in that moment would be lost.
 * @param {ApplicationV2|undefined} app
 * @returns {boolean}
 */
export function isShown(app) {
  const states = foundry.applications.api.ApplicationV2.RENDER_STATES;
  return !!app && ((app.state === states.RENDERED) || (app.state === states.RENDERING));
}

/**
 * Open Foundry's settings on the tab of this module.
 */
export async function openSettings() {
  const sheet = game.settings.sheet;
  await sheet.render({force: true});
  try {
    sheet.changeTab(MODULE_ID, "categories");
  } catch(err) {
    console.warn(`${MODULE_ID} | The settings have no tab for this module`, err);
  }
  sheet.bringToFront?.();
}

/**
 * Put a gear into the title bar of a window that opens the settings of this module. The window is for GMs only, so
 * every user who sees one gets the gear.
 * @param {HTMLElement} frame   The window frame
 */
export function addSettingsGear(frame) {
  const header = frame?.querySelector(".window-header");
  if ( !header || header.querySelector(".smk-settings") ) return;
  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = "header-control icon fa-solid fa-gear smk-settings";
  gear.dataset.tooltip = t("SMK.gear");
  gear.setAttribute("aria-label", t("SMK.gear"));
  gear.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openSettings();
  });
  const anchor = header.querySelector("[data-action=toggleControls]") ?? header.querySelector("[data-action=close]");
  if ( anchor ) anchor.before(gear);
  else header.append(gear);
}

/**
 * The players of the world: every user who is not a GM or an assistant.
 * @returns {User[]}
 */
export function players() {
  return game.users.filter(user => !user.isGM);
}
