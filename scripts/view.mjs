/**
 * The player view and the check before a change is applied. The GM looks at the map as one chosen player knows it: a
 * cover over everything that player has not explored (their stored fog of war, which includes what Map Knowledge
 * revealed for them). With "check before applying" a finished shape waits as a pending change, the cover shows the map
 * as that player would know it after the change, and the GM applies or discards it. Nothing here writes a fog: the
 * stored explorations are only read and drawn into textures of this client.
 */

import {LAYER, MODULE_ID, players, setting, t} from "./config.mjs";
import {blocker, changeShapes, chosenPlayers} from "./actions.mjs";
import {drawChange, knowledgeTexture, sharesFog} from "./fog.mjs";
import {refreshPanel} from "./panel-app.mjs";
import {MAX_PENDING, addPending, cycleUser, describePending, previewUser, viewUsers, wouldAffect}
  from "./view-logic.mjs";
import {countFeature} from "./usage.mjs";

/** How often the view looks at the player's fog again while it is on, in milliseconds. */
const POLL = 8000;

/** The player whose map the GM looks at, "" for nobody. Kept in memory only, so a reload never leaves it on. */
let viewAs = "";

/** The player chosen for a check while no view is on. */
let checkUser = "";

/** Changes waiting for the check: {action, shapes, kind}. */
let pending = [];

/** The scene and Level the pending changes were drawn for. */
let pendingScene = "";

let run = 0;
let timer = 0;
let bar = null;

/**
 * The ids of the players of the world.
 * @returns {string[]}
 */
function playerIds() {
  return players().map(u => u.id);
}

/**
 * Whose map the screen shows now.
 * @returns {string}
 */
export function shownUser() {
  return previewUser({viewAs, checkUser, chosen: chosenPlayers(), playerIds: playerIds(), pending: !!pending.length});
}

/**
 * The player of the view, or "" when it is off.
 * @returns {string}
 */
export function viewingAs() {
  return viewAs;
}

/**
 * Is checking before applying on?
 * @returns {boolean}
 */
export function checkFirst() {
  return game.user.isGM && !!setting("checkFirst");
}

/**
 * The changes waiting for the check.
 * @returns {object[]}
 */
export function pendingChanges() {
  return pending;
}

/* -------------------------------------------- */
/*  The cover                                   */
/* -------------------------------------------- */

/**
 * Draw the cover for the player now shown, or remove it.
 * @returns {Promise<void>}
 */
export async function refreshView() {
  const id = ++run;
  const layer = canvas?.ready ? canvas[LAYER] : null;
  if ( !game.user.isGM || !layer ) return;
  layer.drawPending(pending);
  const user = shownUser();
  const scene = canvas.scene;
  if ( !user || blocker(scene) ) {
    layer.clearCover();
    updateBar();
    return;
  }
  try {
    const users = viewUsers(user, {shared: sharesFog(scene), playerIds: playerIds()});
    const {texture, area} = await knowledgeTexture(scene, canvas.level.id, users);
    try {
      for ( const op of pending ) await drawChange(texture, area, op);
    } catch(err) {
      texture.destroy(true);
      throw err;
    }
    if ( (id !== run) || !canvas.ready || (canvas[LAYER] !== layer) ) {
      texture.destroy(true);
      return;
    }
    layer.setCover(texture, area);
  } catch(err) {
    console.error(`${MODULE_ID} | Could not show the player view`, err);
    layer.clearCover();
  }
  updateBar();
}

/** Look again soon, several triggers in a row count once. */
export const refreshViewSoon = foundry.utils.debounce(() => refreshView(), 600);

/** Look again after tokens moved, the player's client saves its fog after a short while. */
export const refreshViewLater = foundry.utils.debounce(() => refreshView(), 3500);

/** Keep an interval while a view is on. */
function watch() {
  const wanted = !!viewAs;
  if ( wanted && !timer ) {
    timer = setInterval(() => {
      if ( game.users.get(viewAs)?.active ) refreshView();
    }, POLL);
  } else if ( !wanted && timer ) {
    clearInterval(timer);
    timer = 0;
  }
}

