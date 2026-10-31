/**
 * Getting a change to the players. Every player who is online draws it into their own fog on their own client: live
 * when they look at that scene and Level (Foundry saves it), otherwise into their stored exploration. So nothing the
 * player explored in the last seconds gets lost and no client keeps an old copy. For players who are offline, or
 * whose client does not answer, the GM changes the stored exploration. The player's client answers with what the
 * player knew before, and the GM keeps that for the undo, so an undo also works after a player reloaded.
 */

import {SOCKET, setting, t} from "./config.mjs";
import {trace} from "./debug.mjs";
import {applyLive, applyStored, dropSnapshot, keepSnapshot, pruneSnapshots, sharesFog, snapshotOf,
  viewsLive} from "./fog.mjs";
import {cleanOp, isImage, remember, splitTargets} from "./shapes.mjs";

/** How long the GM waits for the players' clients. */
const ANSWER_TIMEOUT = 12000;

/** With shared fog a player's client may merge in an older copy of another player's map right after a hide; a second
 * pass a moment later removes it again. */
const SECOND_PASS = 2500;

/** How many changes the GM can take back, newest last. */
const MAX_HISTORY = 20;

/** Results that count as done. */
const DONE = new Set(["live", "stored", "gm"]);

/** How long a player's client waits for a scene that is still loading. */
const LOAD_TIMEOUT = 20000;

/** Changes waiting for answers, by change id. */
const pending = new Map();

/** The GM's recent changes, newest last. */
const history = [];

/** Functions to call when the history changes. */
const watchers = new Set();

/** Second passes waiting, by scene and Level. */
const secondPasses = new Map();

/** The end of this client's line of changes. */
let line = Promise.resolve();

/**
 * Run changes one after the other on this client, so two of them never read and write the same fog at once (a macro
 * that does not wait, two Regions on one move, quick drags).
 * @param {Function} fn
 * @returns {Promise<*>}
 */
function inTurn(fn) {
  const run = line.then(fn, fn);
  line = run.catch(() => {});
  return run;
}

/**
 * Wait while this client still loads the scene of a change: Foundry loads the fog before the canvas is ready, and a
 * change saved into the stored exploration in that moment would be overwritten by the next save of the live fog.
 * @param {{scene: string}} op
 * @returns {Promise<void>}
 */
