import assert from "node:assert/strict";
import test from "node:test";
import {GROUPS, REFRESH_HOOK, touched} from "../scripts/refresh-logic.mjs";

const ID = "sephrals-map-knowledge";

test("the hook is the translator's", () => {
  assert.equal(REFRESH_HOOK, "sephrals-translator.refresh");
});

test("view keys touch the bar, other keys do not", () => {
  assert.deepEqual(touched({moduleId: ID, keys: ["SMK.View.apply"]}, ID), {bar: true});
  assert.deepEqual(touched({moduleId: ID, keys: ["SMK.Controls.rect", "SMK.Notice.noRoom"]}, ID), {bar: false});
});

test("other modules and null keys", () => {
  assert.deepEqual(touched({moduleId: "x", keys: ["SMK.View.apply"]}, ID), {bar: false});
  assert.deepEqual(touched(null, ID), {bar: false});
  assert.deepEqual(touched({module: ID, keys: null}, ID), {bar: true});
  assert.deepEqual(Object.keys(GROUPS), ["bar"]);
});
