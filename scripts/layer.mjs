/**
 * The canvas layer of the GM's tools (scene controls group "Map knowledge"): drag a rectangle or an ellipse, click
 * the corners of a polygon, click into a room, and see the shape before it is applied. Holding Alt turns reveal into
 * hide for one shape. The layer also shows what the chosen players know: everything they do not know gets a tint.
 */

import {ICON, LAYER, MODULE_ID, setting, t} from "./config.mjs";
import {blocker, changeShapes, chosenPlayers, undoLast} from "./actions.mjs";
import {knowledgeTexture} from "./fog.mjs";
import {openPanel, refreshPanel} from "./panel-app.mjs";
import {ellipseShape, near, polygonShape, rectShape} from "./shapes.mjs";
import {countFeature} from "./usage.mjs";

/** Colors of the preview: reveal, hide. */
const PREVIEW = {reveal: 0x3fa66b, hide: 0xc0392b};

/** The tools that draw shapes. */
export const SHAPE_TOOLS = ["rect", "ellipse", "polygon", "room"];

/** Reveal or hide, for this browser session. */
let mode = "reveal";

/**
 * Is the hide mode on?
 * @returns {boolean}
 */
export function hideMode() {
  return mode === "hide";
}

/**
 * Switch between reveal and hide.
 * @param {boolean} hide
 */
export function setHideMode(hide) {
  mode = hide ? "hide" : "reveal";
  const tool = ui.controls?.controls?.[LAYER]?.tools?.hideMode;
  if ( tool && (tool.active !== hide) ) ui.controls.render({reset: true});
  canvas[LAYER]?.redrawPreview();
  refreshPanel();
}

/**
 * The players whose knowledge the tint shows: one chosen player, or the chosen players together.
 * @returns {string[]}
 */
export function overlayUsers() {
  const one = setting("overlayUser");
  if ( one && game.users.get(one) ) return [one];
  return chosenPlayers();
}

export class MapKnowledgeLayer extends foundry.canvas.layers.InteractionLayer {
  /** @override */
  static get layerOptions() {
    return Object.assign(super.layerOptions, {name: LAYER, zIndex: 1000});
  }

  /** @override */
  static prepareSceneControls() {
    if ( !game.user.isGM ) return null;
    return {
      name: LAYER,
      order: 12,
      title: "SMK.Controls.title",
      layer: LAYER,
      icon: ICON,
      visible: game.user.isGM,
      onChange: (event, active) => {
        if ( active ) canvas[LAYER]?.activate();
      },
      onToolChange: () => canvas[LAYER]?.cancelDrawing(),
      activeTool: "rect",
      tools: {
        rect: {name: "rect", order: 1, title: "SMK.Controls.rect", icon: "fa-solid fa-vector-square"},
        ellipse: {name: "ellipse", order: 2, title: "SMK.Controls.ellipse", icon: "fa-regular fa-circle"},
        polygon: {name: "polygon", order: 3, title: "SMK.Controls.polygon", icon: "fa-solid fa-draw-polygon"},
        room: {name: "room", order: 4, title: "SMK.Controls.room", icon: "fa-solid fa-door-open"},
        hideMode: {name: "hideMode", order: 5, title: "SMK.Controls.hideMode", icon: "fa-solid fa-eye-slash",
          toggle: true, active: hideMode(), onChange: (event, toggled) => setHideMode(toggled)},
        overlay: {name: "overlay", order: 6, title: "SMK.Controls.overlay", icon: "fa-solid fa-users-viewfinder",
          toggle: true, active: setting("overlay"),
          onChange: (event, toggled) => game.settings.set(MODULE_ID, "overlay", toggled)},
        panel: {name: "panel", order: 7, title: "SMK.Controls.panel", icon: "fa-solid fa-sliders", button: true,
          onChange: () => openPanel()},
        undo: {name: "undo", order: 8, title: "SMK.Controls.undo", icon: "fa-solid fa-rotate-left", button: true,
          onChange: () => undoLast()}
      }
    };
  }

  /** The tint over what the players do not know. */
  #overlay;

  /** The shape being drawn. */
  #preview;

  /** The start of a drag. */
  #origin = null;

  /** The corners of the polygon being drawn. */
  #points = [];

  /** The last mouse position, for the polygon's next edge and the room under the mouse. */
  #mouse = null;

  /** The room under the mouse. */
  #room = null;

  /** A pending frame for the mouse preview. */
  #frame = null;

  /** Counts overlay refreshes, so a slow one does not replace a newer one. */
  #overlayRun = 0;

