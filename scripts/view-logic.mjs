/**
 * Pure logic of the player view and of checking a change before it is applied, without Foundry globals.
 */

/** The most pending changes that wait for a check. */
export const MAX_PENDING = 30;

/**
 * The next or previous entry of the sequence off, player 1, player 2 and so on, and back to off.
 * @param {string[]} ids        The player ids in order
 * @param {string} current      The current id, or "" for off
 * @param {number} [step=1]     1 forward, -1 back
 * @returns {string}   The new id, or "" for off
 */
export function cycleUser(ids, current, step = 1) {
  const list = ["", ...ids];
  const index = Math.max(list.indexOf(current ?? ""), 0);
  return list[(index + (step < 0 ? -1 : 1) + list.length) % list.length];
}

/**
 * Whose exploration makes up what one player sees. With shared fog all players see the same map, which is what all
 * of them explored together.
 * @param {string} userId
 * @param {{shared: boolean, playerIds: string[]}} options
 * @returns {string[]}
 */
export function viewUsers(userId, {shared = false, playerIds = []} = {}) {
  if ( !userId ) return [];
  return shared ? [...playerIds] : [userId];
}

/**
 * Whose map the screen shows: the player of the view, else, while changes wait for a check, the player chosen for
 * the check or the first of the chosen players.
 * @param {object} state
 * @param {string} [state.viewAs]
 * @param {string} [state.checkUser]
 * @param {string[]} [state.chosen]      The players a change goes to
 * @param {string[]} [state.playerIds]
 * @param {boolean} [state.pending]      Changes wait for a check
 * @returns {string}  A user id, or "" for nobody
 */
export function previewUser({viewAs = "", checkUser = "", chosen = [], playerIds = [], pending = false} = {}) {
  if ( viewAs && playerIds.includes(viewAs) ) return viewAs;
  if ( !pending ) return "";
  if ( checkUser && playerIds.includes(checkUser) ) return checkUser;
  return chosen.find(id => playerIds.includes(id)) ?? playerIds[0] ?? "";
}

/**
 * Add a change to the pending list, which keeps at most a number of the newest.
 * @param {object[]} list
 * @param {{action: string, shapes: object[], kind: string}} op
 * @param {number} [max]
 * @returns {object[]}  The same list
 */
export function addPending(list, op, max = MAX_PENDING) {
  if ( !op?.shapes?.length || !["reveal", "hide"].includes(op.action) ) return list;
  list.push({action: op.action, shapes: op.shapes, kind: op.kind ?? "api"});
  while ( list.length > max ) list.shift();
  return list;
}

/**
 * Count the pending changes.
 * @param {object[]} list
 * @returns {{reveal: number, hide: number, shapes: number}}  Changes by action and the number of shapes
 */
export function describePending(list) {
  const result = {reveal: 0, hide: 0, shapes: 0};
  for ( const op of list ?? [] ) {
    result[op.action === "hide" ? "hide" : "reveal"]++;
    result.shapes += op.shapes?.length ?? 0;
  }
  return result;
}

/**
 * Would a change reach a player?
 * @param {string} userId
 * @param {string[]} targets   The players the change goes to
 * @returns {boolean}
 */
export function wouldAffect(userId, targets) {
  return !!userId && (targets ?? []).includes(userId);
}

/**
 * The color matrix of the cover over what a player does not know: opaque (or nearly) where the red channel of the
 * fog picture is 0, clear where it is 1.
 * @param {number[]} rgb       The cover color, 0 to 1 each
 * @param {number} opacity     0 to 1
 * @returns {number[]}  A 4 x 5 matrix
 */
export function coverMatrix(rgb, opacity) {
  const [r, g, b] = rgb;
  const a = Math.min(Math.max(Number(opacity) || 0, 0), 1);
  return [0, 0, 0, 0, r, 0, 0, 0, 0, g, 0, 0, 0, 0, b, -a, 0, 0, 0, a];
}

