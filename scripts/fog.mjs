/**
 * The fog of war work: draw a change into Foundry's own exploration, either into the live texture of the scene this
 * client views (and let Foundry save it) or into the stored exploration of a user for a scene and Level. Explored
 * means remembered: players see the map there in the explored fog color, tokens stay hidden until real sight reaches
 * them. Foundry 14 keeps one exploration per user, scene and Level, as a red channel picture of the scene rectangle.
 */

import {fogTexture, remember} from "./shapes.mjs";

/** Colors drawn into the red channel: known and unknown. */
const KNOWN = 0xffffff;
const UNKNOWN = 0x000000;

/** At most this many undo snapshots; normally the GM's history decides which are kept (pruneSnapshots). */
const MAX_SNAPSHOTS = 400;

/** The texture extractor of the module (its own, so Foundry's change detection of its fog saves stays untouched). */
let extractor = null;

/** Undo snapshots: what a user knew before a change, by change id and user id. */
const snapshots = [];

/**
 * The texture extractor, made for the current renderer.
 * @returns {foundry.canvas.TextureExtractor}
 */
function getExtractor() {
  if ( extractor?.renderer !== canvas.app.renderer ) {
    extractor = new foundry.canvas.TextureExtractor(canvas.app.renderer, {callerName: "MapKnowledge",
      format: PIXI.FORMATS.RED});
  }
  return extractor;
}

/**
 * The FogExploration document class.
 * @returns {typeof FogExploration}
 */
function fogClass() {
  return CONFIG.FogExploration.documentClass;
}

/**
 * Does this Foundry offer what the module draws with?
 * @returns {boolean}
 */
export function fogApiReady() {
  const fog = canvas?.fog;
  return !!fog && (typeof fog._createExplorationRenderTexture === "function") && (typeof fog.save === "function")
    && (typeof fog.load === "function") && !!foundry.canvas?.TextureExtractor
    && (typeof foundry.canvas?.Canvas?.getRenderTexture === "function");
}

/**
 * Does a scene remember explored areas? It needs token vision and fog exploration.
 * @param {Scene} scene
 * @returns {boolean}
 */
export function remembers(scene) {
  return !!scene?.tokenVision && ((scene.fog?.mode ?? 0) > CONST.FOG_EXPLORATION_MODES.DISABLED);
}

/**
 * Do the players of a scene share one fog of war?
 * @param {Scene} scene
 * @returns {boolean}
 */
export function sharesFog(scene) {
  return scene?.fog?.mode === CONST.FOG_EXPLORATION_MODES.SHARED;
}

/**
 * The fog texture of a scene: its configuration and where its top left corner lies on the scene. For the scene this
 * client views it is Foundry's own; for other scenes it is worked out the same way.
 * @param {Scene} scene
 * @returns {{config: object, x: number, y: number}}
 */
export function textureFor(scene) {
  if ( canvas?.ready && (canvas.scene === scene) && canvas.visibility?.textureConfiguration ) {
    const sprite = canvas.fog.sprite;
    const dims = canvas.dimensions;
    const placed = !!sprite?.parent;
    return {config: canvas.visibility.textureConfiguration, x: placed ? sprite.x : dims.sceneX,
      y: placed ? sprite.y : dims.sceneY};
  }
  const area = fogTexture(scene.dimensions);
  return {
    config: {resolution: area.resolution, width: area.width, height: area.height, mipmap: PIXI.MIPMAP_MODES.OFF,
      multisample: PIXI.MSAA_QUALITY.NONE, scaleMode: PIXI.SCALE_MODES.LINEAR, alphaMode: PIXI.ALPHA_MODES.NPM,
      format: PIXI.FORMATS.RED},
    x: area.x,
    y: area.y
  };
}

/**
 * The scene rectangle the fog covers, as a shape: "the whole Level".
 * @param {Scene} scene
 * @returns {{type: "polygon", points: number[]}}
 */