/* -------------------------------------------- */
/*  The view                                    */
/* -------------------------------------------- */

/**
 * Look at the map as a player knows it, or turn the view off.
 * @param {string|User|null} user   A player, or null for off
 * @returns {Promise<string>}   The player now viewed, "" for off
 */
export async function setViewAs(user) {
  if ( !game.user.isGM ) return "";
  let id = user?.id ?? user ?? "";
  if ( id && !playerIds().includes(id) ) id = "";
  const problem = id ? blocker(canvas.scene) : null;
  if ( problem ) {
    ui.notifications.warn(t(problem));
    id = "";
  }
  if ( id === viewAs ) return viewAs;
  if ( id && !viewAs ) countFeature(MODULE_ID, "viewShown");
  if ( id && viewAs ) countFeature(MODULE_ID, "viewSwitched");
  viewAs = id;
  if ( id ) checkUser = "";
  watch();
  refreshPanel();
  await refreshView();
  return viewAs;
}

/**
 * Go to the next or previous player of the view: off, each player, off.
 * @param {number} [step=1]
 * @returns {Promise<string>}
 */
export async function viewNext(step = 1) {
  if ( !game.user.isGM ) return "";
  return setViewAs(cycleUser(playerIds(), viewAs, step));
}

/**
 * The bar's switch: with a view on it moves the view, while only a check waits it moves the checked player around the
 * players.
 * @param {number} step
 */
async function switchUser(step) {
  if ( viewAs || !pending.length ) {
    await viewNext(step);
    return;
  }
  const ids = playerIds();
  if ( !ids.length ) return;
  const at = Math.max(ids.indexOf(shownUser()), 0);
  checkUser = ids[(at + (step < 0 ? -1 : 1) + ids.length) % ids.length];
  countFeature(MODULE_ID, "viewSwitched");
  await refreshView();
}

/** The setting "check before applying" changed. */
export function onCheckChanged() {
  const tool = ui.controls?.controls?.[LAYER]?.tools?.check;
  if ( tool && (tool.active !== !!setting("checkFirst")) ) ui.controls.render({reset: true});
  refreshPanel();
  updateBar();
}

/* -------------------------------------------- */
/*  Checking before applying                    */
/* -------------------------------------------- */

/**
 * Let a finished shape wait for the check.
 * @param {object[]} shapes
 * @param {{hide: boolean, kind: string}} options
 * @returns {Promise<boolean>}  Whether the shape waits
 */
export async function holdChange(shapes, {hide, kind}) {
  const problem = blocker(canvas.scene);
  if ( problem ) {
    ui.notifications.warn(t(problem));
    return false;
  }
  if ( !pending.length ) pendingScene = `${canvas.scene.id}${canvas.level.id}`;
  addPending(pending, {action: hide ? "hide" : "reveal", shapes, kind}, MAX_PENDING);
  await refreshView();
  return true;
}

/**
 * Apply the waiting changes, one after the other (each can be taken back on its own).
 * @returns {Promise<object[]>}  The history entries
 */
export async function applyPending() {
  if ( !game.user.isGM || !pending.length ) return [];
  const ops = pending;
  pending = [];
  checkUser = "";
  const entries = [];
  for ( const op of ops ) {
    const entry = await changeShapes(op.shapes, {hide: op.action === "hide", kind: op.kind});
    if ( entry ) entries.push(entry);
  }
  countFeature(MODULE_ID, "previewApplied");
  await refreshView();
  return entries;
}

/**
 * Throw the waiting changes away.
 * @param {{count?: boolean}} [options]
 */
export async function discardPending({count = true} = {}) {
  if ( !pending.length ) return;
  pending = [];
  checkUser = "";
  if ( count ) countFeature(MODULE_ID, "previewDiscarded");
  await refreshView();
}

/** The canvas goes away: the waiting changes belonged to it. */
export function onTearDown() {
  pending = [];
  checkUser = "";
  run++;
  pendingScene = "";
  updateBar();
}

