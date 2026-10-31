/**
 * Map Knowledge's part of the debug file of Sephral's modules: the viewed scene and its fog settings, the GM's recent
 * changes with their result per player, and the recent decisions. No pictures of the fog.
 */

import {BEHAVIOR_TYPE, MODULE_ID, t} from "./config.mjs";
import {DebugTrace, registerDebugMenu, registerDebugProvider} from "./debug-file.mjs";

/** The recent decisions of the module. */
export const trace = new DebugTrace();

/** Reads the module state; set by the entry script, so this file stays free of canvas code for its tests. */
let readState = () => ({});

/**
 * Run one part and keep its error instead, so one broken reading does not cost the rest.
 * @param {Function} fn
 * @returns {*}
 */
function attempt(fn) {
  try {
    return fn();
  } catch(err) {
    return {error: String(err?.message ?? err)};
  }
}

/**
 * What the module knows right now.
 * @returns {object}
 */
export function describeState() {
  const scene = attempt(() => canvas?.scene ?? null);
  return {
    viewed: attempt(() => (scene ? {scene: scene.uuid, level: canvas.level?.id ?? null, tokenVision: scene.tokenVision,
      fogMode: scene.fog?.mode ?? null, levels: scene.levels?.size ?? null} : null)),
    texture: attempt(() => {
      const cfg = canvas?.visibility?.textureConfiguration;
      return cfg ? {width: cfg.width, height: cfg.height, resolution: cfg.resolution} : null;
    }),
    behaviors: attempt(() => game.scenes.reduce((n, s) => n + s.regions.reduce((m, r) =>
      m + r.behaviors.filter(b => b.type === BEHAVIOR_TYPE).length, 0), 0)),
    players: attempt(() => game.users.filter(u => !u.isGM).map(u => ({id: u.id, active: u.active}))),
    ...attempt(() => readState())
  };
}

/**
 * The button in the settings and the module's part of the file. Call in "init".
 * @param {() => object} [state]   More of the module state (history, snapshots, waiting changes)
 */
export function registerDebug(state) {
  if ( state ) readState = state;
  registerDebugMenu(MODULE_ID, {name: "SMK.DEBUG.Title", label: "SMK.DEBUG.Save", hint: "SMK.DEBUG.Hint"});
  registerDebugProvider({
    moduleId: MODULE_ID,
    label: () => t("SMK.DEBUG.Entry"),
    notice: file => t("SMK.DEBUG.Saved", {file}),
    recent: () => ({details: describeState()}),
    trace
  });
}
