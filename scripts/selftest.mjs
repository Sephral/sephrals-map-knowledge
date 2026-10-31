/**
 * Self-test: what the module relies on in Foundry 14 (the fog manager's extension points, stored explorations per
 * Level, wall polygons, Region behaviors, the socket), the texts, and a small drawing round trip.
 */

import {BEHAVIOR_TYPE, LAYER, MODULE_ID, TESTED_VERSIONS, esc, t} from "./config.mjs";
import {drawingWorks, fogApiReady} from "./fog.mjs";

/**
 * Run all checks.
 * @returns {Promise<{problems: string[], checks: number}>}
 */
async function checkAll() {
  const problems = [];
  let checks = 0;
  const check = (ok, key, data) => {
    checks++;
    if ( !ok ) problems.push(game.i18n.has(key) ? t(key, data) : key);
  };
  check((game.release?.generation ?? 0) >= 14, "SMK.SELFTEST.Generation", {version: game.version});
  check(fogApiReady(), "SMK.SELFTEST.FogApi");
  const modes = CONST.FOG_EXPLORATION_MODES;
  check(!!modes && (modes.DISABLED === 0) && (typeof modes.SHARED === "number"), "SMK.SELFTEST.FogModes");
  const cls = CONFIG.FogExploration?.documentClass;
  check(!!cls?.database && cls.schema?.has?.("level") && cls.schema?.has?.("explored"), "SMK.SELFTEST.Explorations");
  check(typeof CONFIG.Canvas.polygonBackends?.move?.create === "function", "SMK.SELFTEST.Walls");
  check(!!CONFIG.RegionBehavior.dataModels[BEHAVIOR_TYPE], "SMK.SELFTEST.Behavior");
  check(game.modules.get(MODULE_ID)?.socket === true, "SMK.SELFTEST.Socket");
  check(!canvas?.ready || !!canvas[LAYER], "SMK.SELFTEST.Layer");
  for ( const key of ["targetAll", "targetChosen", "overlay"] ) {
    check(game.settings.settings.has(`${MODULE_ID}.${key}`), "SMK.SELFTEST.Storage", {key});
  }
  const keys = ["SMK.Panel.title", "SMK.Controls.title", "SMK.Notice.noExploration", "SMK.BEHAVIOR.FIELDS.area.label"];
  const missing = keys.filter(key => !game.i18n.has(key));
  check(!missing.length, "SMK.SELFTEST.Texts", {keys: missing.join(", ")});
  if ( canvas?.ready ) check(await drawingWorks().catch(() => false), "SMK.SELFTEST.Drawing");
  return {problems, checks};
}

/**
 * Run the self-test and report the result.
 * @param {object} [options]
 * @param {boolean} [options.report=true]
 * @returns {Promise<{problems: string[], checks: number}>}
 */
export async function runSelfTest({report = true} = {}) {
  const {problems, checks} = await checkAll();
  const summary = problems.length ? t("SMK.SELFTEST.Problems", {problems: problems.length, checks})
    : t("SMK.SELFTEST.Passed", {checks});
  if ( problems.length ) ui.notifications.warn(summary, {permanent: true});
  else ui.notifications.info(summary);
  if ( report ) {
    const versions = t("SMK.SELFTEST.Version", {current: game.version, tested: TESTED_VERSIONS.core});
    let content = `<h3>${esc(t("SMK.SELFTEST.Title"))}</h3><p>${esc(summary)}</p><p><small>${esc(versions)}</small></p>`;
    if ( problems.length ) content += `<ul>${problems.map(p => `<li>${esc(p)}</li>`).join("")}</ul>`;
    await ChatMessage.implementation.create({content, whisper: [game.user.id],
      speaker: {alias: game.modules.get(MODULE_ID).title}});
  }
  return {problems, checks};
}

/**
 * Tell the GM once when Foundry is newer than the version the module was verified against.
 */
export function noticeNewVersions() {
  if ( !game.user.isGM ) return;
  if ( !foundry.utils.isNewerVersion(game.version, TESTED_VERSIONS.core) ) return;
  const signature = `core ${game.version}`;
  if ( game.settings.get(MODULE_ID, "acknowledgedVersions") === signature ) return;
  game.settings.set(MODULE_ID, "acknowledgedVersions", signature);
  ui.notifications.info(t("SMK.SELFTEST.NewVersions", {versions: signature}), {permanent: true});
}