  /** Bound mouse move handler. */
  #onMove = this.#handleMove.bind(this);

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    await super._draw(options);
    this.#overlay = this.addChild(new PIXI.Sprite(PIXI.Texture.EMPTY));
    this.#overlay.visible = false;
    this.#overlay.eventMode = "none";
    this.#preview = this.addChild(new PIXI.Graphics());
    this.#preview.eventMode = "none";
  }

  /** @override */
  async _tearDown(options) {
    this.cancelDrawing();
    const texture = this.#overlay?.texture;
    if ( texture && (texture !== PIXI.Texture.EMPTY) ) texture.destroy(true);
    this.#overlay = this.#preview = null;
    return super._tearDown(options);
  }

  /** @override */
  _activate() {
    canvas.stage.on("pointermove", this.#onMove);
    if ( setting("openPanel") ) openPanel();
    this.refreshOverlay();
    const problem = blocker(canvas.scene);
    if ( problem ) ui.notifications.warn(t(problem));
  }

  /** @override */
  _deactivate() {
    canvas.stage.off("pointermove", this.#onMove);
    this.cancelDrawing();
    if ( this.#overlay ) this.#overlay.visible = false;
  }

  /* -------------------------------------------- */
  /*  Drawing                                     */
  /* -------------------------------------------- */

  /**
   * Stop drawing a shape and clear the preview.
   */
  cancelDrawing() {
    this.#origin = null;
    this.#points = [];
    this.#room = null;
    this.#preview?.clear();
  }

  /**
   * Is the hide mode on for this shape? Alt turns the mode around.
   * @returns {boolean}
   */
  #hides() {
    return hideMode() !== !!game.keyboard?.isModifierActive?.("Alt");
  }

  /**
   * Draw shapes and an open polyline as preview.
   * @param {object[]} shapes
   * @param {number[]} [line]   An open polyline (the polygon being drawn)
   */
  #drawPreview(shapes, line = []) {
    const g = this.#preview;
    if ( !g ) return;
    g.clear();
    const color = this.#hides() ? PREVIEW.hide : PREVIEW.reveal;
    const width = 3 / (canvas.stage.scale.x || 1);
    for ( const shape of shapes ) {
      g.lineStyle({width, color, alpha: 0.95}).beginFill(color, 0.22).drawPolygon(shape.points).endFill();
    }
    if ( line.length >= 2 ) {
      g.lineStyle({width, color, alpha: 0.95});
      g.moveTo(line[0], line[1]);
      for ( let i = 2; i + 1 < line.length; i += 2 ) g.lineTo(line[i], line[i + 1]);
      const radius = 6 / (canvas.stage.scale.x || 1);
      g.lineStyle(0).beginFill(color, 0.95);
      for ( let i = 0; i + 1 < line.length; i += 2 ) g.drawCircle(line[i], line[i + 1], radius);
      g.endFill();
    }
  }

  /**
   * Redraw the preview, after the mode changed.
   */
  redrawPreview() {
    if ( this.#points.length ) this.#drawPolygonPreview();
    else if ( this.#room ) this.#drawPreview([this.#room]);
  }

  /**
   * The shape of a drag.
   * @param {PIXI.FederatedEvent} event
   * @returns {object|null}
   */
  #dragShape(event) {
    const to = event.interactionData.destination;
    if ( !this.#origin || !to ) return null;
    const even = !!game.keyboard?.isModifierActive?.("Shift");
    return (game.activeTool === "ellipse") ? ellipseShape(this.#origin, to, {circle: even})
      : rectShape(this.#origin, to, {square: even});
  }

  /**
   * The room around a point: what is reachable in straight lines from it without crossing a wall that blocks
   * movement (closed doors and windows included). Rooms with corners may need a second click.
   * @param {{x: number, y: number}} point
   * @returns {object|null}
   */
  roomAt(point) {
    const backend = CONFIG.Canvas.polygonBackends.move;
    const {sceneX, sceneY, sceneWidth, sceneHeight} = canvas.dimensions;
    if ( (point.x < sceneX) || (point.y < sceneY) || (point.x > sceneX + sceneWidth) || (point.y > sceneY + sceneHeight) ) {
      return null;
    }
    try {
      const polygon = backend.create({x: point.x, y: point.y}, {type: "move", level: canvas.level});
      return polygonShape(polygon.points);
    } catch(err) {
      console.warn("sephrals-map-knowledge | No room at this point", err);
      return null;
    }
  }

  /**
   * Apply shapes from a tool.
   * @param {object[]} shapes
   * @param {string} kind
   */
  async #apply(shapes, kind) {
    const hide = this.#hides();
    this.cancelDrawing();
    await changeShapes(shapes, {hide, kind});
  }

  /* -------------------------------------------- */
  /*  Mouse                                       */
  /* -------------------------------------------- */

  /** @override */
  _canDragLeftStart(user, event) {
    return user.isGM && ["rect", "ellipse"].includes(game.activeTool);
  }

  /** @override */
  _onDragLeftStart(event) {
    this.#origin = {...event.interactionData.origin};
  }

  /** @override */
  _onDragLeftMove(event) {
    const shape = this.#dragShape(event);
    this.#drawPreview(shape ? [shape] : []);
  }

  /** @override */
  _onDragLeftDrop(event) {
    const shape = this.#dragShape(event);
    const kind = game.activeTool;
    this.cancelDrawing();
    if ( shape ) this.#apply([shape], kind);
  }

  /** @override */
  _onDragLeftCancel(event) {
    this.cancelDrawing();
  }

  /** @override */
  _onClickLeft(event) {
    const point = event.interactionData.origin;
    if ( game.activeTool === "polygon" ) this.#addCorner(point);
    else if ( game.activeTool === "room" ) {
      const room = this.roomAt(point);
      if ( room ) this.#apply([room], "room");
      else ui.notifications.warn(t("SMK.Notice.noRoom"));
    }
  }

  /** @override */
  _onClickLeft2(event) {
    if ( game.activeTool === "polygon" ) this.#finishPolygon();
  }

  /** @override */
  _onClickRight(event) {
    if ( (game.activeTool !== "polygon") || !this.#points.length ) return;
    this.#points.pop();
    this.#drawPolygonPreview();
  }

  /** @override */
  _onDismissKey(event) {
    if ( !this.#points.length && !this.#origin ) return false;
    this.cancelDrawing();
    return true;
  }

  /** @override */
  _onUndoKey(event) {
    if ( this.#points.length ) {
      this.#points.pop();
      this.#drawPolygonPreview();
      return true;
    }
    undoLast();
    return true;
  }

  /**
   * Add a corner to the polygon; a click near the first corner closes it.
   * @param {{x: number, y: number}} point
   */
  #addCorner(point) {
    const distance = 12 / (canvas.stage.scale.x || 1);
    if ( (this.#points.length >= 3) && near(point, this.#points[0], distance) ) {
      this.#finishPolygon();
      return;
    }
    this.#points.push({x: point.x, y: point.y});
    this.#drawPolygonPreview();
  }

  /**
   * Apply the polygon being drawn.
   */
  #finishPolygon() {
    const shape = polygonShape(this.#points);
    if ( !shape ) {
      if ( this.#points.length ) ui.notifications.warn(t("SMK.Notice.polygonTooSmall"));
      this.cancelDrawing();
      return;
    }
    this.#apply([shape], "polygon");
  }

  /**
   * The preview of the polygon being drawn, with the edge to the mouse.
   */
  #drawPolygonPreview() {
    const line = this.#points.flatMap(p => [p.x, p.y]);
    if ( this.#mouse && line.length ) line.push(this.#mouse.x, this.#mouse.y);
    const corners = this.#mouse ? [...this.#points, this.#mouse] : this.#points;
    const shape = (corners.length >= 3) ? polygonShape(corners) : null;
    this.#drawPreview(shape ? [shape] : [], line);
  }

  /**
   * Mouse moves: the polygon's next edge and the room under the mouse.
   * @param {PIXI.FederatedEvent} event
   */
  #handleMove(event) {
    if ( !this.active ) return;
    this.#mouse = event.getLocalPosition(canvas.stage);
    if ( this.#frame ) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      if ( !this.active || !this.#mouse ) return;
      if ( (game.activeTool === "polygon") && this.#points.length ) this.#drawPolygonPreview();
      else if ( game.activeTool === "room" ) {
        this.#room = this.roomAt(this.#mouse);
        this.#drawPreview(this.#room ? [this.#room] : []);
      }
    });
  }

  /* -------------------------------------------- */
  /*  What the players know                       */
  /* -------------------------------------------- */

  /**
   * Show or update the tint over what the chosen players do not know.
   */
  async refreshOverlay() {
    const run = ++this.#overlayRun;
    const sprite = this.#overlay;
    if ( !sprite ) return;
    if ( !this.active || !setting("overlay") || blocker(canvas.scene) ) {
      sprite.visible = false;
      return;
    }
    try {
      const {texture, area} = await knowledgeTexture(canvas.scene, canvas.level.id, overlayUsers());
      if ( (run !== this.#overlayRun) || (this.#overlay !== sprite) ) {
        texture.destroy(true);
        return;
      }
      const old = sprite.texture;
      sprite.texture = texture;
      if ( old && (old !== PIXI.Texture.EMPTY) ) old.destroy(true);
      sprite.position.set(area.x, area.y);
      sprite.width = area.config.width;
      sprite.height = area.config.height;
      sprite.filters = [this.#tint()];
      sprite.visible = true;
      countFeature(MODULE_ID, "overlayShown");
    } catch(err) {
      console.error("sephrals-map-knowledge | Could not show what the players know", err);
      sprite.visible = false;
    }
  }

  /**
   * The filter that turns the red channel of a fog texture into a tint over the unknown parts: alpha = opacity where
   * red is 0, none where red is 1.
   * @returns {PIXI.ColorMatrixFilter}
   */
  #tint() {
    const color = foundry.utils.Color.from(setting("overlayColor") || "#14213d");
    const [r, g, b] = color.rgb;
    const a = Number(setting("overlayOpacity")) || 0.6;
    const filter = new PIXI.ColorMatrixFilter();
    filter.matrix = [0, 0, 0, 0, r, 0, 0, 0, 0, g, 0, 0, 0, 0, b, -a, 0, 0, 0, a];
    return filter;
  }
}
