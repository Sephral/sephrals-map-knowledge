import assert from "node:assert/strict";
import test from "node:test";
import {LIMITS, cleanOp, cleanShape, ellipseShape, fogTexture, isImage, near, polygonArea, polygonShape, rectShape,
  remember, shapeBounds, splitTargets, targetIds, trianglesShape} from "../scripts/shapes.mjs";

const IMAGE = "data:image/webp;base64,UklGRhIAAABXRUJQ";

test("polygon area has a sign by direction", () => {
  assert.equal(polygonArea([0, 0, 10, 0, 10, 10, 0, 10]), 100);
  assert.equal(polygonArea([0, 0, 0, 10, 10, 10, 10, 0]), -100);
});

test("a rectangle between two corners, any direction", () => {
  assert.deepEqual(rectShape({x: 300, y: 200}, {x: 100, y: 50}).points, [100, 50, 300, 50, 300, 200, 100, 200]);
  assert.equal(rectShape({x: 5, y: 5}, {x: 5, y: 80}), null, "no width");
});

test("a square grows the shorter side away from the first corner", () => {
  assert.deepEqual(rectShape({x: 100, y: 100}, {x: 40, y: 130}, {square: true}).points,
    [40, 100, 100, 100, 100, 160, 40, 160]);
});

test("an ellipse stays inside its box and gets enough corners", () => {
  const shape = ellipseShape({x: 0, y: 0}, {x: 400, y: 200});
  const box = shapeBounds(shape);
  assert.ok(box.x >= 0 && box.y >= 0 && (box.x + box.width) <= 400.0001 && (box.y + box.height) <= 200.0001);
  assert.ok((shape.points.length / 2) >= 24 && (shape.points.length / 2) <= 128);
  const circle = shapeBounds(ellipseShape({x: 0, y: 0}, {x: 400, y: 100}, {circle: true}));
  assert.ok(Math.abs(circle.width - circle.height) < 1);
  assert.equal(ellipseShape({x: 0, y: 0}, {x: 0, y: 10}), null);
});

test("a polygon drops repeated and closing corners", () => {
  const shape = polygonShape([{x: 0, y: 0}, {x: 0, y: 0}, {x: 100, y: 0}, {x: 100, y: 100}, {x: 0, y: 0}]);
  assert.deepEqual(shape.points, [0, 0, 100, 0, 100, 100]);
  assert.equal(polygonShape([{x: 0, y: 0}, {x: 10, y: 10}]), null, "two corners");
  assert.equal(polygonShape([0, 0, 10, 10, 20, 20]), null, "no area");
  assert.equal(polygonShape([0, 0, Number.NaN, 10, 20, 0]), null);
});

test("triangles copy typed arrays and need whole triangles", () => {
  const shape = trianglesShape(new Float32Array([0, 0, 10, 0, 0, 10]), new Uint16Array([0, 1, 2]));
  assert.deepEqual(shape, {type: "triangles", vertices: [0, 0, 10, 0, 0, 10], indices: [0, 1, 2]});
  assert.equal(trianglesShape([0, 0, 10, 0, 0, 10], [0, 1]), null);
});

test("shapes from elsewhere are checked", () => {
  assert.ok(cleanShape({type: "polygon", points: [0, 0, 10, 0, 10, 10]}));
  assert.equal(cleanShape({type: "polygon", points: [0, 0, 10, 0, "x", 10]}), null);
  assert.equal(cleanShape({type: "circle", x: 0}), null);
  assert.equal(cleanShape({type: "triangles", vertices: [0, 0, 10, 0, 0, 10], indices: [0, 1, 3]}), null,
    "index out of range");
  assert.equal(cleanShape({type: "polygon", points: new Array(LIMITS.points + 2).fill(1)}), null);
});