export function wholeShape(scene) {
  const {config, x, y} = textureFor(scene);
  const x1 = x + config.width;
  const y1 = y + config.height;
  return {type: "polygon", points: [x, y, x1, y, x1, y1, x, y1]};
}

/**
 * Shapes as one filled graphics object.
 * @param {object[]} shapes
 * @param {number} color
 * @returns {PIXI.Graphics}
 */
export function shapeGraphics(shapes, color) {
  const g = new PIXI.Graphics();
  g.beginFill(color, 1);
  for ( const shape of shapes ) {
    if ( shape.type === "polygon" ) {
      g.drawPolygon(shape.points);
      continue;
    }
    const v = shape.vertices;
    const ix = shape.indices;
    for ( let i = 0; i + 2 < ix.length; i += 3 ) {
      const a = 2 * ix[i];
      const b = 2 * ix[i + 1];
      const c = 2 * ix[i + 2];
      g.drawPolygon([v[a], v[a + 1], v[b], v[b + 1], v[c], v[c + 1]]);
    }
  }
  g.endFill();
  return g;
}

/**
 * Render a display object into a texture, with the scene point of the texture's top left corner.
 * @param {PIXI.DisplayObject} object
 * @param {PIXI.RenderTexture} target
 * @param {{x: number, y: number}} origin
 */
function renderInto(object, target, origin) {
  canvas.app.renderer.render(object, {renderTexture: target, clear: false,
    transform: new PIXI.Matrix(1, 0, 0, 1, -origin.x, -origin.y)});
}

/**
 * A texture from a picture (data URL), loaded.
 * @param {string} src
 * @returns {Promise<PIXI.Texture>}
 */
async function pictureTexture(src) {
  const texture = new PIXI.Texture(new PIXI.BaseTexture(src, {alphaMode: PIXI.ALPHA_MODES.NPM}));
  if ( !texture.baseTexture.valid ) {
    try {
      await new Promise((resolve, reject) => {
        texture.baseTexture.once("loaded", resolve);
        texture.baseTexture.once("error", reject);
      });
    } catch(err) {
      texture.destroy(true);
      throw err;
    }
  }
  return texture;
}

/**
 * Draw a picture of a whole fog texture into a texture.
 * @param {PIXI.RenderTexture} target
 * @param {{config: object, x: number, y: number}} area
 * @param {string|PIXI.Texture} picture   Data URL or texture
 * @param {number} [blendMode]
 */
async function drawPicture(target, area, picture, blendMode = PIXI.BLEND_MODES.NORMAL) {
  const texture = (typeof picture === "string") ? await pictureTexture(picture) : picture;
  const sprite = new PIXI.Sprite(texture);
  sprite.position.set(area.x, area.y);
  sprite.width = area.config.width;
  sprite.height = area.config.height;
  sprite.blendMode = blendMode;
  try {
    renderInto(sprite, target, area);
  } finally {
    sprite.destroy({texture: typeof picture === "string", baseTexture: typeof picture === "string"});
  }
}

/**
 * Put what a user knew before back inside some shapes and keep everything outside them as it is now.
 * Inside: before; outside: now. Done with blending: the shapes cut a hole (black), a copy of before limited to the
 * shapes (white shapes multiplied with before) fills it with the brighter of both.
 * @param {PIXI.RenderTexture} target
 * @param {{config: object, x: number, y: number}} area
 * @param {string|null} before
 * @param {object[]} shapes
 */
async function restoreInside(target, area, before, shapes) {
  const cut = shapeGraphics(shapes, UNKNOWN);
  renderInto(cut, target, area);
  cut.destroy();
  if ( !before ) return;
  const temp = foundry.canvas.Canvas.getRenderTexture({clearColor: [0, 0, 0, 1], textureConfiguration: area.config});
  try {
    const mask = shapeGraphics(shapes, KNOWN);
    renderInto(mask, temp, area);
    mask.destroy();
    await drawPicture(temp, area, before, PIXI.BLEND_MODES.MULTIPLY);
    await drawPicture(target, area, temp, PIXI.BLEND_MODES.MAX_COLOR);
  } finally {
    temp.destroy(true);
  }
}

