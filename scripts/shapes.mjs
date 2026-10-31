/**
 * Pure helpers without Foundry or PIXI: the shapes the GM draws, the checks for changes that arrive over the socket,
 * the size of the fog texture of a scene and who gets a change how. Shapes are kept in scene coordinates as plain
 * data, so they travel over the socket and into the history unchanged:
 *   {type: "polygon", points: [x0, y0, x1, y1, ...]}
 *   {type: "triangles", vertices: [x0, y0, ...], indices: [i0, i1, i2, ...]}   (Regions, holes included)
 */

/** What a change does: reveal or hide shapes, add another player's knowledge, or take a change back. */
export const ACTIONS = ["reveal", "hide", "share", "undo"];

/** Limits for shapes that arrive over the socket. */
export const LIMITS = {points: 20000, triangles: 300000, shapes: 50, image: 6_000_000};

/** The largest side of a fog texture before Foundry scales it down (CanvasVisibility, 4096 on Foundry 14). */
export const MAX_TEXTURE_SIZE = 4096;

/** Document ids and Level ids: letters and digits. */
const ID = /^[A-Za-z0-9]{1,64}$/;

/** A picture as data URL. */
const DATA_IMAGE = /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/;

/**
 * Is this a finite number?
 * @param {*} n
 * @returns {boolean}
 */
const finite = n => (typeof n === "number") && Number.isFinite(n);

/**
 * The signed area of a polygon from its flat point list (shoelace formula).
 * @param {number[]} points
 * @returns {number}
 */
export function polygonArea(points) {
  let sum = 0;
  const n = points.length / 2;
  for ( let i = 0; i < n; i++ ) {
    const j = (i + 1) % n;
    sum += (points[2 * i] * points[(2 * j) + 1]) - (points[2 * j] * points[(2 * i) + 1]);
  }
  return sum / 2;
}

/**
 * A rectangle between two corners. With square, the shorter side grows to the longer one, away from the first corner.
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @param {{square?: boolean}} [options]
 * @returns {{type: "polygon", points: number[]}|null}   null when it has no area
 */
export function rectShape(a, b, {square = false} = {}) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if ( square ) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * side;
    dy = Math.sign(dy || 1) * side;
  }
  const x0 = Math.min(a.x, a.x + dx);
  const y0 = Math.min(a.y, a.y + dy);
  const x1 = Math.max(a.x, a.x + dx);
  const y1 = Math.max(a.y, a.y + dy);
  if ( !((x1 - x0) >= 1) || !((y1 - y0) >= 1) ) return null;
  return {type: "polygon", points: [x0, y0, x1, y0, x1, y1, x0, y1]};
}

/**
 * An ellipse inside the box between two corners, as a polygon. With circle, the box becomes a square first.
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @param {{circle?: boolean, segments?: number}} [options]
 * @returns {{type: "polygon", points: number[]}|null}
 */
export function ellipseShape(a, b, {circle = false, segments} = {}) {
  const box = rectShape(a, b, {square: circle});
  if ( !box ) return null;
  const [x0, y0, x1, , , y1] = box.points;
  const rx = (x1 - x0) / 2;
  const ry = (y1 - y0) / 2;
  const cx = x0 + rx;
  const cy = y0 + ry;
  // About one corner every 20 pixels of the outline, at least 24 and at most 128
  const perimeter = 2 * Math.PI * Math.sqrt(((rx * rx) + (ry * ry)) / 2);
  const n = segments ?? Math.min(128, Math.max(24, Math.round(perimeter / 20)));
  const points = [];
  for ( let i = 0; i < n; i++ ) {
    const angle = (2 * Math.PI * i) / n;
    points.push(cx + (rx * Math.cos(angle)), cy + (ry * Math.sin(angle)));
  }
  return {type: "polygon", points};
}

/**
 * A polygon from its corners, as points or as a flat list. Repeated corners and a closing corner that equals the
 * first one are dropped.
 * @param {Array<{x: number, y: number}>|number[]} input
 * @returns {{type: "polygon", points: number[]}|null}   null with fewer than three corners or no area
 */
export function polygonShape(input) {
  const flat = (typeof input?.[0] === "number") ? input : (input ?? []).flatMap(p => [p.x, p.y]);
  const points = [];
  for ( let i = 0; i + 1 < flat.length; i += 2 ) {
    const x = flat[i];
    const y = flat[i + 1];
    if ( !finite(x) || !finite(y) ) return null;
    const n = points.length;
    if ( n && (points[n - 2] === x) && (points[n - 1] === y) ) continue;
    points.push(x, y);
  }
  if ( (points.length >= 6) && (points[0] === points.at(-2)) && (points[1] === points.at(-1)) ) points.length -= 2;
  if ( (points.length < 6) || (Math.abs(polygonArea(points)) < 1) ) return null;
  return {type: "polygon", points};
}

/**
 * Triangles from a triangulation (a Region's), copied into plain arrays.
 * @param {ArrayLike<number>} vertices   Flat x, y list
 * @param {ArrayLike<number>} indices    Three vertex indices per triangle
 * @returns {{type: "triangles", vertices: number[], indices: number[]}|null}
 */
export function trianglesShape(vertices, indices) {
  const v = Array.from(vertices ?? []);
  const i = Array.from(indices ?? []);
  if ( (v.length < 6) || (i.length < 3) || (i.length % 3) ) return null;
  return {type: "triangles", vertices: v, indices: i};
}

