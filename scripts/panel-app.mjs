/**
 * The GM's window next to the tools: reveal or hide, for whom, the whole Level, share one player's knowledge, show
 * what the players know, and the last change with its undo.
 */

import {ICON, LAYER, MODULE_ID, TEMPLATES, addSettingsGear, isShown, setting, t} from "./config.mjs";
import {blocker, changeWholeLevel, playerRows, shareKnowledge, undoLast} from "./actions.mjs";
import {sharesFog} from "./fog.mjs";
import {hideMode, setHideMode} from "./layer.mjs";
import {changes, countResults} from "./relay.mjs";
import {setViewAs, viewingAs} from "./view.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/** Labels of the kinds of changes. */
export const KIND_LABELS = {rect: "SMK.Kind.rect", ellipse: "SMK.Kind.ellipse", polygon: "SMK.Kind.polygon",
  room: "SMK.Kind.room", whole: "SMK.Kind.whole", region: "SMK.Kind.region", share: "SMK.Kind.share",
  api: "SMK.Kind.api"};

/**
 * The line about a change in the history: what, when, for how many.
 * @param {object} entry
 * @returns {string}
 */
export function describeChange(entry) {
  const what = t(KIND_LABELS[entry.kind] ?? "SMK.Kind.api");
  const action = t(`SMK.Action.${entry.undone ? "undone" : entry.action}`);
  const {done, failed} = countResults(entry.results);
  const time = new Date(entry.at).toLocaleTimeString(game.i18n.lang, {hour: "2-digit", minute: "2-digit"});
  return t(failed ? "SMK.Panel.lastFailed" : "SMK.Panel.last", {what, action, done, failed, time});
}

/**
 * The texts of the window.
 * @returns {Record<string, string>}
 */
function panelTexts() {
  const keys = ["reveal", "hide", "modeHint", "who", "all", "chosen", "sharedNote", "noPlayers", "online", "offline",
    "revealWhole", "hideWhole", "shareTitle", "share", "shareHint", "view", "overlay", "overlayGroup", "undo",
    "viewTitle", "viewOff", "viewHint", "checkFirst", "checkHint", "tools", "toolsHint"];
  const text = Object.fromEntries(keys.map(key => [key, t(`SMK.Panel.${key}`)]));
  text.level = t("SMK.Panel.levelTitle");
  return text;
}

