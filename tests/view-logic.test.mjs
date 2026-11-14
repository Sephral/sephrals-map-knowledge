import assert from "node:assert/strict";
import {test} from "node:test";
import {MAX_PENDING, addPending, coverMatrix, cycleUser, describePending, previewUser, viewUsers, wouldAffect}
  from "../scripts/view-logic.mjs";

test("cycling goes off, each player, off again", () => {
  const ids = ["a", "b"];
  assert.equal(cycleUser(ids, "", 1), "a");
  assert.equal(cycleUser(ids, "a", 1), "b");
  assert.equal(cycleUser(ids, "b", 1), "");
  assert.equal(cycleUser(ids, "", -1), "b");
  assert.equal(cycleUser(ids, "a", -1), "");
  assert.equal(cycleUser([], "", 1), "");
  assert.equal(cycleUser(ids, "gone", 1), "a");
});

test("a view uses one player's fog, or all of them with shared fog", () => {
  assert.deepEqual(viewUsers("a", {shared: false, playerIds: ["a", "b"]}), ["a"]);
  assert.deepEqual(viewUsers("a", {shared: true, playerIds: ["a", "b"]}), ["a", "b"]);
  assert.deepEqual(viewUsers("", {shared: true, playerIds: ["a"]}), []);
});

test("the previewed player", () => {
  const base = {playerIds: ["a", "b", "c"], chosen: ["b", "c"]};
  assert.equal(previewUser({...base}), "");
  assert.equal(previewUser({...base, viewAs: "a"}), "a");
  assert.equal(previewUser({...base, pending: true}), "b");
  assert.equal(previewUser({...base, pending: true, checkUser: "c"}), "c");
  assert.equal(previewUser({...base, pending: true, checkUser: "gone"}), "b");
  assert.equal(previewUser({...base, pending: true, chosen: []}), "a");
  assert.equal(previewUser({...base, viewAs: "gone"}), "");
});

test("the pending list keeps the newest and ignores empty changes", () => {
  const list = [];
  addPending(list, {action: "reveal", shapes: []});
  addPending(list, {action: "nonsense", shapes: [{}]});
  assert.equal(list.length, 0);
  for ( let i = 0; i < MAX_PENDING + 5; i++ ) addPending(list, {action: "reveal", shapes: [{i}], kind: "rect"});
  assert.equal(list.length, MAX_PENDING);
  assert.equal(list.at(-1).shapes[0].i, MAX_PENDING + 4);
  assert.deepEqual(describePending([{action: "reveal", shapes: [1, 2]}, {action: "hide", shapes: [3]}]),
    {reveal: 1, hide: 1, shapes: 3});
});

test("who a change would reach", () => {
  assert.equal(wouldAffect("a", ["a", "b"]), true);
  assert.equal(wouldAffect("c", ["a", "b"]), false);
  assert.equal(wouldAffect("", ["a"]), false);
});

test("the cover matrix is opaque where unknown", () => {
  const m = coverMatrix([0, 0, 0], 1);
  assert.equal(m.length, 20);
  assert.equal(m[18], 0);
  assert.equal(m[19], 1);
  assert.equal(m[15], -1);
  assert.equal(coverMatrix([0, 0, 0], 5)[19], 1);
});
