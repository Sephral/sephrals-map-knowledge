/**
 * The made-up data of the sample windows (api.samples). Pure: no Foundry, no settings. Functions take the text function
 * `t(key, data)` where they need texts.
 */

/** The players of the sample party (the same names as in every module's samples) with their colors. */
export const PLAYERS = [
  {id: "lena", name: "Lena", color: "#d9534f"},
  {id: "tom", name: "Tom", color: "#3b82c4"},
  {id: "sam", name: "Sam", color: "#3f9b5a"},
  {id: "jo", name: "Jo", color: "#c28f1d"}
];

/** The tools of the scene controls with their icons, in the order of the real bar (layer.mjs). */
export const TOOLS = [
  {key: "rect", icon: "fa-solid fa-vector-square"},
  {key: "ellipse", icon: "fa-regular fa-circle"},
  {key: "polygon", icon: "fa-solid fa-draw-polygon"},
  {key: "room", icon: "fa-solid fa-door-open"},
  {key: "hideMode", icon: "fa-solid fa-eye-slash"},
  {key: "overlay", icon: "fa-solid fa-users-viewfinder"},
  {key: "view", icon: "fa-solid fa-user-secret"},
  {key: "check", icon: "fa-solid fa-clipboard-check"},
  {key: "panel", icon: "fa-solid fa-sliders"},
  {key: "undo", icon: "fa-solid fa-rotate-left"}
];

/** The keys the module registers. */
export const KEYS = ["openPanel", "toggleMode", "viewNext", "viewPrevious"];

/** The problems the window can name, as the keys of the notices. */
export const PROBLEMS = {vision: "SMK.Notice.noVision", exploration: "SMK.Notice.noExploration", api: "SMK.Notice.noFogApi",
  scene: "SMK.Notice.noScene"};

/** The kinds of changes, in the order of the history. */
const HISTORY = [
  {kind: "rect", action: "reveal", ago: 2},
  {kind: "ellipse", action: "hide", ago: 4},
  {kind: "polygon", action: "reveal", ago: 7},
  {kind: "room", action: "reveal", ago: 11},
  {kind: "whole", action: "hide", ago: 15},
  {kind: "region", action: "reveal", ago: 19},
  {kind: "share", action: "share", ago: 24},
  {kind: "api", action: "reveal", ago: 30},
  {kind: "rect", action: "reveal", ago: 33, undone: true},
  {kind: "polygon", action: "undo", ago: 36}
];

/**
 * The results of a change: every player got it, or one did not.
 * @param {number} count
 * @param {boolean} [failed]
 * @returns {Record<string, {result: string}>}
 */
export function sampleResults(count, failed = false) {
  const results = {};
  PLAYERS.slice(0, count).forEach((player, index) => {
    results[player.id] = {result: (failed && index === count - 1) ? "failed" : (index % 2 ? "stored" : "live")};
  });
  return results;
}

/**
 * Changes of the history, newest first.
 * @param {number} [now]
 * @returns {{id: string, kind: string, action: string, undone: boolean, at: number, results: object}[]}
 */
export function sampleHistory(now = Date.now()) {
  return HISTORY.map((entry, index) => ({id: `sample-${index}`, kind: entry.kind, action: entry.action,
    undone: !!entry.undone, at: now - entry.ago * 60000, results: sampleResults(4)}));
}

/**
 * What the window shows for a kind of sample (see PanelApp._panelSource).
 * @param {string} kind   "tools", "shared", "vision", "exploration", "api", "empty"
 * @param {{t: Function, place: string, level: string, theme?: string, now?: number}} context
 * @returns {object}
 */
export function panelSource(kind, {t, place, level, theme = "signature", now = Date.now()}) {
  const rows = (online, chosen) => PLAYERS.map((player, index) => ({...player, online: online[index], chosen: chosen[index]}));
  const base = {theme, scene: place, level, fog: t("SMK.Panel.fogIndividual"), problem: "", shared: false, hide: false,
    targetAll: false, rows: rows([true, true, true, false], [true, true, false, false]), last: null, canUndo: false,
    layerActive: false, overlay: true, overlayUser: "tom", checkFirst: false, viewing: ""};
  const change = (what, results, ago) => ({kind: what.kind, action: what.action, undone: false, at: now - ago * 60000,
    results});
  if ( kind === "tools" ) {
    return {...base, last: change({kind: "rect", action: "reveal"}, sampleResults(2), 2), canUndo: true};
  }
  if ( kind === "shared" ) {
    return {...base, fog: t("SMK.Panel.fogShared"), shared: true, hide: true, layerActive: true, overlayUser: "",
      rows: rows([true, true, true, true], [true, true, true, true]), checkFirst: true, viewing: "tom", canUndo: true,
      last: change({kind: "polygon", action: "hide"}, sampleResults(4, true), 3)};
  }
  if ( kind === "empty" ) {
    return {...base, scene: t("SMK.Panel.noScene"), level: "", fog: "", problem: t(PROBLEMS.scene), rows: [],
      overlay: false, overlayUser: ""};
  }
  if ( PROBLEMS[kind] ) return {...base, problem: t(PROBLEMS[kind]), level: ""};
  return base;
}

/**
 * The four bars over the map as the models of `fillBar`: checking what reveals, hides and both, and the view.
 * @param {string} other   The name of a player who does not get the change
 * @returns {{check: object|null, view: object|null}[]}
 */
export function barModels(other = PLAYERS[2].name) {
  const check = (what, name, count, notAffected = false) => ({check: {name, count, what, notAffected}, view: null});
  return [
    check("revealing", PLAYERS[0].name, 1),
    check("hiding", PLAYERS[1].name, 2),
    check("mixed", other, 3, true),
    {check: null, view: {name: PLAYERS[1].name}}
  ];
}
