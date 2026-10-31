import {LAYER, MODULE_ID, TESTED_VERSIONS} from "./config.mjs";
import {changeShapes, changeWholeLevel, chosenPlayers, shareKnowledge, undoLast} from "./actions.mjs";
import {registerDebug} from "./debug.mjs";
import {saveDebugFile} from "./debug-file.mjs";
import {registerHubModule} from "./hub.mjs";
import {knowsPoint, snapshotCount} from "./fog.mjs";
import {applyModuleLanguage} from "./language.mjs";
import {MapKnowledgeLayer, hideMode, setHideMode} from "./layer.mjs";
import {openPanel, refreshPanel} from "./panel-app.mjs";
import {regionShapes, registerBehavior} from "./region-behavior.mjs";
import {changes, pendingCount, registerRelay, watchChanges} from "./relay.mjs";
import {noticeNewVersions, runSelfTest} from "./selftest.mjs";
import {changeLanguage, registerSettings} from "./settings.mjs";
import {cleanShape, ellipseShape, polygonShape, rectShape} from "./shapes.mjs";
import {registerUsage} from "./usage.mjs";

/** Update the tint of what the players know a moment after changes or token moves (their client saves after 2 s). */
const overlaySoon = foundry.utils.debounce(() => canvas[LAYER]?.refreshOverlay(), 700);
const overlayLater = foundry.utils.debounce(() => canvas[LAYER]?.refreshOverlay(), 4000);

Hooks.once("init", () => {
  registerHubModule({moduleId: MODULE_ID, tested: TESTED_VERSIONS});
  CONFIG.Canvas.layers[LAYER] = {layerClass: MapKnowledgeLayer, group: "interface"};
  registerBehavior();
  registerSettings({
    language: value => changeLanguage(value, refreshPanel),
    redraw: () => {
      refreshPanel();
      overlaySoon();
    },
    overlay: () => {
      overlaySoon();
      refreshPanel();
      const tool = ui.controls?.controls?.[LAYER]?.tools?.overlay;
      if ( tool && (tool.active !== game.settings.get(MODULE_ID, "overlay")) ) ui.controls.render({reset: true});
    },
    openPanel
  });
  // Counted only on the active GM's client, like every Sephral module
  registerUsage(MODULE_ID, {
    features: ["revealed", "hidden", "polygonUsed", "roomRevealed", "levelChanged", "shared", "undone",
      "overlayShown", "regionTriggered"],
    settings: ["theme", "openPanel", "notifyPlayers"]
  });
  registerKeys();
  registerDebug(() => ({
    changes: changes().map(e => ({id: e.id, kind: e.kind, action: e.action, scene: e.scene, level: e.level, at: e.at,
      undone: !!e.undone, results: e.results})),
    snapshots: snapshotCount(),
    waiting: pendingCount()
  }));
  game.modules.get(MODULE_ID).api = {
    /** Open the window with the tools (GM). */
    open: openPanel,
    /**
     * Reveal shapes for players (GM). Shapes: from api.shapes, or {x, y, width, height} rectangles. Options: {scene,
     * level, users}; the viewed scene and Level and the players chosen in the window by default.
     */
    reveal: (shapes, options = {}) => changeShapes(toShapes(shapes), {...options, hide: false, kind: "api"}),
    /** Hide shapes again (GM), same options. */
    hide: (shapes, options = {}) => changeShapes(toShapes(shapes), {...options, hide: true, kind: "api"}),
    /** Reveal (or with {hide: true} hide) the area of a Region on its scene (GM). */
    revealRegion: (region, options = {}) => changeShapes(regionShapes(region),
      {...options, scene: region.parent, kind: "region"}),
    /** Reveal the whole viewed Level (GM). Options: {users}. */
    revealLevel: (options = {}) => changeWholeLevel({...options, hide: false}),
    /** Hide the whole viewed Level (GM). Options: {users}. */
    hideLevel: (options = {}) => changeWholeLevel({...options, hide: true}),
    /** Give players what another player knows of the viewed scene and Level (GM). */
    share: (fromUserId, users) => shareKnowledge(fromUserId, users),
    /** Take the newest change back (GM). */
    undo: undoLast,
    /** Does a user know a point? Options: {user, scene, level}; GMs may ask for any user, players for themselves. */
    knows: (point, {user = game.user, scene = canvas.scene, level} = {}) => knowsPoint(point, {scene,
      level: level ?? ((scene === canvas.scene) ? canvas.level?.id : (scene._view ?? scene.initialLevel?.id)),
      userId: user?.id ?? user}),
    /** Shape helpers: rect(a, b), ellipse(a, b), polygon(points). */
    shapes: {rect: rectShape, ellipse: ellipseShape, polygon: polygonShape},
    /** The players a change from the window goes to. */
    chosenPlayers,
    /** The GM's recent changes, newest last. */
    changes,
    /** Is the hide mode on, and switch it. */
    hideMode,
    setHideMode,
    /** Check the module (GM). */
    runSelfTest,
    /** Save the debug file of Sephral's modules (GM). */
    saveDebugFile: messageId => saveDebugFile(messageId ?? null, {moduleId: MODULE_ID})
  };
});

/** Applying a fixed module language loads its file; the rest of "ready" waits for it. */
let languageReady = Promise.resolve();

Hooks.once("i18nInit", () => {
  languageReady = applyModuleLanguage(game.settings.get(MODULE_ID, "uiLanguage"));
});

Hooks.once("ready", async () => {
  await languageReady;
  registerRelay();
  watchChanges(() => {
    refreshPanel();
    overlaySoon();
  });
  noticeNewVersions();
});

Hooks.on("canvasReady", () => {
  refreshPanel();
  overlaySoon();
});
for ( const hook of ["userConnected", "createUser", "updateUser", "deleteUser"] ) Hooks.on(hook, () => refreshPanel());
Hooks.on("updateToken", (token, changed) => {
  if ( game.user.isGM && canvas[LAYER]?.active && (("x" in changed) || ("y" in changed)) ) overlayLater();
});

/**
 * Shapes for the API: shape objects, rectangles or a mix, one or many.
 * @param {object|object[]} input
 * @returns {object[]}
 */
function toShapes(input) {
  const list = Array.isArray(input) ? input : [input];
  return list.map(item => {
    if ( item && ("width" in item) && ("height" in item) && !item.type ) {
      return rectShape({x: item.x, y: item.y}, {x: item.x + item.width, y: item.y + item.height});
    }
    return cleanShape(item);
  }).filter(Boolean);
}

/**
 * The keys: open the window and switch between reveal and hide. No default keys, the GM picks them in Foundry's key
 * settings. Ctrl+Z takes the last change back while the tools are active.
 */
function registerKeys() {
  game.keybindings.register(MODULE_ID, "openPanel", {
    name: "SMK.Keys.openPanel",
    editable: [],
    restricted: true,
    onDown: () => {
      openPanel();
      return true;
    }
  });
  game.keybindings.register(MODULE_ID, "toggleMode", {
    name: "SMK.Keys.toggleMode",
    editable: [],
    restricted: true,
    onDown: () => {
      setHideMode(!hideMode());
      return true;
    }
  });
}
