/**
 * The GM's window next to the tools: reveal or hide, for whom, the whole Level, share one player's knowledge, show
 * what the players know, and the last change with its undo.
 */

import {ICON, LAYER, MODULE_ID, TEMPLATES, addSettingsGear, isShown, setting, t} from "./config.mjs";
import {blocker, changeWholeLevel, playerRows, shareKnowledge, undoLast} from "./actions.mjs";
import {sharesFog} from "./fog.mjs";
import {hideMode, setHideMode} from "./layer.mjs";
import {changes, countResults} from "./relay.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/** Labels of the kinds of changes. */
const KIND_LABELS = {rect: "SMK.Kind.rect", ellipse: "SMK.Kind.ellipse", polygon: "SMK.Kind.polygon",
  room: "SMK.Kind.room", whole: "SMK.Kind.whole", region: "SMK.Kind.region", share: "SMK.Kind.share",
  api: "SMK.Kind.api"};

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
      tools: PanelApp.#onTools
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

  /** @override */
  async _prepareContext() {
    const scene = canvas.scene;
    const level = canvas.level;
    const problem = blocker(scene);
    const shared = sharesFog(scene);
    const rows = playerRows();
    if ( !rows.some(r => r.id === this.#shareFrom) ) this.#shareFrom = rows[0]?.id ?? "";
    const last = changes().at(-1);
    const overlayUser = setting("overlayUser");
    return {
      theme: setting("theme"),
      scene: scene?.navName || scene?.name || t("SMK.Panel.noScene"),
      level: (scene?.levels?.size > 1) ? (level?.name ?? "") : "",
      fog: scene ? t(shared ? "SMK.Panel.fogShared" : "SMK.Panel.fogIndividual") : "",
      problem: problem ? t(problem) : "",
      shared,
      hide: hideMode(),
      all: shared || setting("targetAll"),
      players: rows.map(r => ({...r, chosen: shared || r.chosen, share: r.id === this.#shareFrom,
        overlay: r.id === overlayUser})),
      noPlayers: !rows.length,
      overlay: setting("overlay"),
      overlayGroup: !overlayUser,
      last: last ? this.#lastLine(last) : "",
      canUndo: changes().some(e => !e.undone),
      layerActive: canvas[LAYER]?.active ?? false,
      text: {
        reveal: t("SMK.Panel.reveal"),
        hide: t("SMK.Panel.hide"),
        modeHint: t("SMK.Panel.modeHint"),
        who: t("SMK.Panel.who"),
        all: t("SMK.Panel.all"),
        chosen: t("SMK.Panel.chosen"),
        sharedNote: t("SMK.Panel.sharedNote"),
        noPlayers: t("SMK.Panel.noPlayers"),
        online: t("SMK.Panel.online"),
        offline: t("SMK.Panel.offline"),
        level: t("SMK.Panel.levelTitle"),
        revealWhole: t("SMK.Panel.revealWhole"),
        hideWhole: t("SMK.Panel.hideWhole"),
        shareTitle: t("SMK.Panel.shareTitle"),
        share: t("SMK.Panel.share"),
        shareHint: t("SMK.Panel.shareHint"),
        view: t("SMK.Panel.view"),
        overlay: t("SMK.Panel.overlay"),
        overlayGroup: t("SMK.Panel.overlayGroup"),
        undo: t("SMK.Panel.undo"),
        tools: t("SMK.Panel.tools"),
        toolsHint: t("SMK.Panel.toolsHint")
      }
    };
  }

  /**
   * The line about the last change: what, when, for how many.
   * @param {object} entry
   * @returns {string}
   */
  #lastLine(entry) {
    const what = t(KIND_LABELS[entry.kind] ?? "SMK.Kind.api");
    const action = t(`SMK.Action.${entry.undone ? "undone" : entry.action}`);
    const {done, failed} = countResults(entry.results);
    const time = new Date(entry.at).toLocaleTimeString(game.i18n.lang, {hour: "2-digit", minute: "2-digit"});
    return t(failed ? "SMK.Panel.lastFailed" : "SMK.Panel.last", {what, action, done, failed, time});
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