/**
 * Draw a change into a fog texture.
 * @param {PIXI.RenderTexture} target
 * @param {{config: object, x: number, y: number}} area
 * @param {object} op           The change (see shapes.mjs)
 * @param {string|null} [before]  For an undo: what the user knew before the change
 */
export async function drawChange(target, area, op, before = null) {
  if ( (op.action === "reveal") || (op.action === "hide") ) {
    const g = shapeGraphics(op.shapes, op.action === "reveal" ? KNOWN : UNKNOWN);
    renderInto(g, target, area);
    g.destroy();
  }
  else if ( op.action === "share" ) await drawPicture(target, area, op.image, PIXI.BLEND_MODES.MAX_COLOR);
  else if ( op.action === "undo" ) {
    const shapes = (op.whole || !op.shapes.length) ? [areaShape(area)] : op.shapes;
    await restoreInside(target, area, before, shapes);
  }
}

/**
 * The rectangle of a fog texture as a shape.
 * @param {{config: object, x: number, y: number}} area
 * @returns {{type: "polygon", points: number[]}}
 */
function areaShape(area) {
  const x1 = area.x + area.config.width;
  const y1 = area.y + area.config.height;
  return {type: "polygon", points: [area.x, area.y, x1, area.y, x1, y1, area.x, y1]};
}

/**
 * A fog texture as picture (WebP data URL, the way Foundry stores it).
 * @param {PIXI.RenderTexture} texture
 * @returns {Promise<string>}
 */
export async function pictureOf(texture) {
  return getExtractor().extract({texture, compression: foundry.canvas.TextureExtractor.COMPRESSION_MODES.BASE64,
    type: "image/webp", quality: 0.8});
}

/**
 * Can this client draw a change for a scene and Level into its live fog?
 * @param {{scene: string, level: string}} op
 * @returns {boolean}
 */
export function viewsLive(op) {
  return !!canvas?.ready && (canvas.scene?.id === op.scene) && (canvas.level?.id === op.level)
    && remembers(canvas.scene) && fogApiReady();
}

/**
 * Draw a change into the live fog of this client and let Foundry save it. The texture stays the same object: a
 * reload would swap it while Foundry still reads its explored pixels, and Foundry then keeps old pixels for its
 * "is this point explored" test. A commit adds the current sight and makes Foundry read the pixels again.
 * @param {object} op
 * @param {string|null} [before]   For an undo
 * @returns {Promise<{before: string|null}>}   What this user knew before
 */
export async function applyLive(op, before = null) {
  const fog = canvas.fog;
  const target = await fog._createExplorationRenderTexture();
  const area = textureFor(canvas.scene);
  const previous = (op.action === "undo") ? null : await pictureOf(target);
  await drawChange(target, area, op, before);
  fog.commit();
  fog._updated = true;
  await fog.save();
  canvas.perception.update({refreshVision: true});
  return {before: previous};
}

/**
 * The newest stored exploration of a user for a scene and Level.
 * @param {string} sceneId
 * @param {string} level
 * @param {string} userId
 * @returns {Promise<FogExploration|null>}
 */
export async function storedExploration(sceneId, level, userId) {
  const docs = await explorations(sceneId, level);
  return docs.filter(d => userOf(d) === userId).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))[0] ?? null;
}

/**
 * All stored explorations of a scene and Level. A GM may read every user's, a player only their own.
 * @param {string} sceneId
 * @param {string} level
 * @returns {Promise<FogExploration[]>}
 */
export async function explorations(sceneId, level) {
  const cls = fogClass();
  const query = {scene: sceneId, level};
  if ( !game.user.isGM ) query.user = game.user.id;
  return cls.database.get(cls, {query});
}