/** The canvas is ready: look again, and drop waiting changes of another scene or Level. */
export function onCanvasReady() {
  if ( !game.user.isGM ) return;
  if ( pending.length && (pendingScene !== `${canvas.scene?.id}${canvas.level?.id}`) ) pending = [];
  refreshView();
  watch();
}

/* -------------------------------------------- */
/*  The bar                                     */
/* -------------------------------------------- */

/**
 * A button of the bar.
 * @param {string} icon
 * @param {string} label
 * @param {Function} fn
 * @param {string} action
 * @param {boolean} [textless]
 * @returns {HTMLButtonElement}
 */
function barButton(icon, label, fn, action, textless = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = action;
  button.setAttribute("aria-label", label);
  button.dataset.tooltip = label;
  const i = document.createElement("i");
  i.className = `fa-solid ${icon}`;
  button.append(i);
  if ( !textless ) button.append(document.createTextNode(` ${label}`));
  button.addEventListener("click", event => {
    event.preventDefault();
    Promise.resolve(fn()).catch(err => console.error(`${MODULE_ID} | The view bar failed`, err));
  });
  return button;
}

/** Build or remove the floating bar for the current state. */
export function updateBar() {
  const show = game.user.isGM && canvas?.ready && (viewAs || pending.length);
  if ( !show ) {
    bar?.remove();
    bar = null;
    return;
  }
  if ( !bar ) {
    bar = document.createElement("div");
    bar.id = "smk-viewbar";
    bar.className = "smk-app smk-viewbar";
    bar.setAttribute("role", "region");
    document.body.append(bar);
  }
  bar.dataset.smkTheme = setting("theme");
  bar.replaceChildren();
  const row = cls => {
    const el = document.createElement("div");
    el.className = `smk-viewbar-row ${cls}`;
    bar.append(el);
    return el;
  };
  const label = (el, icon, text) => {
    const span = document.createElement("span");
    span.className = "smk-viewbar-label";
    const i = document.createElement("i");
    i.className = `fa-solid ${icon}`;
    span.append(i, document.createTextNode(` ${text}`));
    el.append(span);
  };
  if ( pending.length ) {
    const counts = describePending(pending);
    const what = (counts.hide && counts.reveal) ? t("SMK.View.mixed")
      : t(counts.hide ? "SMK.View.hiding" : "SMK.View.revealing");
    const user = game.users.get(shownUser());
    const el = row("is-check");
    label(el, "fa-clipboard-check", t("SMK.View.checkAs", {name: user?.name ?? "", count: counts.shapes, what}));
    if ( !wouldAffect(user?.id, chosenPlayers()) ) {
      const note = document.createElement("span");
      note.className = "smk-viewbar-note";
      note.textContent = t("SMK.View.notAffected", {name: user?.name ?? ""});
      el.append(note);
    }
    el.append(barButton("fa-chevron-left", t("SMK.View.previous"), () => switchUser(-1), "prev", true),
      barButton("fa-chevron-right", t("SMK.View.next"), () => switchUser(1), "next", true),
      barButton("fa-check", t("SMK.View.apply"), applyPending, "apply"),
      barButton("fa-xmark", t("SMK.View.discard"), () => discardPending(), "discard"));
  }
  if ( viewAs ) {
    const el = row("is-view");
    label(el, "fa-eye", t("SMK.View.viewing", {name: game.users.get(viewAs)?.name ?? ""}));
    el.append(barButton("fa-chevron-left", t("SMK.View.previous"), () => viewNext(-1), "viewPrev", true),
      barButton("fa-chevron-right", t("SMK.View.next"), () => viewNext(1), "viewNext", true),
      barButton("fa-eye-slash", t("SMK.View.exit"), () => setViewAs(null), "exit"));
  }
}

/**
 * The state of the view, for the debug file and tests.
 * @returns {{viewAs: string, checkUser: string, pending: number, shown: string}}
 */
export function viewState() {
  return {viewAs, checkUser, pending: pending.length, shown: shownUser()};
}