test("changes from elsewhere are checked", () => {
  const base = {id: "abc123", scene: "Scene0001", level: "defaultLevel0000", by: "Gm0001"};
  const reveal = cleanOp({...base, action: "reveal", shapes: [{type: "polygon", points: [0, 0, 10, 0, 10, 10]}],
    extra: "dropped"});
  assert.equal(reveal.action, "reveal");
  assert.equal(reveal.extra, undefined);
  assert.equal(cleanOp({...base, action: "reveal", shapes: []}), null, "nothing to reveal");
  assert.equal(cleanOp({...base, action: "explode", shapes: []}), null);
  assert.equal(cleanOp({...base, scene: "../x", action: "hide", shapes: [{type: "polygon", points: [0, 0, 9, 0, 9, 9]}]}),
    null);
  assert.equal(cleanOp({...base, action: "share", shapes: []}), null, "share needs a picture");
  assert.equal(cleanOp({...base, action: "share", shapes: [], image: IMAGE}).image, IMAGE);
  assert.equal(cleanOp({...base, action: "undo", shapes: []}), null, "undo needs the change");
  assert.equal(cleanOp({...base, action: "undo", undo: "op1", shapes: [], before: null}).before, null);
  assert.equal(cleanOp({...base, action: "undo", undo: "op1", shapes: [], before: "javascript:1"}), null);
  assert.equal("before" in cleanOp({...base, action: "undo", undo: "op1", shapes: []}), false);
  const many = new Array(LIMITS.shapes + 1).fill({type: "polygon", points: [0, 0, 10, 0, 10, 10]});
  assert.equal(cleanOp({...base, action: "reveal", shapes: many}), null, "too many shapes: all or nothing");
});

test("pictures are data URLs of a few types", () => {
  assert.ok(isImage(IMAGE));
  assert.ok(!isImage("data:text/html;base64,PGI+"));
  assert.ok(!isImage("https://example.com/a.webp"));
});

test("the fog texture matches Foundry's sizes", () => {
  const dims = {sceneX: 200, sceneY: 150, sceneWidth: 2000, sceneHeight: 1500};
  assert.deepEqual(fogTexture(dims), {x: 200, y: 150, width: 2000, height: 1500, resolution: 1});
  const wide = fogTexture({sceneX: 0, sceneY: 0, sceneWidth: 8000, sceneHeight: 3001});
  assert.equal(wide.resolution, 4096 / 8000);
  assert.equal(wide.width, 8000);
  assert.ok(Number.isInteger(wide.height * wide.resolution), "whole pixels");
  const tall = fogTexture({sceneX: 0, sceneY: 0, sceneWidth: 3001, sceneHeight: 9000});
  assert.equal(tall.resolution, 4096 / 9000);
  assert.ok(Number.isInteger(Math.round(tall.width * tall.resolution * 1e9) / 1e9));
});

test("near", () => {
  assert.ok(near({x: 0, y: 0}, {x: 3, y: 4}, 5));
  assert.ok(!near({x: 0, y: 0}, {x: 3, y: 4}, 4.9));
});

test("chosen players split into online and offline, GMs left out", () => {
  const users = [{id: "gm", active: true, isGM: true}, {id: "a", active: true, isGM: false},
    {id: "b", active: false, isGM: false}];
  assert.deepEqual(splitTargets(["a", "b", "gm", "zz", "a"], users), {online: ["a"], offline: ["b"]});
});

test("who gets a change", () => {
  const users = [{id: "gm", isGM: true}, {id: "a", isGM: false}, {id: "b", isGM: false}];
  assert.deepEqual(targetIds({all: true, chosen: []}, users, false), ["a", "b"]);
  assert.deepEqual(targetIds({all: false, chosen: ["b", "gm"]}, users, false), ["b"]);
  assert.deepEqual(targetIds({all: false, chosen: ["b"]}, users, true), ["a", "b"], "shared fog: everyone");
});

test("remember keeps the newest entries", () => {
  const list = [];
  for ( let i = 0; i < 5; i++ ) remember(list, i, 3);
  assert.deepEqual(list, [2, 3, 4]);
});
