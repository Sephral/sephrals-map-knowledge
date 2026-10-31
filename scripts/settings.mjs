/**
 * Settings of the module. Like in every Sephral module, all options appear in Foundry's settings dialog under this
 * module, starting with the module language.
 */

import {ICON, MODULE_ID, isShown} from "./config.mjs";
import {FOLLOW_FOUNDRY, applyModuleLanguage} from "./language.mjs";
import {runSelfTest} from "./selftest.mjs";

/**
 * The settings of the module, in the order they appear in the settings dialog.
 * @type {Record<string, object>}
 */
export const SETTINGS = {
  uiLanguage: {type: String, default: FOLLOW_FOUNDRY, scope: "client", onChange: "language", choices: {
    [FOLLOW_FOUNDRY]: "SMK.LANGUAGE.default", de: "SMK.LANGUAGE.de", en: "SMK.LANGUAGE.en"}},
  theme: {type: String, default: "signature", scope: "client", onChange: "redraw", choices: {
    signature: "SMK.SETTINGS.theme.signature", foundry: "SMK.SETTINGS.theme.foundry"}},
  openPanel: {type: Boolean, default: true, scope: "client"},
  overlayColor: {type: new foundry.data.fields.ColorField({nullable: false, initial: "#14213d"}), default: "#14213d",
    scope: "client", onChange: "overlay"},
  overlayOpacity: {type: Number, default: 0.6, scope: "client", range: {min: 0.2, max: 0.9, step: 0.05},
    onChange: "overlay"},
  notifyPlayers: {type: Boolean, default: false}
};

/**
 * Register all settings of the module and its menus.
 * @param {{language: Function, redraw: Function, overlay: Function, openPanel: Function}} handlers
 */
export function registerSettings(handlers) {
  openPanelMenu = handlers.openPanel;
  for ( const [key, def] of Object.entries(SETTINGS) ) {
    game.settings.register(MODULE_ID, key, {
      name: `SMK.SETTINGS.${key}.name`,
      hint: `SMK.SETTINGS.${key}.hint`,
      scope: def.scope ?? "world",
      config: true,
      type: def.type,
      choices: def.choices,
      range: def.range,
      default: def.default,
      onChange: def.onChange ? value => handlers[def.onChange]?.(value) : undefined
    });
  }

  // The GM's choice of players and the view of what they know, kept per browser
  game.settings.register(MODULE_ID, "targetAll", {scope: "client", config: false, type: Boolean, default: true,
    onChange: () => handlers.redraw()});
  game.settings.register(MODULE_ID, "targetChosen", {scope: "client", config: false, type: Array, default: [],
    onChange: () => handlers.redraw()});
  game.settings.register(MODULE_ID, "overlay", {scope: "client", config: false, type: Boolean, default: false,
    onChange: () => handlers.overlay()});
  game.settings.register(MODULE_ID, "overlayUser", {scope: "client", config: false, type: String, default: "",
    onChange: () => handlers.overlay()});
  game.settings.register(MODULE_ID, "acknowledgedVersions", {scope: "client", config: false, type: String,
    default: ""});

  game.settings.registerMenu(MODULE_ID, "panel", {
    name: "SMK.Panel.title",
    label: "SMK.Panel.open",
    hint: "SMK.Panel.menuHint",
    icon: ICON,
    type: PanelMenu,
    restricted: true
  });
  game.settings.registerMenu(MODULE_ID, "selfTest", {
    name: "SMK.SELFTEST.Title",
    label: "SMK.SELFTEST.Run",
    hint: "SMK.SELFTEST.Hint",
    icon: "fa-solid fa-stethoscope",
    type: SelfTestMenu,
    restricted: true
  });
}

/** Opens the window for the menu button. */
let openPanelMenu = () => {};

/** The menu button which opens the window (the one window, not a second copy of it). */
class PanelMenu extends foundry.applications.api.ApplicationV2 {
  /** @override */
  async render() {
    await openPanelMenu();
    return this;
  }
}

/** The menu button which runs the self-test. Foundry only accepts application classes as menus. */
class SelfTestMenu extends foundry.applications.api.ApplicationV2 {
  /** @override */
  async render() {
    if ( game.user.isGM ) await runSelfTest();
    return this;
  }
}

/**
 * Switch the module strings when the user picks another module language, then redraw.
 * @param {string} value
 * @param {Function} redraw
 */
export function changeLanguage(value, redraw) {
  applyModuleLanguage(value).then(() => {
    const app = foundry.applications.instances.get("smk-panel");
    if ( isShown(app) ) app.render({window: {title: app.title}});
    redraw();
    if ( game.settings.sheet?.rendered ) game.settings.sheet.render();
    ui.controls?.render({reset: true});
  });
}
