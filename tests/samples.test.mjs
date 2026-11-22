import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {KEYS, PLAYERS, PROBLEMS, TOOLS, barModels, panelSource, sampleHistory, sampleResults} from "../scripts/sample-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const en = JSON.parse(await readFile(path.join(root, "lang/en.json"), "utf8"));
const get = (obj, key) => key.split(".").reduce((o, k) => o?.[k], obj);

test("every text the sample data and windows ask for exists", async () => {
  const asked = new Set();
  const t = key => {
    asked.add(key);
    return String(get(en, key) ?? key);
  };
  for ( const kind of ["tools", "shared", "vision", "exploration", "api", "empty"] ) panelSource(kind, {t, place: "Mill", level: "Floor"});
  for ( const key of Object.keys(PROBLEMS) ) asked.add(PROBLEMS[key]);
  for ( const tool of TOOLS ) asked.add(`SMK.Controls.${tool.key}`);
  for ( const key of KEYS ) asked.add(`SMK.Keys.${key}`);
  for ( const key of ["windows", "history", "bar", "tools", "questions", "behavior"] ) asked.add(`SMK.Sample.Group.${key}`);
  for ( const key of ["panel", "panelShared", "panelVision", "panelExploration", "panelApi", "panelEmpty", "history", "bar",
    "tools", "keys", "hideConfirm", "behavior"] ) asked.add(`SMK.Sample.Label.${key}`);
  asked.add("SMK.Sample.Level");
  for ( const key of asked ) assert.ok(get(en, key) !== undefined, key);
});

test("the sample history covers every kind and action, and the undone one", () => {
  const history = sampleHistory(1000000);
  assert.deepEqual([...new Set(history.map(e => e.kind))].sort(),
    ["api", "ellipse", "polygon", "rect", "region", "room", "share", "whole"]);
  assert.deepEqual([...new Set(history.map(e => e.action))].sort(), ["hide", "reveal", "share", "undo"]);
  assert.ok(history.some(e => e.undone));
  assert.ok(history.every(e => e.at < 1000000));
});

test("results: everyone, or the last one failed", () => {
  assert.equal(Object.keys(sampleResults(4)).length, 4);
  assert.equal(sampleResults(4, true).jo.result, "failed");
  assert.ok(Object.values(sampleResults(2)).every(r => r.result !== "failed"));
});

test("panel sources: shared fog, problems and the empty window", () => {
  const t = key => key;
  const args = {t, place: "Mill", level: "Floor"};
  const tools = panelSource("tools", args);
  assert.equal(tools.shared, false);
  assert.equal(tools.rows.length, PLAYERS.length);
  assert.ok(tools.canUndo && tools.last);
  const shared = panelSource("shared", args);
  assert.equal(shared.shared, true);
  assert.ok(shared.rows.every(r => r.chosen));
  assert.equal(shared.viewing, "tom");
  assert.equal(panelSource("vision", args).problem, "SMK.Notice.noVision");
  const empty = panelSource("empty", args);
  assert.deepEqual([empty.rows.length, empty.problem, empty.scene], [0, "SMK.Notice.noScene", "SMK.Panel.noScene"]);
});

test("the bars show revealing, hiding, mixed with a note, and the view", () => {
  const models = barModels();
  assert.deepEqual(models.filter(m => m.check).map(m => m.check.what), ["revealing", "hiding", "mixed"]);
  assert.equal(models.filter(m => m.check?.notAffected).length, 1);
  assert.ok(models.some(m => m.view));
});