/**
 * The user id of an exploration.
 * @param {FogExploration} doc
 * @returns {string}
 */
function userOf(doc) {
  return doc.user?.id ?? doc.user;
}

/**
 * Write a new picture into a stored exploration. Foundry only updates documents of its collection, so a GM puts
 * another user's document there for the update and takes it out again.
 * @param {FogExploration} doc
 * @param {string} explored
 */
async function writeExploration(doc, explored) {
  const collection = game.collections.get("FogExploration");
  const data = {explored, timestamp: Date.now()};
  const cached = collection.get(doc.id);
  if ( cached ) {
    await cached.update(data, {loadFog: false});
    return;
  }
  const own = userOf(doc) === game.user.id;
  collection.set(doc.id, doc);
  try {
    await doc.update(data, {loadFog: false});
  } finally {
    if ( !own ) collection.delete(doc.id);
  }
}

/**
 * Draw a change into the stored exploration of a user for a scene and Level, or create one.
 * @param {object} op
 * @param {string} userId
 * @param {string|null} [before]   For an undo
 * @returns {Promise<{before: string|null}>}   What the user knew before
 */
export async function applyStored(op, userId, before = null) {
  const scene = game.scenes.get(op.scene);
  if ( !scene ) throw new Error(`Unknown scene ${op.scene}`);
  const doc = await storedExploration(op.scene, op.level, userId);
  const area = textureFor(scene);
  const target = foundry.canvas.Canvas.getRenderTexture({clearColor: [0, 0, 0, 1], textureConfiguration: area.config});
  try {
    if ( doc?.explored ) await drawPicture(target, area, doc.explored);
    await drawChange(target, area, op, before);
    const explored = await pictureOf(target);
    if ( doc ) await writeExploration(doc, explored);
    else {
      await fogClass().create({scene: op.scene, level: op.level, user: userId, explored, timestamp: Date.now()},
        {loadFog: false});
    }
  } finally {
    target.destroy(true);
  }
  return {before: (op.action === "undo") ? null : (doc?.explored ?? null)};
}

/**
 * Everything some users know of a scene and Level, as one texture (the brightest of their explorations).
 * @param {Scene} scene
 * @param {string} level
 * @param {string[]} userIds
 * @returns {Promise<{texture: PIXI.RenderTexture, area: object, users: number}>}
 */
export async function knowledgeTexture(scene, level, userIds) {
  const area = textureFor(scene);
  const texture = foundry.canvas.Canvas.getRenderTexture({clearColor: [0, 0, 0, 1], textureConfiguration: area.config});
  const wanted = new Set(userIds);
  const newest = new Map();
  try {
    for ( const doc of await explorations(scene.id, level) ) {
      const user = userOf(doc);
      if ( !wanted.has(user) || !doc.explored ) continue;
      if ( (newest.get(user)?.timestamp ?? -1) < (doc.timestamp ?? 0) ) newest.set(user, doc);
    }
    for ( const doc of newest.values() ) await drawPicture(texture, area, doc.explored, PIXI.BLEND_MODES.MAX_COLOR);
  } catch(err) {
    texture.destroy(true);
    throw err;
  }
  return {texture, area, users: newest.size};
}

/**
 * Everything some users know of a scene and Level, as a picture for a "share" change.
 * @param {Scene} scene
 * @param {string} level
 * @param {string[]} userIds
 * @returns {Promise<string|null>}   null when none of them knows anything there
 */
export async function knowledgePicture(scene, level, userIds) {
  const {texture, users} = await knowledgeTexture(scene, level, userIds);
  try {
    return users ? await pictureOf(texture) : null;
  } finally {
    texture.destroy(true);
  }
}

/**
 * Does a user know a point of a scene and Level? Reads the stored exploration (GM: any user, player: themselves).
 * @param {{x: number, y: number}} point
 * @param {{scene: Scene, level: string, userId: string}} where
 * @returns {Promise<boolean>}
 */
