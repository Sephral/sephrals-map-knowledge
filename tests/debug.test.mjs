import assert from "node:assert/strict";
import test from "node:test";

// The parts of Foundry the registration and the state touch
const menus = new Map();
const hooks = [];
const getProperty = (object, path) => path.split(".").reduce((o, k) => o?.[k], object);
const scene = {
  uuid: "Scene.s", tokenVision: true, fog: {mode: 1}, levels: {size: 2},
  regions: [{behaviors: [{type: "sephrals-map-knowledge.reveal"}, {type: "teleportToken"}]}]
};
globalThis.Hooks = {on: name => hooks.push(name)};
globalThis.foundry = {utils: {getProperty}, applications: {api: {ApplicationV2: class {}}}};
globalThis.canvas = {scene, level: {id: "lvl1"}, visibility: {textureConfiguration: {width: 3000, height: 2000,
  resolution: 1, format: 6403}}};
globalThis.game = {
  user: {id: "gm", isGM: true},
  scenes: [scene],
  users: [{id: "gm", isGM: true, active: true}, {id: "p1", isGM: false, active: true},
    {id: "p2", isGM: false, active: false}],
  i18n: {localize: key => key, format: (key, data) => `${key} ${JSON.stringify(data)}`},
  settings: {registerMenu: (module, key, data) => menus.set(`${module}.${key}`, data), get: () => null}
};
game.scenes.reduce = Array.prototype.reduce.bind(game.scenes);

const {MODULE_ID} = await import("../scripts/config.mjs");
const {describeState, registerDebug, trace} = await import("../scripts/debug.mjs");

test("the debug file button and the module's part are registered", () => {
  registerDebug(() => ({changes: [{id: "op1", kind: "rect", results: {p1: {result: "live"}}}], snapshots: 2,
    waiting: 0}));
  const menu = menus.get(`${MODULE_ID}.debugFile`);
  assert.equal(menu.label, "SMK.DEBUG.Save");
  assert.equal(menu.restricted, true);
  const provider = globalThis.sephralsDebugFiles.providers.get(MODULE_ID);
  assert.equal(provider.label(), "SMK.DEBUG.Entry");
  assert.equal(provider.message, undefined);
  assert.equal(provider.trace, trace);
  assert.deepEqual(hooks, ["getChatMessageContextOptions"]);
});

test("the state names the scene, its fog and the recent changes, without pictures", () => {
  const state = describeState();
  assert.deepEqual(state.viewed, {scene: "Scene.s", level: "lvl1", tokenVision: true, fogMode: 1, levels: 2});
  assert.deepEqual(state.texture, {width: 3000, height: 2000, resolution: 1});
  assert.equal(state.behaviors, 1);
  assert.deepEqual(state.players, [{id: "p1", active: true}, {id: "p2", active: false}]);
  assert.equal(state.changes[0].kind, "rect");
  assert.equal(state.snapshots, 2);
  assert.ok(!JSON.stringify(state).includes("data:image"));
});
