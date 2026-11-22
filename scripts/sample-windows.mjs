// Sample windows (api.samples, contract in samples.mjs): the window with the tools, the bar of the check and the view,
// the history, the tools, the keys, the question and the settings of the Region behavior, filled with made-up players
// and changes. Nothing here writes: no fog exploration, setting, scene or Region is read or changed, the canvas stays as
// it is, every button only says that it does nothing.
import {BEHAVIOR_TYPE, MODULE_ID, esc, setting, t} from "./config.mjs";
import {PanelApp, describeChange} from "./panel-app.mjs";
import {fillBar} from "./view.mjs";
import {KEYS, TOOLS, barModels, panelSource, sampleHistory} from "./sample-data.mjs";
import {markSample, openSampleDialog, openSampleHtml, sampleActions, sampleId, sampleText} from "./samples.mjs";

/** The window with the tools over made-up data. Its buttons and switches change nothing. */
class SamplePanel extends PanelApp {
  constructor(kind) {
    super({id: sampleId(MODULE_ID, `panel-${kind}`), actions: sampleActions(PanelApp, []),
      position: {top: 90, left: 90}});
    this.kind = kind;
    markSample(this);
  }

  /** @override */
  _panelSource() {
    return panelSource(this.kind, {t, place: sampleText("place"), level: t("SMK.Sample.Level"),
      theme: setting("theme")});
  }

  /** @override */
  _onRender(context, options) {
    // No listeners: the switches and lists look like the real ones but save nothing
    this.element.dataset.smkTheme = context.theme;
  }
}

async function openPanel(kind) {
  const id = sampleId(MODULE_ID, `panel-${kind}`);
  await foundry.applications.instances.get(id)?.close({animate: false});
  const app = new SamplePanel(kind);
  await app.render({force: true});
  return app;
}

/** An element in the look of the module, for the parts shown in a plain sample window. */
function themed(html) {
  const box = document.createElement("div");
  box.className = "smk-app smk-sample-body";
  box.dataset.smkTheme = setting("theme");
  box.style.cssText = "padding:10px;background:var(--smk-paper);color:var(--smk-ink);";
  box.innerHTML = html;
  return box;
}

/** The bars of the check and the view, one under the other (the real bar floats over the map). */
function barsBody() {
  const box = themed("");
  box.style.cssText += "display:flex;flex-direction:column;gap:8px;";
  for ( const model of barModels() ) {
    const bar = document.createElement("div");
    bar.className = "smk-viewbar";
    bar.style.cssText = "position:static;transform:none;max-width:none;";
    fillBar(bar, model);
    box.append(bar);
  }
  return box;
}

/** The list of the last changes as the window writes them in its footer. */
function historyBody() {
  const lines = sampleHistory().map(entry => `<li>${esc(describeChange(entry))}</li>`);
  const failed = {...sampleHistory()[0], results: {lena: {result: "live"}, jo: {result: "failed"}}};
  lines.push(`<li>${esc(describeChange(failed))}</li>`);
  return themed(`<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px;">${lines.join("")}</ul>`);
}

/** The tools of the scene controls with their hints. */
function toolsBody() {
  const rows = TOOLS.map(tool => `<li style="display:flex;gap:10px;align-items:center;">`
    + `<span style="flex:none;width:34px;height:34px;display:flex;align-items:center;justify-content:center;`
    + `border:1px solid var(--smk-line);border-radius:var(--smk-radius);background:var(--smk-card);">`
    + `<i class="${tool.icon}" inert></i></span><span>${esc(t(`SMK.Controls.${tool.key}`))}</span></li>`);
  return themed(`<h3 style="margin:0 0 8px;color:var(--smk-ink);border:0;">${esc(t("SMK.Controls.title"))}</h3>`
    + `<ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;">${rows.join("")}</ul>`);
}

/** The keys the module registers, as the key settings list them. */
function keysBody() {
  const rows = KEYS.map(key => `<li>${esc(t(`SMK.Keys.${key}`))}</li>`);
  return themed(`<h3 style="margin:0 0 8px;color:var(--smk-ink);border:0;">${esc(t("SMK.Panel.title"))}</h3>`
    + `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px;">${rows.join("")}</ul>`);
}

/** The settings of the Region behavior, drawn from its data model like the Region's behavior window draws them. */
function behaviorBody() {
  const Type = CONFIG.RegionBehavior.dataModels[BEHAVIOR_TYPE];
  const form = document.createElement("form");
  form.className = "standard-form";
  form.style.cssText = "padding:10px;";
  form.addEventListener("submit", event => event.preventDefault());
  // No Region is chosen: the empty field shows no tag of an invalid value
  const style = document.createElement("style");
  style.textContent = ".smk-sample-form document-tags .tag {display: none;}";
  form.classList.add("smk-sample-form");
  form.append(style);
  const title = document.createElement("h3");
  title.textContent = t("SMK.BEHAVIOR.label");
  title.style.cssText = "margin:0 0 4px;";
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = t("SMK.BEHAVIOR.hint");
  form.append(title, hint);
  // The labels and hints are the module's own texts (the events field is Foundry's)
  for ( const name of ["area", "audience", "hide", "playersOnly", "once"] ) {
    const field = Type.schema.fields[name];
    if ( !field ) continue;
    try {
      const value = (name === "area") ? undefined : (field.getInitialValue?.() ?? field.initial);
      const group = field.toFormGroup({label: t(`SMK.BEHAVIOR.FIELDS.${name}.label`),
        hint: t(`SMK.BEHAVIOR.FIELDS.${name}.hint`)}, {value, localize: true});
      form.append(group);
    } catch(err) {
      console.warn(`${MODULE_ID} | The sample could not draw the field ${name}`, err);
    }
  }
  return form;
}

/**
 * The sample windows of the module (api.samples).
 * @returns {{id: string, label: string, group: string, open: () => Promise<object>}[]}
 */
export function sampleWindows() {
  const group = key => t(`SMK.Sample.Group.${key}`);
  const label = key => t(`SMK.Sample.Label.${key}`);
  const entries = [];
  const panel = (id, kind) => entries.push({id, group: group("windows"), label: label(id), open: () => openPanel(kind)});
  panel("panel", "tools");
  panel("panelShared", "shared");
  panel("panelVision", "vision");
  panel("panelExploration", "exploration");
  panel("panelApi", "api");
  panel("panelEmpty", "empty");
  const html = (id, groupKey, body, width) => entries.push({id, group: group(groupKey), label: label(id),
    open: () => openSampleHtml({moduleId: MODULE_ID, id, title: label(id), body, width})});
  html("history", "history", historyBody, 460);
  html("bar", "bar", barsBody, 620);
  html("tools", "tools", toolsBody, 520);
  html("keys", "tools", keysBody, 380);
  html("behavior", "behavior", behaviorBody, 540);
  entries.push({id: "hideConfirm", group: group("questions"), label: label("hideConfirm"),
    open: () => openSampleDialog({moduleId: MODULE_ID, id: "hideConfirm", title: t("SMK.Panel.hideWhole"),
      content: `<p>${esc(t("SMK.Panel.hideWholeConfirm"))}</p>`,
      buttons: [{label: game.i18n.localize("Yes"), icon: "fa-solid fa-check", default: true},
        {label: game.i18n.localize("No"), icon: "fa-solid fa-xmark"}], width: 400})});
  return entries;
}

export const __test__ = {SamplePanel};
