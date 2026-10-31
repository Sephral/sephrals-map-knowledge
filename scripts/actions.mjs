/**
 * What the GM does with the tools, the window, the API and Regions: reveal or hide shapes, the whole Level, share one
 * player's knowledge with others, take the last change back. Each of these becomes a change for the chosen players.
 */

import {MODULE_ID, players, setting, t} from "./config.mjs";
import {fogApiReady, knowledgePicture, remembers, sharesFog, wholeShape} from "./fog.mjs";
import {countResults, deliver, undoChange} from "./relay.mjs";
import {LIMITS, targetIds} from "./shapes.mjs";
import {countFeature} from "./usage.mjs";

/** Usage counters by what made a change. */
const FEATURES = {rect: "revealed", ellipse: "revealed", polygon: "polygonUsed", room: "roomRevealed",
  whole: "levelChanged", region: "regionTriggered", share: "shared", api: "revealed"};

/**
 * The players a change from the tools or the window goes to: everyone or the chosen players, everyone with shared fog.
 * @param {Scene} [scene]
 * @returns {string[]}
 */
export function chosenPlayers(scene = canvas.scene) {
  const users = game.users.map(u => ({id: u.id, isGM: u.isGM}));
  return targetIds({all: setting("targetAll"), chosen: setting("targetChosen")}, users, sharesFog(scene));
}

/**
 * The players a change goes to: the given ones or the chosen ones. With shared fog always every player, because
 * Foundry merges the explorations of all players there and a player left out would bring the area back.
 * @param {Scene} scene
 * @param {string[]} [users]
 * @returns {string[]}
 */
function playersFor(scene, users) {
  if ( sharesFog(scene) ) return players().map(u => u.id);
  return users ?? chosenPlayers(scene);
}

/**
 * Why no change can be made on a scene right now, or null.
 * @param {Scene|null} scene
 * @returns {string|null}   A localization key
 */
export function blocker(scene) {
  if ( !game.user.isGM ) return "SMK.Notice.gmOnly";
  if ( !fogApiReady() ) return "SMK.Notice.noFogApi";
  if ( !scene ) return "SMK.Notice.noScene";
  if ( !scene.tokenVision ) return "SMK.Notice.noVision";
  if ( !remembers(scene) ) return "SMK.Notice.noExploration";
  return null;
}

/**
 * Report the result of a change in a notification when something went wrong or nobody got it.
 * @param {object} entry
 * @param {{quiet?: boolean}} [options]
 */
function report(entry, {quiet = false} = {}) {
  const {done, failed, missing, unanswered} = countResults(entry.results);
  if ( failed ) ui.notifications.warn(t("SMK.Notice.failed", {failed, done}));
  else if ( missing ) ui.notifications.warn(t("SMK.Notice.noSnapshot", {missing}));
  else if ( unanswered ) ui.notifications.warn(t("SMK.Notice.unanswered", {count: unanswered}));
  else if ( !entry.users.length && !quiet ) ui.notifications.warn(t("SMK.Notice.noPlayers"));
}

/**
 * Reveal or hide shapes for players on a scene and Level.
 * @param {object[]} shapes   See shapes.mjs
 * @param {object} [options]
 * @param {boolean} [options.hide]       Hide instead of reveal
 * @param {Scene} [options.scene]        The viewed scene by default
 * @param {string} [options.level]       The viewed Level by default
 * @param {string[]} [options.users]     The chosen players by default
 * @param {string} [options.kind]        What made it (rect, ellipse, polygon, room, whole, region, api)
 * @param {boolean} [options.quiet]      No notification when nobody got it
 * @returns {Promise<object|null>}   The history entry, null when nothing could be done
 */
export async function changeShapes(shapes, {hide = false, scene = canvas.scene, level, users, kind = "api",
  quiet = false} = {}) {
  const problem = blocker(scene);
  if ( problem ) {
    ui.notifications.warn(t(problem));
    return null;
  }
  if ( !shapes?.length ) return null;
  level ??= (scene === canvas.scene) ? canvas.level?.id : scene._view ?? scene.initialLevel?.id;
  // Players check the shapes they get against the same limit
  const op = {action: hide ? "hide" : "reveal", scene: scene.id, level, shapes: shapes.slice(0, LIMITS.shapes),
    whole: kind === "whole"};
  const entry = await deliver(op, playersFor(scene, users), {kind});
  countFeature(MODULE_ID, hide ? "hidden" : (FEATURES[kind] ?? "revealed"));
  report(entry, {quiet});
  return entry;
}

/**
 * Reveal or hide the whole viewed Level for the chosen players.
 * @param {{hide?: boolean, users?: string[]}} [options]
 * @returns {Promise<object|null>}
 */
export async function changeWholeLevel({hide = false, users} = {}) {
  const scene = canvas.scene;
  if ( !scene ) return null;
  return changeShapes([wholeShape(scene)], {hide, users, kind: "whole"});
}

/**
 * Give players everything another player knows of the viewed scene and Level (the scout tells the others).
 * @param {string} fromUserId
 * @param {string[]} [users]   The chosen players by default, the source left out
 * @returns {Promise<object|null>}
 */
export async function shareKnowledge(fromUserId, users) {
  const scene = canvas.scene;
  const problem = blocker(scene);
  if ( problem ) {
    ui.notifications.warn(t(problem));
    return null;
  }
  const level = canvas.level.id;
  const image = await knowledgePicture(scene, level, [fromUserId]);
  if ( !image ) {
    ui.notifications.warn(t("SMK.Notice.sourceKnowsNothing", {name: game.users.get(fromUserId)?.name ?? ""}));
    return null;
  }
  const targets = playersFor(scene, users).filter(id => id !== fromUserId);
  const entry = await deliver({action: "share", scene: scene.id, level, shapes: [], image, whole: true,
    from: fromUserId}, targets, {kind: "share"});
  countFeature(MODULE_ID, "shared");
  report(entry);
  return entry;
}

/**
 * Take the newest change back.
 * @returns {Promise<object|null>}
 */
export async function undoLast() {
  if ( !game.user.isGM ) return null;
  const undo = await undoChange();
  if ( !undo ) {
    ui.notifications.info(t("SMK.Notice.nothingToUndo"));
    return null;
  }
  countFeature(MODULE_ID, "undone");
  report(undo, {quiet: true});
  return undo;
}

/**
 * The players of the world for the window: name, color, online, chosen.
 * @returns {object[]}
 */
export function playerRows() {
  const all = setting("targetAll");
  const chosen = new Set(setting("targetChosen") ?? []);
  return players().map(user => ({id: user.id, name: user.name, color: user.color?.css ?? String(user.color ?? ""),
    online: user.active, chosen: all || chosen.has(user.id)}));
}