function sceneLoaded(op) {
  if ( (canvas?.scene?.id !== op.scene) || (canvas.ready && !canvas.loading) ) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      Hooks.off("canvasReady", hook);
      resolve();
    }, LOAD_TIMEOUT);
    const hook = Hooks.once("canvasReady", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Listen to the module socket. Call in "ready".
 */
export function registerRelay() {
  game.socket.on(SOCKET, (message, senderId) => onMessage(message, senderId));
}

/**
 * The GM's recent changes, newest last.
 * @returns {object[]}
 */
export function changes() {
  return history;
}

/**
 * Call a function whenever the history changes.
 * @param {Function} fn
 */
export function watchChanges(fn) {
  watchers.add(fn);
}

/**
 * Tell the watchers and other modules about a change.
 * @param {object} entry
 */
function changed(entry) {
  for ( const fn of watchers ) {
    try {
      fn(entry);
    } catch(err) {
      console.error(err);
    }
  }
  Hooks.callAll("sephrals-map-knowledge.changed", entry);
}

/**
 * A message on the module socket. Foundry's server adds the sender, so a change is only taken from a GM.
 * @param {object} message
 * @param {string} senderId
 */
function onMessage(message, senderId) {
  if ( !message || (typeof message !== "object") ) return;
  const sender = game.users.get(senderId);
  if ( message.kind === "op" ) {
    if ( !sender?.isGM || !Array.isArray(message.to) || !message.to.includes(game.user.id) ) return;
    const op = cleanOp(message.op);
    if ( !op ) {
      answer(sender, message.op?.id, {result: "failed", reason: "invalid"});
      return;
    }
    inTurn(() => receive(op, sender));
  }
  else if ( message.kind === "reload" ) {
    if ( !sender?.isGM || (typeof message.scene !== "string") || (typeof message.level !== "string") ) return;
    inTurn(() => reloadStored(message));
  }
  else if ( message.kind === "answer" ) {
    const waiting = pending.get(message.id);
    if ( !game.user.isGM || !waiting?.open.has(senderId) ) return;
    const result = {result: String(message.result), reason: message.reason ? String(message.reason) : undefined};
    if ( (message.before === null) || isImage(message.before) ) result.before = message.before;
    waiting.results[senderId] = result;
    waiting.open.delete(senderId);
    if ( !waiting.open.size ) waiting.finish();
  }
}

/**
 * Answer the GM who sent a change, with what this player knew before it.
 * @param {User} gm
 * @param {string} id
 * @param {{result: string, reason?: string, before?: string|null}} answer
 */
function answer(gm, id, {result, reason, before}) {
  game.socket.emit(SOCKET, {kind: "answer", id, result, reason, before}, {recipients: [gm.id]});
}

/**
 * A change for this player: draw it and answer the GM.
 * @param {object} op
 * @param {User} gm
 */
async function receive(op, gm) {
  let done = {result: "failed"};
  try {
    done = await applyOwn(op);
  } catch(err) {
    done = {result: "failed", reason: String(err?.message ?? err)};
    console.error("sephrals-map-knowledge | Could not apply a change", err);
  }
  trace.add("received", {id: op.id, action: op.action, scene: op.scene, level: op.level, result: done.result,
    reason: done.reason});
  answer(gm, op.id, done);
  if ( DONE.has(done.result) && (op.action !== "undo") && setting("notifyPlayers") ) notifyPlayer(op);
}

/**
 * Tell the player that the GM changed their map. The scene is named the way the navigation names it for players;
 * a scene outside the navigation without a navigation name stays unnamed, its real name may be a secret.
 * @param {object} op
 */
function notifyPlayer(op) {
  const scene = game.scenes.get(op.scene);
  const name = scene?.navName || (scene?.navigation ? scene.name : "");
  const key = (op.action === "hide") ? "SMK.Notice.playerForgot" : "SMK.Notice.playerLearned";
  ui.notifications.info(name ? t(key, {scene: name}) : t(`${key}Unnamed`));
}

/**
 * Draw a change into this user's own fog: live when the client views that scene and Level, else stored. An undo
 * brings what the player knew before.
 * @param {object} op
 * @returns {Promise<{result: string, before?: string|null}>}   result "live", "stored" or "noSnapshot"
 */
async function applyOwn(op) {
  if ( (op.action === "undo") && (op.before === undefined) ) return {result: "noSnapshot"};
  const before = (op.action === "undo") ? op.before : null;
  // A newer change wins over the second pass of an older one
  const key = `${op.scene}.${op.level}`;
  clearTimeout(secondPasses.get(key));
  secondPasses.delete(key);
  await sceneLoaded(op);
  const live = viewsLive(op);
  const done = live ? await applyLive(op, before) : await applyStored(op, game.user.id, before);
  if ( live && sharesFog(canvas.scene) && ((op.action === "hide") || (op.action === "undo")) ) {
    secondPasses.set(key, setTimeout(() => {
      secondPasses.delete(key);
      inTurn(() => (viewsLive(op) ? applyLive(op, before) : null)).catch(err => console.error(err));
    }, SECOND_PASS));
  }
  const result = live ? "live" : "stored";
  return (op.action === "undo") ? {result} : {result, before: done.before};
}

/**
 * The GM changed this player's stored exploration because the client did not answer in time: forget the cached copy
 * and load it again when this scene and Level are on the screen.
 * @param {{scene: string, level: string}} where
 */
async function reloadStored({scene, level}) {
  const collection = game.collections.get("FogExploration");
  const user = game.user.id;
  for ( const doc of collection.filter(d => ((d.scene?.id ?? d.scene) === scene) && (d.level === level)
    && ((d.user?.id ?? d.user) === user)) ) {
    collection.delete(doc.id);
  }
  // Foundry loads the document from the server again once the cached copy is gone
  if ( viewsLive({scene, level}) ) await canvas.fog.load();
}

/**
 * Send a change to players and wait for their answers.
 * @param {object} op
 * @param {string[]} ids
 * @returns {Promise<Record<string, {result: string, reason?: string}>>}
 */
function sendAndWait(op, ids) {
  return new Promise(resolve => {
    const waiting = {open: new Set(ids), results: {}};
    const timer = setTimeout(() => waiting.finish(), ANSWER_TIMEOUT);
    waiting.finish = () => {
      clearTimeout(timer);
      pending.delete(op.id);
      for ( const id of waiting.open ) waiting.results[id] = {result: "timeout"};
      resolve(waiting.results);
    };
    pending.set(op.id, waiting);
    game.socket.emit(SOCKET, {kind: "op", op, to: ids}, {recipients: ids});
  });
}

/**
 * The GM draws a change into the stored exploration of a player.
 * @param {object} op
 * @param {string} userId
 * @param {string|null} [before]   For an undo
 * @returns {Promise<{result: string, reason?: string}>}
 */
async function applyForPlayer(op, userId, before = null) {
  try {
    const done = await applyStored(op, userId, before);
    if ( op.action === "undo" ) dropSnapshot(op.undo, userId);
    else keepSnapshot(op, userId, done.before);
    return {result: "gm"};
  } catch(err) {
    console.error("sephrals-map-knowledge | Could not change a stored exploration", err);
    return {result: "failed", reason: String(err?.message ?? err)};
  }
}

/**
 * The GM drew a change for a player who is online but did not answer: that client may hold an old copy of the
 * exploration and save it over the GM's, so it is asked to load it again, and the result is marked.
 * @param {object} op
 * @param {string} userId
 * @param {{result: string}} done
 * @param {string} client   What the client answered
 * @returns {object}
 */
function fallbackForOnline(op, userId, done, client) {
  if ( done.result === "gm" ) {
    game.socket.emit(SOCKET, {kind: "reload", scene: op.scene, level: op.level}, {recipients: [userId]});
  }
  return {...done, client, online: true};
}

/**
 * Deliver a change to players (GM): online players draw it themselves, the GM draws it for the others. Changes are
 * delivered one after the other.
 * @param {object} op        Without id: one is made
 * @param {string[]} userIds
 * @param {object} [meta]
 * @param {string} [meta.kind]   What made it, for the history and the debug file
 * @returns {Promise<object>}   The history entry with the result per player
 */
export function deliver(op, userIds, {kind = op.action} = {}) {
  if ( !game.user.isGM ) return Promise.reject(new Error("Only a GM changes what players know"));
  return inTurn(() => deliverNow(op, userIds, kind));
}

/**
 * Deliver a change now.
 * @param {object} op
 * @param {string[]} userIds
 * @param {string} kind
 * @returns {Promise<object>}
 */
async function deliverNow(op, userIds, kind) {
  op = {...op, id: op.id ?? foundry.utils.randomID(), by: game.user.id};
  const users = game.users.map(u => ({id: u.id, active: u.active, isGM: u.isGM}));
  const {online, offline} = splitTargets(userIds, users);
  const results = online.length ? await sendAndWait(op, online) : {};
  for ( const id of online ) {
    const answer = results[id];
    // A client that did not answer or failed: the GM changes the stored exploration instead
    if ( ["timeout", "failed"].includes(answer?.result) ) {
      results[id] = fallbackForOnline(op, id, await applyForPlayer(op, id), answer.result);
      continue;
    }
    // What the player knew before stays with the GM for the undo
    if ( DONE.has(answer?.result) && (op.action !== "undo") && ("before" in answer) ) {
      keepSnapshot(op, id, answer.before);
    }
    delete answer?.before;
  }
  for ( const id of offline ) results[id] = await applyForPlayer(op, id);
  const entry = {id: op.id, kind, action: op.action, scene: op.scene, level: op.level, at: Date.now(),
    users: [...online, ...offline], results, shapes: op.shapes, whole: op.whole || (op.action === "share"),
    from: op.from ?? null};
  trace.add("delivered", {id: op.id, kind, action: op.action, scene: op.scene, level: op.level, results});
  if ( op.action !== "undo" ) {
    remember(history, entry, MAX_HISTORY);
    pruneSnapshots(new Set(history.map(e => e.id)));
  }
  changed(entry);
  return entry;
}

/**
 * Take a change back (GM): every player gets back inside the change's shapes what they knew before. The GM keeps
 * that for every player of its recent changes; online players draw the undo themselves. Undos wait for running
 * changes, so pressing Ctrl+Z twice takes back two different changes.
 * @param {object} [entry]   A history entry, the newest one that is not taken back by default
 * @returns {Promise<object|null>}   The undo's entry, null when there is nothing to take back
 */
export function undoChange(entry) {
  if ( !game.user.isGM ) return Promise.resolve(null);
  return inTurn(() => undoNow(entry ?? history.findLast(e => !e.undone)));
}

/**
 * Take a change back now.
 * @param {object|undefined} entry
 * @returns {Promise<object|null>}
 */
async function undoNow(entry) {
  if ( !entry || entry.undone ) return null;
  entry.undone = true;
  const users = Object.entries(entry.results).filter(([, r]) => DONE.has(r.result)).map(([id]) => id);
  const base = {action: "undo", undo: entry.id, scene: entry.scene, level: entry.level, shapes: entry.shapes,
    whole: entry.whole, by: game.user.id};
  const results = {};
  for ( const userId of users ) {
    const held = snapshotOf(entry.id, userId);
    if ( !held ) {
      results[userId] = {result: "noSnapshot"};
      continue;
    }
    const op = {...base, id: foundry.utils.randomID(), before: held.before};
    if ( game.users.get(userId)?.active ) {
      const answers = await sendAndWait(op, [userId]);
      const client = answers[userId]?.result;
      results[userId] = {result: client, reason: answers[userId]?.reason};
      if ( DONE.has(client) ) dropSnapshot(entry.id, userId);
      else results[userId] = fallbackForOnline(op, userId, await applyForPlayer(op, userId, held.before), client);
    }
    else results[userId] = await applyForPlayer(op, userId, held.before);
  }
  const undo = {...base, id: foundry.utils.randomID(), kind: "undo", at: Date.now(), users, results};
  trace.add("undone", {id: entry.id, results});
  changed(undo);
  return undo;
}

/**
 * Count the results of a change: drawn live, stored by the player, stored by the GM, failed.
 * @param {Record<string, {result: string}>} results
 * @returns {{done: number, unanswered: number, failed: number, missing: number}}
 */
export function countResults(results) {
  const list = Object.values(results ?? {});
  return {
    done: list.filter(r => DONE.has(r.result)).length,
    // Drawn by the GM for a player who was online but did not answer: that player's screen reloads the fog
    unanswered: list.filter(r => DONE.has(r.result) && r.online).length,
    missing: list.filter(r => r.result === "noSnapshot").length,
    failed: list.filter(r => !DONE.has(r.result) && (r.result !== "noSnapshot")).length
  };
}

/**
 * How many changes the GM is waiting for (for the debug file).
 * @returns {number}
 */
export function pendingCount() {
  return pending.size;
}