/**
 * The bounding box of a shape.
 * @param {object} shape
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function shapeBounds(shape) {
  const flat = (shape.type === "triangles") ? shape.vertices : shape.points;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for ( let i = 0; i + 1 < flat.length; i += 2 ) {
    x0 = Math.min(x0, flat[i]);
    x1 = Math.max(x1, flat[i]);
    y0 = Math.min(y0, flat[i + 1]);
    y1 = Math.max(y1, flat[i + 1]);
  }
  return {x: x0, y: y0, width: x1 - x0, height: y1 - y0};
}

/**
 * Check a shape that came from elsewhere and copy it. Anything unexpected makes it null.
 * @param {*} shape
 * @returns {object|null}
 */
export function cleanShape(shape) {
  if ( !shape || (typeof shape !== "object") ) return null;
  if ( shape.type === "polygon" ) {
    if ( !Array.isArray(shape.points) || (shape.points.length > LIMITS.points) ) return null;
    return polygonShape(shape.points);
  }
  if ( shape.type === "triangles" ) {
    const {vertices, indices} = shape;
    if ( !Array.isArray(vertices) || !Array.isArray(indices) ) return null;
    if ( (vertices.length > LIMITS.triangles) || (indices.length > LIMITS.triangles) ) return null;
    if ( !vertices.every(finite) ) return null;
    const count = vertices.length / 2;
    if ( !indices.every(i => Number.isInteger(i) && (i >= 0) && (i < count)) ) return null;
    return trianglesShape(vertices, indices);
  }
  return null;
}

/**
 * Check a change that came over the socket and copy what the module uses of it.
 * @param {*} op
 * @returns {object|null}
 */
export function cleanOp(op) {
  if ( !op || (typeof op !== "object") ) return null;
  const {id, action, scene, level, by} = op;
  if ( !ID.test(id ?? "") || !ACTIONS.includes(action) || !ID.test(scene ?? "") || !ID.test(level ?? "") ) return null;
  if ( (by !== undefined) && !ID.test(by) ) return null;
  if ( Array.isArray(op.shapes) && (op.shapes.length > LIMITS.shapes) ) return null;
  const shapes = Array.isArray(op.shapes) ? op.shapes.map(cleanShape) : [];
  if ( shapes.some(s => !s) ) return null;
  const clean = {id, action, scene, level, shapes, by: by ?? null, whole: op.whole === true};
  if ( action === "share" ) {
    if ( !isImage(op.image) ) return null;
    clean.image = op.image;
  }
  else if ( action === "undo" ) {
    if ( !ID.test(op.undo ?? "") ) return null;
    clean.undo = op.undo;
    if ( op.before !== undefined ) {
      if ( (op.before !== null) && !isImage(op.before) ) return null;
      clean.before = op.before;
    }
  }
  else if ( !shapes.length ) return null;
  return clean;
}

/**
 * Is this a picture as data URL that is not too large?
 * @param {*} value
 * @returns {boolean}
 */
export function isImage(value) {
  return (typeof value === "string") && (value.length <= LIMITS.image) && DATA_IMAGE.test(value);
}

/**
 * The area and resolution of the fog texture of a scene, the way Foundry 14 configures it (CanvasVisibility): the
 * scene rectangle without padding, scaled down when a side is longer than 4096 pixels, with sizes that stay whole
 * numbers at that resolution.
 * @param {{sceneX: number, sceneY: number, sceneWidth: number, sceneHeight: number}} dims
 * @param {number} [maxSize]
 * @returns {{x: number, y: number, width: number, height: number, resolution: number}}
 */
export function fogTexture(dims, maxSize = MAX_TEXTURE_SIZE) {
  let width = dims.sceneWidth;
  let height = dims.sceneHeight;
  let resolution = 1;
  if ( (width >= height) && (width > maxSize) ) {
    resolution = maxSize / width;
    height = Math.ceil(height * resolution) / resolution;
  }
  else if ( height > maxSize ) {
    resolution = maxSize / height;
    width = Math.ceil(width * resolution) / resolution;
  }
  return {x: dims.sceneX, y: dims.sceneY, width, height, resolution};
}

/**
 * Are two points closer than a distance?
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @param {number} distance
 * @returns {boolean}
 */
export function near(a, b, distance) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= distance;
}

/**
 * Split the chosen players into those who apply a change on their own client and those whose stored knowledge the GM
 * changes. GMs and unknown users are left out.
 * @param {string[]} targetIds
 * @param {{id: string, active: boolean, isGM: boolean}[]} users
 * @returns {{online: string[], offline: string[]}}
 */
export function splitTargets(targetIds, users) {
  const byId = new Map(users.map(u => [u.id, u]));
  const online = [];
  const offline = [];
  for ( const id of new Set(targetIds) ) {
    const user = byId.get(id);
    if ( !user || user.isGM ) continue;
    (user.active ? online : offline).push(id);
  }
  return {online, offline};
}

/**
 * Who a change is for: everyone or the chosen players. With shared fog everyone shares one map, so a change always
 * goes to every player.
 * @param {{all: boolean, chosen: string[]}} choice
 * @param {{id: string, isGM: boolean}[]} users
 * @param {boolean} shared
 * @returns {string[]}
 */
export function targetIds(choice, users, shared) {
  const playerIds = users.filter(u => !u.isGM).map(u => u.id);
  if ( shared || choice.all ) return playerIds;
  const chosen = new Set(choice.chosen ?? []);
  return playerIds.filter(id => chosen.has(id));
}

/**
 * Add an entry to a list that keeps only the newest entries.
 * @param {object[]} list
 * @param {object} entry
 * @param {number} max
 * @returns {object[]}   The same list
 */
export function remember(list, entry, max) {
  list.push(entry);
  if ( list.length > max ) list.splice(0, list.length - max);
  return list;
}