export async function knowsPoint(point, {scene, level, userId}) {
  const doc = await storedExploration(scene.id, level, userId);
  if ( !doc?.explored ) return false;
  const area = textureFor(scene);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = doc.explored;
  });
  const px = Math.floor((point.x - area.x) * (image.width / area.config.width));
  const py = Math.floor((point.y - area.y) * (image.height / area.config.height));
  if ( (px < 0) || (py < 0) || (px >= image.width) || (py >= image.height) ) return false;
  const board = document.createElement("canvas");
  board.width = 1;
  board.height = 1;
  const ctx = board.getContext("2d", {willReadFrequently: true});
  ctx.drawImage(image, px, py, 1, 1, 0, 0, 1, 1);
  return ctx.getImageData(0, 0, 1, 1).data[0] > 127;
}

/**
 * A small round trip for the self-test: reveal a rectangle in a fresh fog texture, hide its upper half, read the
 * pixels back.
 * @returns {Promise<boolean>}
 */
export async function drawingWorks() {
  const config = {resolution: 1, width: 64, height: 64, mipmap: PIXI.MIPMAP_MODES.OFF,
    multisample: PIXI.MSAA_QUALITY.NONE, scaleMode: PIXI.SCALE_MODES.LINEAR, alphaMode: PIXI.ALPHA_MODES.NPM,
    format: PIXI.FORMATS.RED};
  const area = {config, x: 100, y: 100};
  const target = foundry.canvas.Canvas.getRenderTexture({clearColor: [0, 0, 0, 1], textureConfiguration: config});
  try {
    await drawChange(target, area, {action: "reveal", shapes: [{type: "polygon",
      points: [100, 100, 132, 100, 132, 164, 100, 164]}]});
    await drawChange(target, area, {action: "hide", shapes: [{type: "polygon",
      points: [100, 100, 132, 100, 132, 132, 100, 132]}]});
    const {pixels, width} = await getExtractor().extract({texture: target,
      compression: foundry.canvas.TextureExtractor.COMPRESSION_MODES.NONE});
    const stride = pixels.length / (width * 64);
    const at = (x, y) => pixels[(((y * width) + x) * stride) + stride - 1];
    return (at(16, 48) > 200) && (at(16, 16) < 50) && (at(48, 48) < 50);
  } finally {
    target.destroy(true);
  }
}

/**
 * Keep what a user knew before a change, for an undo.
 * @param {object} op
 * @param {string} userId
 * @param {string|null} before
 */
export function keepSnapshot(op, userId, before) {
  remember(snapshots, {id: op.id, userId, scene: op.scene, level: op.level, before, shapes: op.shapes,
    whole: op.whole || (op.action === "share")}, MAX_SNAPSHOTS);
}

/**
 * The snapshot of a user for a change, or undefined.
 * @param {string} opId
 * @param {string} userId
 * @returns {object|undefined}
 */
export function snapshotOf(opId, userId) {
  return snapshots.findLast(s => (s.id === opId) && (s.userId === userId));
}

/**
 * Forget a snapshot after its undo.
 * @param {string} opId
 * @param {string} userId
 */
export function dropSnapshot(opId, userId) {
  const index = snapshots.findLastIndex(s => (s.id === opId) && (s.userId === userId));
  if ( index >= 0 ) snapshots.splice(index, 1);
}

/**
 * Forget the snapshots of changes that left the history.
 * @param {Set<string>} keep   The ids of the changes in the history
 */
export function pruneSnapshots(keep) {
  for ( let i = snapshots.length - 1; i >= 0; i-- ) if ( !keep.has(snapshots[i].id) ) snapshots.splice(i, 1);
}

/**
 * How many snapshots this client keeps (for the debug file).
 * @returns {number}
 */
export function snapshotCount() {
  return snapshots.length;
}