export class PanelApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "smk-panel",
    classes: ["smk-app", "smk-panel"],
    tag: "section",
    window: {title: "SMK.Panel.title", icon: ICON, resizable: false},
    position: {width: 320, height: "auto", top: 110, left: 110},
    actions: {
      mode: PanelApp.#onMode,
      revealWhole: PanelApp.#onRevealWhole,
      hideWhole: PanelApp.#onHideWhole,
      share: PanelApp.#onShare,
      undo: PanelApp.#onUndo,
      tools: PanelApp.#onTools,
      viewAs: PanelApp.#onViewAs
    }
  };

  /** @override */
  static PARTS = {main: {template: `${TEMPLATES}/panel.hbs`}};

  /** The player chosen as source for sharing, kept across redraws. */
  #shareFrom = "";

  /** @override */
  get title() {
    return t("SMK.Panel.title");
  }

  /**
   * What the window shows, read from the world: the viewed scene, the players and the history. The sample window
   * (samples) gives made-up data instead.
   * @returns {object}
   */
  _panelSource() {
    const scene = canvas.scene;
    const level = canvas.level;
    const problem = blocker(scene);
    const rows = playerRows();
    return {
      theme: setting("theme"),
      scene: scene?.navName || scene?.name || t("SMK.Panel.noScene"),
      level: (scene?.levels?.size > 1) ? (level?.name ?? "") : "",
      fog: scene ? t(sharesFog(scene) ? "SMK.Panel.fogShared" : "SMK.Panel.fogIndividual") : "",
      problem: problem ? t(problem) : "",
      shared: sharesFog(scene),
      hide: hideMode(),
      targetAll: setting("targetAll"),
      rows,
      last: changes().at(-1) ?? null,
      canUndo: changes().some(e => !e.undone),
      layerActive: canvas[LAYER]?.active ?? false,
      overlay: setting("overlay"),
      overlayUser: setting("overlayUser"),
      checkFirst: !!setting("checkFirst"),
      viewing: viewingAs()
    };
  }

  /** @override */
  async _prepareContext() {
    const source = this._panelSource();
    const {rows, shared} = source;
    if ( !rows.some(r => r.id === this.#shareFrom) ) this.#shareFrom = rows[0]?.id ?? "";
    return {
      theme: source.theme,
      scene: source.scene,
      level: source.level,
      fog: source.fog,
      problem: source.problem,
      shared,
      hide: source.hide,
      all: shared || source.targetAll,
      players: rows.map(r => ({...r, chosen: shared || r.chosen, share: r.id === this.#shareFrom,
        overlay: r.id === source.overlayUser})),
      noPlayers: !rows.length,
      overlay: source.overlay,
      checkFirst: source.checkFirst,
      viewOff: !source.viewing,
      viewers: rows.map(r => ({id: r.id, name: r.name, color: r.color, online: r.online, on: r.id === source.viewing})),
      overlayGroup: !source.overlayUser,
      last: source.last ? describeChange(source.last) : "",
      canUndo: source.canUndo,
      layerActive: source.layerActive,
      text: panelTexts()
    };
  }

  /** @override */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    addSettingsGear(frame);
    return frame;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.dataset.smkTheme = setting("theme");
    const root = this.element;
    for ( const input of root.querySelectorAll("input[name=targetAll]") ) {
      input.addEventListener("change", () => game.settings.set(MODULE_ID, "targetAll", input.value === "all"));
    }
    for ( const input of root.querySelectorAll("input[data-player]") ) {
      input.addEventListener("change", () => this.#choosePlayer(input.dataset.player, input.checked));
    }
    root.querySelector("select[name=shareFrom]")?.addEventListener("change", event => {
      this.#shareFrom = event.target.value;
    });
    root.querySelector("input[name=checkFirst]")?.addEventListener("change", event => {
      game.settings.set(MODULE_ID, "checkFirst", event.target.checked);
    });
    root.querySelector("input[name=overlay]")?.addEventListener("change", event => {
      game.settings.set(MODULE_ID, "overlay", event.target.checked);
    });
    root.querySelector("select[name=overlayUser]")?.addEventListener("change", event => {
      game.settings.set(MODULE_ID, "overlayUser", event.target.value);
    });
  }

  /**
   * Choose or leave out one player. Choosing a single player switches from "all players" to the chosen ones.
   * @param {string} userId
   * @param {boolean} chosen
   */
  async #choosePlayer(userId, chosen) {
    const current = setting("targetAll") ? playerRows().map(r => r.id) : [...(setting("targetChosen") ?? [])];
    const next = new Set(current);
    if ( chosen ) next.add(userId);
    else next.delete(userId);
    await game.settings.set(MODULE_ID, "targetChosen", [...next]);
    if ( setting("targetAll") ) await game.settings.set(MODULE_ID, "targetAll", false);
  }

  /* -------------------------------------------- */

  /**
   * @this {PanelApp}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onMode(event, target) {
    setHideMode(target.dataset.mode === "hide");
  }

  /** @this {PanelApp} */
  static async #onRevealWhole() {
    await changeWholeLevel({hide: false});
  }

  /** @this {PanelApp} */
  static async #onHideWhole() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: {title: t("SMK.Panel.hideWhole")},
      content: `<p>${t("SMK.Panel.hideWholeConfirm")}</p>`
    });
    if ( ok ) await changeWholeLevel({hide: true});
  }

  /** @this {PanelApp} */
  static async #onShare() {
    if ( this.#shareFrom ) await shareKnowledge(this.#shareFrom);
  }

  /** @this {PanelApp} */
  static async #onUndo() {
    await undoLast();
  }

  /** @this {PanelApp} */
  static #onViewAs(event, target) {
    return setViewAs(target.dataset.user || null);
  }

  /** @this {PanelApp} */
  static #onTools() {
    canvas[LAYER]?.activate();
  }
}

/**
 * Open the window, or bring it to the front.
 * @returns {Promise<PanelApp>}
 */
export async function openPanel() {
  if ( !game.user.isGM ) return null;
  const app = foundry.applications.instances.get("smk-panel") ?? new PanelApp();
  await app.render({force: true});
  app.bringToFront?.();
  return app;
}

/**
 * Redraw the window when it is open.
 */
export function refreshPanel() {
  const app = foundry.applications.instances.get("smk-panel");
  if ( isShown(app) ) app.render();
}
