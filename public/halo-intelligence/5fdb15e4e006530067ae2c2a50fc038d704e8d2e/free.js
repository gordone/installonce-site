import { auth, apiOrigin } from "./auth-adapter.js";
import { mountPractice1607 } from "./practice1607.js";

const $ = (id) => document.getElementById(id);
const DAY = 86400000;
// The first-party host enables the reviewed interface; query flags also support local previews.
const hostedStreamlined = auth.experience === "streamlined";
const streamlined = hostedStreamlined || new URLSearchParams(location.search).get("streamlined") === "1";
const menu1607 = streamlined && new URLSearchParams(location.search).get("menu") !== "overview";
let practiceModule = null, disposePractice = () => {};
let overviewExamples = null;
let practiceStage = "week", libraryQuery = "";
const nativePaths = {today:hostedStreamlined ? "/" : "/my-halo/overview/",halos:"/my-halo/dashboard/",plus:"/my-halo/plus/"};
const nativeHost = location.pathname.startsWith("/my-halo/") || (hostedStreamlined && location.pathname === "/");
const routeView = () => Object.keys(nativePaths).find((key) => nativePaths[key] === location.pathname) || "today";
const requestedPlan = () => {
  const entryPath = location.pathname === nativePaths.today || (hostedStreamlined && ["/my-halo/", "/my-halo/overview/"].includes(location.pathname));
  const value = entryPath ? new URLSearchParams(location.search).get("halo") : null;
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
};
const state = { owner: null, token: null, epoch: 0, busy: false, connecting: false, locked: false,
  view: nativeHost && routeView() !== "today" ? routeView() : "create", policy: null, plan: null, initiative: null, history: [], sample: false,
  items: [], cursor: null, active: [], entry: "", horizon: "7", attempt: null, receipt: null,
  editor: null, identityDraft: null, interpretationAttempt: null, interpretationProposal: null, outputLanguage: "", repeat: null, localSignedOut: false };
const requests = new Set();
if (menu1607 && (!nativeHost || routeView() === "today")) state.view = "practice";
let retry = null;
let calendarKey = "";
let timer = { plan: null, remaining: 60, deadline: null, interval: null };
let bookLibrary = { items: null, pending: false, failed: false };
let metricView = "";
if (streamlined) {
  document.body.classList.add("streamlined");
  const nav = document.querySelector('nav[aria-label="Main navigation"]');
  nav.replaceChildren();
  for (const [view, label] of [["today", "1·60·7"], ["home", "My HALO"], ["library", "Blueprints"], ["community", "Community"]]) {
    const control = node("button", label); control.type = "button";
    if (view === "home") control.id = "identity-home"; else control.dataset.view = view;
    nav.append(control);
  }
  const account = node("button", "Account"); account.type = "button"; account.dataset.view = "account";
  document.querySelector(".topbar > .row").prepend(account);
}
function metric(event, details = {}) {
  if (!state.owner || state.locked || state.sample) return;
  // Host may capture only after analytics consent. No plan/account IDs or text.
  window.dispatchEvent(new CustomEvent("halo:preview-metric", { detail: {
    event, tier: state.policy?.entitlement === "plus_preview" ? "plus_preview" : "free", ...details
  } }));
}

function node(tag, text, cls) {
  const el = document.createElement(tag);
  if (text !== undefined && text !== null) el.textContent = String(text);
  if (cls) el.className = cls;
  return el;
}
function button(text, fn, { primary = false, disabled = false, cls = "" } = {}) {
  const el = node("button", text, [primary ? "primary" : "", cls].filter(Boolean).join(" "));
  el.type = "button"; el.dataset.baseDisabled = String(disabled);
  el.disabled = disabled || state.busy; el.addEventListener("click", fn); return el;
}
function panel(title, ...children) { const el = node("section", null, "card"); if (title) el.append(node("h2", title)); el.append(...children); return el; }
function row(...children) { const el = node("div", null, "row"); el.append(...children); return el; }
function badge(text) { return node("span", text, "badge"); }
function actions(...children) { const el = row(...children); el.className = "actions"; return el; }
function stack(...children) { const el = node("div", null, "stack"); el.append(...children); return el; }
function previewUrl(path) { return path + (streamlined && !hostedStreamlined ? (path.includes("?") ? "&" : "?") + "streamlined=1" + (menu1607 ? "&menu=1607" : "") : ""); }
function notice(text, readRetry = null) {
  $("notice-wrap").hidden = !text; $("notice").textContent = text || "";
  retry = readRetry; $("retry").hidden = !readRetry;
}
function busy(value, building = false) {
  state.busy = value; $("building").hidden = !(value && building);
  $("main").setAttribute("aria-busy", String(value));
  for (const el of document.querySelectorAll("button, input, select, textarea")) {
    // The trusted host owns its sign-in dialog's loading/cancel state.
    if (el.dataset.allowBusy === "true" || el.closest("#halo-signin-dialog")) continue;
    el.disabled = value || el.dataset.baseDisabled === "true";
  }
}
function abort() { state.epoch++; for (const c of requests) c.abort(); requests.clear(); }
function stopTimer() { if (timer.interval) clearInterval(timer.interval); timer = { plan: null, remaining: 60, deadline: null, interval: null }; }
function closeEditor(clear = true) {
  if ($("editor").open) $("editor").close(); $("edit-fields").replaceChildren();
  $("edit-error").textContent = ""; if (clear) state.editor = null;
}
function clearPrivate() {
  abort(); stopTimer(); closeEditor();
  disposePractice(); practiceModule = null;
  Object.assign(state, { owner: null, token: null, locked: false, busy: false, policy: null,
    connecting: false, plan: null, initiative: null, history: [], sample: false, items: [], active: [], cursor: null,
    entry: "", horizon: "7", attempt: null, receipt: null, identityDraft: null, interpretationAttempt: null, interpretationProposal: null, outputLanguage: "", repeat: null, view: menu1607 ? "practice" : "create" });
}
function lock() {
  if (state.editor && $("editor").open) state.editor.values = formValues();
  abort(); stopTimer(); closeEditor(false);
  state.token = null; state.locked = true; state.connecting = false; busy(false); render();
  notice("Your session expired. Reconnect to continue. Unsaved entries are restored only to the same account.");
}
function failure(error) {
  const messages = {
    UPGRADE_REQUIRED: "Free supports one active seven-day HALO. Keep this draft; archive another active HALO or choose an eligible weekly HALO.",
    READ_ONLY: "This HALO is read-only. Open the current week or choose an eligible weekly HALO.",
    QUOTA_EXCEEDED: "Your account reached its AI request limit. Check Account for measured usage and the reset time. Saved work is unchanged.",
    language_unavailable: "This generation engine cannot produce that language. Your original words are unchanged.",
    FEATURE_UNAVAILABLE: "This feature is not available in this preview. Saved work is unchanged.",
    revision_conflict: "This HALO changed elsewhere. Your entries are still here. Discard this form and reload before editing the saved version.",
    generation_pending: "This request is still being prepared. Try again with the same entry to recover it without a second request.",
    generation_recovery_required: "We could not confirm the result. Try the same entry again to recover the original request.",
    draft_receipt_not_found: "The unsaved preview expired. Your intention is still here; a new generation uses a new AI request.",
  };
  return messages[error.code] || (error.status === 422
    ? "Check your entries, day coverage and dependencies. Your text is still here."
    : error.status === 404 ? "This HALO or page is no longer available for this account. Reload My HALO."
      : "We could not finish that request. Your entries are still here. Reload saved data before trying again.");
}
async function api(path, method = "GET", body = undefined, extra = {}, token = state.token, epoch = state.epoch) {
  const controller = new AbortController(); requests.add(controller);
  const timeout = setTimeout(() => controller.abort(), 65000);
  try {
    const response = await fetch((apiOrigin || "") + path, { method, signal: controller.signal,
      headers: { ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (epoch !== state.epoch) throw new DOMException("Account changed", "AbortError");
    let result = null;
    if (response.status !== 204) { try { result = await response.json(); } catch { throw { status: 503, code: "invalid_response" }; } }
    if (epoch !== state.epoch) throw new DOMException("Account changed", "AbortError");
    if (!response.ok) {
      if (response.status === 401 && !state.connecting) lock();
      throw { status: response.status, code: result?.error || "request_failed" };
    }
    if (method !== "GET") {
      const feature = path === "/halos/generate" ? "initial_generation" : path.endsWith("/activate") ? "activation" : path.endsWith("/checkins") ? "day_report" : path.endsWith("/observations") ? "evidence" : path.endsWith("/checks") ? "milestone_check" : path.includes("/repeat") ? "weekly_repeat" : path.endsWith("/identity") ? "identity_edit" : "saved_change";
      metric("halo_preview_feature_used", {feature});
    }
    return result;
  } catch (error) {
    if (epoch !== state.epoch) throw new DOMException("Account changed", "AbortError");
    if (error.status) throw error;
    throw { status: 0, code: "network_uncertain" };
  } finally { clearTimeout(timeout); requests.delete(controller); }
}
async function run(operation, { building = false, readRetry = null } = {}) {
  if (state.busy) return;
  const epoch = state.epoch; busy(true, building); notice("");
  try { await operation(); }
  catch (error) {
    if (epoch !== state.epoch || error.name === "AbortError") return;
    if (state.editor && $("editor").open) {
      $("edit-error").textContent = failure(error);
      $("edit-reload").hidden = !state.plan;
    } else { if (state.view === "create") render(); notice(failure(error), readRetry); }
  } finally { if (epoch === state.epoch) busy(false); }
}
function owned(plan, id) {
  if (!plan || plan.owner_id !== state.owner || (id && plan.id !== id)) throw { status: 503, code: "invalid_response" };
  return plan;
}
async function lists() {
  const epoch = state.epoch;
  const [policy, all, active] = await Promise.all([api("/me/entitlements"), api("/my-halos"), api("/my-halos?active_only=true")]);
  if (epoch !== state.epoch) throw new DOMException("Account changed", "AbortError");
  if (policy.enforcement_ready !== true || !policy.limits || !policy.capabilities || !Array.isArray(all.halos) || !Array.isArray(active.halos)
      || [...all.halos, ...active.halos].some((h) => h.owner_id !== state.owner)) throw { status: 503, code: "FEATURE_UNAVAILABLE" };
  Object.assign(state, { policy, items: all.halos, cursor: all.next_cursor, active: active.halos });
}
async function openPlan(id, initiativeId = null, preferredView = null) {
  const epoch = state.epoch;
  const [plan, history, initiative] = await Promise.all([api("/halos/" + id), api("/halos/" + id + "/history"),
    initiativeId ? api("/initiatives/" + initiativeId) : Promise.resolve(null)]);
  if (epoch !== state.epoch) throw new DOMException("Account changed", "AbortError");
  owned(plan, id);
  if (!Array.isArray(history.revisions) || !history.revisions.length
      || history.revisions.some((p) => p.owner_id !== state.owner || p.id !== id)
      || (initiative && initiative.owner_id !== state.owner)) throw { status: 503, code: "invalid_response" };
  if (state.plan?.id !== id) stopTimer();
  Object.assign(state, { plan, history: history.revisions, initiative, sample: false, repeat: null,
    view: preferredView || (plan.cycle_execution ? "today" : "review") });
  if (nativeHost) historyUrl(plan.id);
  render();
}
function historyUrl(id) { history.replaceState({}, "", previewUrl(nativePaths.today + "?halo=" + encodeURIComponent(id))); }
async function refreshAfterSave(plan, initiativeId = state.initiative?.id, view = state.view) {
  const epoch = state.epoch;
  owned(plan); state.plan = plan; closeEditor(); render();
  try { await lists(); await openPlan(plan.id, initiativeId, view); return epoch === state.epoch; }
  catch {
    if (epoch !== state.epoch) return false;
    state.policy = null; render(); notice("Saved. Account information could not refresh. Reload saved data before continuing.", reloadCurrent); return false;
  }
}
async function reloadCurrent() {
  await lists();
  if (state.plan && !state.sample) {
    try { await openPlan(state.plan.id, state.initiative?.id, state.view); }
    catch (error) {
      if (error.status !== 404) throw error;
      Object.assign(state, { plan: null, initiative: null, history: [], repeat: null, view: "halos" }); render();
    }
  }
  else render();
}
async function connect(interactive = true) {
  if (!auth.available || state.connecting) return;
  const oldOwner = state.owner, oldPlan = state.plan?.id, oldInit = state.initiative?.id, oldView = state.view, oldRepeat = state.repeat;
  if (state.editor && $("editor").open) state.editor.values = formValues();
  abort(); closeEditor(false); state.connecting = true; state.locked = true; state.localSignedOut = false;
  const epoch = state.epoch; busy(true); render(); notice("Connecting your account…");
  try {
    if (interactive) await auth.signIn();
    const token = await auth.getAccessToken();
    if (epoch !== state.epoch) return;
    if (!token && !interactive && !oldOwner) {
      state.locked = false; state.token = null; render(); notice(""); return;
    }
    if (!token) throw { status: 401, code: "not_signed_in" };
    const session = await api("/session", "GET", undefined, {}, token, epoch);
    if (!session || typeof session.owner_id !== "string") throw { status: 503, code: "invalid_response" };
    if (oldOwner && oldOwner !== session.owner_id) {
      stopTimer(); Object.assign(state, { plan: null, initiative: null, history: [], editor: null,
        items: [], active: [], entry: "", horizon: "7", attempt: null, receipt: null, repeat: null, identityDraft: null, interpretationAttempt: null, interpretationProposal: null, outputLanguage: "", sample: false });
    }
    state.owner = session.owner_id; state.token = token; state.locked = false;
    await lists();
    if (oldOwner === state.owner && oldPlan && !state.sample) await openPlan(oldPlan, oldInit, oldView);
    else if (requestedPlan()) {
      const id = requestedPlan(), item = [...state.items,...state.active].find((h) => h.id === id);
      await openPlan(id, item?.initiative_id, "home");
    }
    else if (nativeHost && ["halos","plus"].includes(oldView)) state.view = oldView;
    else if (state.entry.trim()) state.view = "create";
    else if (state.active.length === 1 && (state.active[0].horizon_days === 7 || state.policy?.capabilities.custom_horizon)) {
      const item = state.active[0]; await openPlan(item.id, item.initiative_id, "home");
    } else if (state.items.length) {
      const item = state.active[0] || state.items[0]; await openPlan(item.id, item.initiative_id, "home");
    } else state.view = "create";
    if (menu1607 && oldView === "practice" && !state.entry.trim()) state.view = "practice";
    render(); notice("Account connected");
    if (oldOwner === state.owner && oldView === "repeat" && oldRepeat) { state.repeat = oldRepeat; state.view = "repeat"; render(); }
    if (state.editor && oldOwner === state.owner) displayEditor();
  } catch (error) {
    if (epoch !== state.epoch) return;
    if (!oldOwner && !state.owner) state.locked = false;
    if (error.name === "AbortError" && !oldOwner) { render(); notice(""); return; }
    if (state.owner && !state.locked) { state.policy = null; state.view = "account"; render(); notice(failure(error), reloadCurrent); }
    else { render(); notice("We could not connect. Try connecting your account again."); }
  } finally { if (epoch === state.epoch) { state.connecting = false; busy(false); renderHeader(); } }
}
function editable() {
  return !!(state.owner && state.token && state.policy && !state.locked && state.plan && !state.sample
    && (!state.plan.cycle_execution || state.initiative)
    && (state.plan.horizon_days === 7 || state.policy.capabilities.custom_horizon) && (!state.initiative || (state.initiative.status === "active"
      && state.initiative.current_plan_id === state.plan.id))
    && !(state.policy?.requires_initiative_selection && state.initiative));
}
function epochContext() { return { id: state.plan.id, revision: state.plan.revision, owner: state.owner }; }
function formValues() {
  const values = {};
  for (const input of $("edit-fields").querySelectorAll("[name]")) values[input.name] = input.type === "checkbox" ? input.checked : input.value;
  return values;
}
function showEditor(spec) { state.editor = spec; displayEditor(); }
function displayEditor() {
  const spec = state.editor; if (!spec || state.locked) return;
  $("editor-title").textContent = spec.title; $("editor-description").textContent = spec.description || "";
  $("edit-error").textContent = ""; $("edit-reload").hidden = true; $("edit-save").textContent = spec.save || "Save";
  $("edit-fields").replaceChildren();
  for (const field of spec.fields) {
    const value = spec.values?.[field.name] ?? field.value ?? "";
    const wrap = node("div", null, "field"), label = node("label", field.label);
    const input = node(field.type === "select" ? "select" : field.type === "textarea" ? "textarea" : "input");
    input.id = "field-" + field.name; input.name = field.name; label.htmlFor = input.id;
    input.dataset.baseDisabled = "false";
    if (field.type === "select") for (const [key, text] of field.options) { const option = node("option", text); option.value = key; input.append(option); }
    else if (input.tagName === "INPUT") input.type = field.type || "text";
    input.required = field.required === true;
    if (field.type === "checkbox") { input.checked = value === true; label.className = "choice"; label.prepend(input); wrap.append(label); }
    else {
      input.value = String(value); if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      if (["text", "textarea", undefined].includes(field.type)) input.maxLength = 4000;
      wrap.append(label, input);
    }
    $("edit-fields").append(wrap);
  }
  if (!$("editor").open) $("editor").showModal();
}
function editFields(title, path, fields, build, save = "Save changes", description = "") {
  const context = epochContext();
  showEditor({ title, fields, save, description, async submit(values) {
    if (context.owner !== state.owner) return;
    const epoch = state.epoch;
    const result = await api("/halos/" + context.id + path, path.startsWith("/identity") || path === "/intention" || path === "/blueprint-story" || /^\/actions\/[^/]+$/.test(path) || /^\/conditions\/[^/]+$/.test(path) ? "PATCH" : "POST",
      { expected_revision: context.revision, ...build(values) });
    if (epoch !== state.epoch) return;
    if (await refreshAfterSave(result) && state.policy) notice("Your report or changes are saved.");
  } });
}
function editIdentity() {
  const card = state.plan.identity_card;
  editFields("Edit Identity Card", "/identity", [
    { name: "statement", label: "The conduct you choose", type: "textarea", value: card.statement, required: true },
    { name: "question", label: "Your daily question", type: "textarea", value: card.question, required: true },
    { name: "conduct_criterion", label: "What would demonstrate that conduct?", type: "textarea", value: card.conduct_criterion, required: true },
  ], (v) => ({ changes: v }));
}
const storyLabels = { domain: "The change you are practicing", why_hard: "Why it can be hard", if_true: "What would need to be true?",
  ordinary_day: "An ordinary day", comes_with: "What comes with this practice", when_you_slip: "When you slip", signs_working: "Signs to look for",
  example: "An example", assistant_prompt: "A prompt for reflection" };
function editBlueprint() {
  const story = state.plan.blueprint.story || {};
  editFields("Edit Blueprint", "/blueprint-story", Object.entries(storyLabels).map(([key, label]) => ({ name: key, label, type: "textarea", value: story[key] || "", required: !!story[key] })),
    (v) => ({ changes: Object.fromEntries(Object.entries(v).filter(([key, value]) => value.trim() && value !== story[key])) }));
}
function editMilestone(condition) {
  editFields("Edit Milestone", "/conditions/" + condition.id, [
    { name: "title", label: "Milestone", type: "textarea", value: condition.title, required: true },
    { name: "acceptance_criterion", label: "What observation could test it?", type: "textarea", value: condition.acceptance_criterion, required: true },
  ], (v) => ({ changes: v }));
}
function editAction(action) {
  editFields("Edit action", "/actions/" + action.id, [
    { name: "description", label: "Proposed action", type: "textarea", value: action.description, required: true },
    { name: "done_criterion", label: "What would count as done?", type: "textarea", value: action.done_criterion, required: true },
    { name: "duration_minutes", label: "Estimated minutes", type: "number", min: 1, max: 1440, value: action.duration_minutes, required: true },
  ], (v) => ({ changes: { ...v, duration_minutes: Number(v.duration_minutes) } }));
}
function recordEvidence(action) {
  editFields("Record action evidence", "/actions/" + action.id + "/observations", [
    { name: "description", label: "What did you actually do or observe?", type: "textarea", required: true },
    { name: "confirm_completion", label: "Also mark this action complete based on this observation.", type: "checkbox", value: false },
    { name: "confirm_report", label: "I confirm this is my report; a timer or AI suggestion is not evidence.", type: "checkbox", required: true },
  ], (v) => ({ description: v.description, confirm_completion: v.confirm_completion }), "Save evidence");
}
function checkMilestone(condition) {
  editFields("Check Milestone", "/conditions/" + condition.id + "/checks", [
    { name: "description", label: "What did you actually observe?", type: "textarea", required: true },
    { name: "assessment", label: "Your assessment", type: "select", value: "unknown", options: [["unknown", "Still uncertain"], ["unsatisfied", "Not met"], ["satisfied", "Met · my report"]] },
    { name: "confirm_report", label: "I confirm this is my own observation, not generated verification.", type: "checkbox", required: true },
  ], (v) => ({ description: v.description, assessment: v.assessment }), "Save assessment");
}
function practiceDay() {
  if (state.sample) return 1;
  const execution = state.plan?.cycle_execution;
  if (!execution) return 1;
  const base = Math.max(Date.parse(state.plan.start_date + "T00:00:00Z"), Date.parse(execution.started_at));
  return Math.max(1, Math.min(7, Math.floor((Date.now() - base) / DAY) + 1));
}
function recordDay(day = practiceDay()) {
  editFields("Record your day", "/cycle/checkins", [
    { name: "day", label: "Practice day", type: "select", value: String(day), options: Array.from({ length: practiceDay() }, (_, i) => [String(i + 1), "Day " + (i + 1)]) },
    { name: "practice", label: "Did you practice the first small step?", type: "select", value: "", required: true,
      options: [["", "Choose your report"], ["yes", "I practiced"], ["no", "I did not practice"]] },
    { name: "reflection", label: "What did you notice? Include no practice or no evidence when that is what happened.", type: "textarea", required: true },
    { name: "obstacle", label: "What got in the way? (optional)", type: "textarea" },
    { name: "confirm_checkin", label: "I confirm this is my report. It does not complete an action.", type: "checkbox", required: true },
  ], (v) => ({ day_offset: Number(v.day), practice_done: v.practice === "yes", reflection: v.reflection,
    obstacle: v.obstacle.trim() || null, confirm_checkin: true }), "Save day report");
}
function reviewWeek() {
  editFields("Review your week", "/cycle/review", [
    { name: "decision", label: "Your decision", type: "select", value: "keep", options: [["keep", "Keep practicing"], ["refine", "Refine before another week"], ["retire", "Retire and archive this HALO"]] },
    { name: "reflection", label: "What did your actual evidence tell you? Why this decision?", type: "textarea", required: true },
    { name: "confirm_review", label: "I confirm this review. Retire archives the HALO and preserves its history.", type: "checkbox", required: true },
  ], (v) => ({ decision: v.decision, reflection: v.reflection, selected_action_ids: [], first_60_seconds: null, confirm_review: true }), "Confirm weekly review",
  "Keep or Refine needs a report for each of the seven days, including missed days. No action is completed by reviewing.");
}

function identityCard() {
  const card = state.plan.identity_card, el = panel(null);
  el.classList.add("identity");
  el.append(row(node("p", "Identity Card", "eyebrow"), badge(state.sample ? "Example" : "Chosen conduct")),
    node("h2", card.heading), editable() ? identityWriting(card) : node("p", card.statement, "identity-statement"),
    node("p", card.question, "identity-question"),
    node("p", card.conduct_criterion, "meta"),
    button("Edit Identity Card", editIdentity, { disabled: !editable(), cls: "subtle" }));
  const record = state.plan.intention_record;
  const original = panel(null); original.classList.add("original-intention");
  original.append(node("h3", "Your original intention"), node("p", record?.original_intention ?? state.plan.intention, "original-words"),
    node("p", record?.original_capture === "verbatim" ? "Preserved exactly as entered." : "Saved original. Exact historical input and language may be unavailable.", "meta"));
  if (record && record.current_intention !== record.original_intention) original.append(node("h3", "Your current intention"), node("p", record.current_intention, "original-words"));
  if (record) original.append(node("p", record.input_language === "und" ? "Original language not detected." : "Original language: " + record.input_language + " · AI inference", "meta"));
  if (!state.sample) original.append(row(button("Clarify my intention", editIntention, {disabled:!editable() || !state.policy?.capabilities.intention_translation,cls:"subtle"}),
    button("Regenerate interpretation", proposeInterpretation, {disabled:!editable() || !state.policy?.capabilities.intention_translation,cls:"subtle"})));
  if (streamlined) { const details = node("details", null, "identity-history"); details.append(node("summary", "Intention and history"), original); el.append(details); }
  else el.append(original);
  return el;
}
function editIntention() {
  editFields("Clarify your intention", "/intention", [
    {name:"current_intention", label:"Your current intention", type:"textarea", value:state.plan.intention_record?.current_intention ?? state.plan.intention, required:true}
  ], (values) => ({changes:values}), "Save clarification", "Your original words stay intact. This creates a new version; no plan is rebuilt automatically.");
}
function identityWriting(card) {
  const form = node("form", null, "identity-writing-form");
  const context = epochContext();
  const draft = state.identityDraft?.owner === context.owner && state.identityDraft?.id === context.id ? state.identityDraft : null;
  const label = node("label", "Write your identity", "identity-writing-label"); label.htmlFor = "identity-writing";
  const input = node("textarea", null, "identity-statement identity-writing"); input.id = "identity-writing";
  input.required = true; input.rows = 4; input.value = draft?.statement ?? card.statement;
  input.setAttribute("aria-describedby", "identity-writing-help");
  const help = node("p", "Save wording only, or translate this entry into a new Identity Card, Blueprint, Milestones and Timeline.", "identity-writing-help"); help.id = "identity-writing-help";
  const save = node("button", "Save Identity Card"); save.type = "submit";
  const cancel = button("Cancel card edit", () => { state.identityDraft = null; render(); });
  const build = button("Translate and build plan", () => proposeInterpretation({entry:input.value}), {primary:true,disabled:!state.policy?.capabilities.intention_translation});
  const update = () => {
    const changed = input.value !== card.statement;
    save.disabled = !changed || !input.value.trim(); save.dataset.baseDisabled = String(save.disabled);
    cancel.disabled = !changed; cancel.dataset.baseDisabled = String(cancel.disabled);
    build.disabled = !input.value.trim() || !state.policy?.capabilities.intention_translation; build.dataset.baseDisabled = String(build.disabled);
  };
  input.addEventListener("input", () => {
    state.identityDraft = input.value === card.statement ? null : { ...(draft || context), statement: input.value }; update();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const change = state.identityDraft;
    if (!editable() || !change || change.owner !== state.owner || change.id !== state.plan.id || !input.value.trim()) return;
    run(async () => {
      const epoch = state.epoch;
      const result = await api("/halos/" + change.id + "/identity", "PATCH", {
        expected_revision: change.revision, changes: {statement: change.statement.trim()}
      });
      if (epoch !== state.epoch) return;
      owned(result, change.id); state.identityDraft = null;
      if (await refreshAfterSave(result)) notice("Your Identity Card is saved.");
    });
  });
  update(); form.append(label, input, help, row(build, save, cancel));
  if (!state.policy?.capabilities.intention_translation) form.append(node("p", "Plan translation is temporarily unavailable. You can still save your wording.", "identity-writing-help"));
  return form;
}
function taskCard(action) {
  const el = node("div", null, "task");
  el.append(node("h3", action.description), node("p", `${action.duration_minutes} min estimate · ${action.status === "completed" ? "Completed · your confirmed report" : "Proposed"}`, "meta"));
  const milestoneNames = action.condition_ids.map((id) => state.plan.wembt.conditions.find((c) => c.id === id)?.title).filter(Boolean);
  el.append(node("p", "Supports: " + milestoneNames.join(" · "), "meta"));
  const why = node("details"), summary = node("summary", "What would count as done?"); why.append(summary, node("p", action.done_criterion, "secondary")); el.append(why);
  el.append(actions(
    button("Edit action", () => editAction(action), { disabled: !editable() || action.status !== "planned", cls: "subtle" }),
    button("Record evidence", () => recordEvidence(action), { disabled: !editable() || action.status !== "planned", cls: "subtle" }),
  ));
  if (action.status === "completed") el.append(button("Reopen action", () => editFields("Reopen action", "/actions/" + action.id + "/reopen", [
    { name: "reason", label: "Why does this action need more work?", type: "textarea", required: true },
    { name: "confirm_reopen", label: "I confirm reopening. Prior evidence remains in history.", type: "checkbox", required: true },
  ], (v) => ({ reason: v.reason, confirm_reopen: true }), "Reopen action"), { disabled: !editable(), cls: "subtle" }));
  return el;
}
function milestonesCard() {
  const conditions = state.plan.wembt.conditions;
  const el = panel("Milestones", node("p", `${conditions.filter((c) => c.status === "satisfied").length} of ${conditions.length} reported met. Conditions are separate from completed actions.`, "secondary"));
  for (const c of conditions) {
    const item = node("article", null, streamlined ? "milestone my-halo-list-card" : "milestone");
    const label = c.status === "unknown" ? "Not checked" : c.status === "satisfied" ? "Met" : "Not met";
    item.append(node("h3", c.title), badge(label + (c.status === "unknown" ? "" : c.verification_state === "verified" ? " · observation recorded" : " · user reported")),
      node("p", c.acceptance_criterion, "secondary"));
    if (c.gap) item.append(node("p", "Open question: " + c.gap.description, "meta"));
    if (c.evidence_ids.some((id) => carriedEvidenceIds().has(id))) item.append(node("p", "Includes evidence from an earlier week. Check its dates; it is not new verification.", "meta"));
    const sources = node("details"); sources.append(node("summary", "Basis to review"));
    for (const id of c.source_refs) {
      const source = state.plan.sources.find((s) => s.id === id);
      if (source) sources.append(node("p", `${source.title} · ${source.kind === "ai_inferred" ? "AI inference; needs review" : source.kind === "user_confirmed" ? "User report; not independent verification" : source.kind.replaceAll("_", " ")}`, "meta"));
    }
    item.append(sources, actions(button("Edit Milestone", () => editMilestone(c), { disabled: !editable(), cls: "subtle" }),
      button("Check Milestone", () => checkMilestone(c), { disabled: !editable(), cls: "subtle" })));
    el.append(item);
  }
  if (streamlined) el.classList.add("streamlined-details", "milestone-collection");
  return el;
}
function blueprintCard() {
  const el = panel("Blueprint", node("p", "Your written guide to the conduct and conditions you are practicing.", "secondary"),
    button("Edit Blueprint", editBlueprint, { disabled: !editable(), cls: "subtle" }));
  const story = state.plan.blueprint.story;
  if (!story) el.append(node("p", "No written Blueprint has been saved. You can write your version in the editor.", "secondary"));
  else el.append(bookBlueprint(state.plan));
  if (state.plan.outcome.assumptions?.length) {
    const assumptions = node("details"); assumptions.append(node("summary", "Assumptions to review"));
    for (const value of state.plan.outcome.assumptions) assumptions.append(node("p", value, "secondary"));
    el.append(assumptions);
  }
  return el;
}
function bookBlueprint(plan) {
  const story = plan.blueprint.story || {}, page = node("article", null, "book-blueprint");
  page.setAttribute("aria-label", "Book-format Blueprint");
  const header = node("header", null, "book-blueprint-header");
  header.append(node("p", "BLUEPRINT · YOUR PRACTICE", "book-kicker"), node("h3", story.domain || "Your Blueprint", "book-title"));
  const sides = node("div", null, "book-sides"), one = node("section", null, "book-side-one"), two = node("section", null, "book-side-two");
  one.append(node("h4", "Side one"), node("p", "It already happened.", "book-prompt"), node("p", plan.identity_card.statement, "preserve"));
  two.append(node("h4", "Side two"), node("p", "Ask, in the moment:", "book-prompt"), node("p", plan.identity_card.question, "preserve"));
  sides.append(one, two);
  const labels = { why_hard: "Why it’s hard", if_true: "If this is true", ordinary_day: "An ordinary day", comes_with: "What comes with it", when_you_slip: "When you slip", signs_working: "Signs it’s working", example: "Example", assistant_prompt: "Try it with an assistant" };
  const body = node("div", null, "book-blueprint-body");
  for (const keys of [["why_hard", "if_true", "ordinary_day"], ["comes_with", "when_you_slip", "signs_working"]]) {
    const column = node("div", null, "book-column");
    for (const key of keys) if (story[key]) { const section = node("section"); section.append(node("h4", labels[key]), node("p", story[key], "preserve")); column.append(section); }
    body.append(column);
  }
  page.append(header, sides, body);
  const examples = node("div", null, "book-examples");
  for (const key of ["example", "assistant_prompt"]) if (story[key]) { const section = node("section"); section.append(node("h4", labels[key]), node("p", story[key], "preserve")); examples.append(section); }
  page.append(examples);
  return page;
}
function scheduledDays(plan) {
  const days = new Map(plan.blueprint.first_cycle.days.map(day => [day.day_offset, {day_offset:day.day_offset, action_ids:[...day.action_ids]}]));
  for (const action of plan.blueprint.actions) {
    if (!days.has(action.day_offset)) days.set(action.day_offset, {day_offset:action.day_offset,action_ids:[]});
    const day = days.get(action.day_offset);
    if (!day.action_ids.includes(action.id)) day.action_ids.push(action.id);
  }
  return [...days.values()].sort((a,b) => a.day_offset - b.day_offset);
}
function timelineCard() {
  const list = node("ol", null, streamlined ? "timeline timeline-collection" : "timeline");
  for (const day of scheduledDays(state.plan)) {
    const item = node("li", null, streamlined ? "my-halo-list-card timeline-day" : undefined); item.append(node("h3", "Day " + day.day_offset));
    for (const id of day.action_ids) { const action = state.plan.blueprint.actions.find((a) => a.id === id); if (action) item.append(taskCard(action)); }
    list.append(item);
  }
  const el = panel("Timeline", node("p", "Your first seven-day cycle and later scheduled steps across a " + state.plan.horizon_days + "-day horizon. Scheduled days do not prove completion.", "secondary"), list);
  if (streamlined) el.classList.add("streamlined-details");
  return el;
}
function carriedEvidenceIds() {
  const run = state.initiative?.runs?.find((r) => r.plan_id === state.plan.id);
  return new Set(run?.sequence > 1 ? (state.history[0]?.evidence || []).map((e) => e.id) : []);
}
function evidenceCard() {
  const el = panel("Evidence", node("p", "Your actual reports, with their saved timestamps. Practice and elapsed time do not complete actions.", "secondary"));
  const carried = carriedEvidenceIds();
  if (!state.plan.evidence.length) el.append(node("p", "No action or Milestone evidence has been recorded yet.", "secondary"));
  for (const report of [...state.plan.evidence].reverse()) {
    const item = node("article", null, "report");
    item.append(node("p", report.description, "preserve"), node("p", `${report.kind.replaceAll("_", " ")} · ${new Date(report.recorded_at).toLocaleString()}${carried.has(report.id) ? " · Carried from an earlier week; not rechecked" : ""}`, "meta"));
    item.append(button("Correct evidence", () => editFields("Correct evidence", "/evidence/" + report.id + "/correct", [
      { name: "description", label: "Your correction (the original record stays in history)", type: "textarea", required: true },
      { name: "confirm_correction", label: "I confirm this correction.", type: "checkbox", required: true },
    ], (v) => ({ description: v.description, confirm_correction: true }), "Save correction"), { disabled: !editable(), cls: "subtle" }));
    el.append(item);
  }
  const logs = state.plan.cycle_execution?.daily_logs || [];
  if (logs.length) {
    el.append(node("h3", "Practice reports (not action evidence)"));
    for (const log of [...logs].reverse()) el.append(node("p", `Day ${log.day_offset}: ${log.practice_done ? "Practiced" : "Did not practice"} · ${log.reflection}${log.obstacle ? " · Obstacle: " + log.obstacle : ""}`, "secondary preserve"));
  }
  return el;
}
function renderTimer() {
  const el = panel("Your first 60 seconds", node("p", state.plan.blueprint.first_cycle.first_60_seconds));
  const clock = node("p", timer.plan === state.plan.id ? String(timer.remaining).padStart(2, "0") : "60", "timer-number");
  clock.id = "timer-number"; clock.setAttribute("role", "timer"); clock.setAttribute("aria-label", "Seconds remaining");
  const control = button(timer.deadline ? "Pause timer" : timer.remaining < 60 && timer.remaining > 0 ? "Resume timer" : "Start 60-second timer", toggleTimer,
    { disabled: !editable() || !state.plan.cycle_execution || !!state.plan.cycle_execution.closure }); control.id = "timer-control";
  el.append(clock, node("p", "An optional start. Finishing this timer never records practice or evidence.", "meta"), control);
  return el;
}
function tickTimer() {
  if (!timer.deadline) return;
  timer.remaining = Math.max(0, Math.ceil((timer.deadline - Date.now()) / 1000));
  if ($("timer-number") && timer.plan === state.plan?.id) $("timer-number").textContent = String(timer.remaining).padStart(2, "0");
  if (!timer.remaining) {
    clearInterval(timer.interval); timer.interval = null; timer.deadline = null;
    if ($("timer-control")) $("timer-control").textContent = "Start 60-second timer";
    notice("The timer finished. Nothing was marked complete. Record only what you actually did.");
  }
}
function toggleTimer() {
  if (!editable()) return;
  if (timer.plan !== state.plan.id) { stopTimer(); timer.plan = state.plan.id; }
  if (timer.deadline) { tickTimer(); clearInterval(timer.interval); timer.interval = null; timer.deadline = null; }
  else { if (!timer.remaining) timer.remaining = 60; timer.deadline = Date.now() + timer.remaining * 1000; timer.interval = setInterval(tickTimer, 250); }
  render();
}
function cycleContext() {
  const execution = state.plan?.cycle_execution;
  if (!execution) return node("p", "Not started. Your seven-day tracker begins on Day 1 only when you choose Start my HALO.", "cycle-context meta");
  const started = new Date(execution.started_at).toLocaleDateString(undefined, {year:"numeric",month:"short",day:"numeric"});
  return node("p", "This cycle started " + started + ". Day " + practiceDay() + " of 7 reflects elapsed time; opening the card or running the timer does not start or advance it. Missing days can still be reported.", "cycle-context meta");
}
function dayStrip() {
  const strip = node("div", null, "seven-days"), execution = state.plan.cycle_execution;
  for (let day = 1; day <= 7; day++) {
    const ids = state.plan.blueprint.first_cycle.days.find((d) => d.day_offset === day)?.action_ids || [];
    const evidence = state.plan.blueprint.actions.some((a) => ids.includes(a.id) && a.evidence_ids.length);
    const log = execution?.daily_logs.filter((r) => r.day_offset === day).at(-1);
    const label = evidence ? "Recorded" : day > practiceDay() && !log ? "Future" : log && !log.practice_done ? "No practice" : "No evidence";
    const control = button("", () => recordDay(day), { disabled: !editable() || !execution || !!execution.closure || day > practiceDay() });
    control.append(node("strong", "Day " + day), node("span", label)); control.setAttribute("aria-label", `Day ${day} · ${label}`);
    control.dataset.today = String(day === practiceDay()); strip.append(control);
  }
  return strip;
}
function startPlan() {
  const plan = state.plan;
  run(async () => {
    const epoch = state.epoch;
    const result = await api("/initiatives", "POST", { plan_id: plan.id, expected_revision: plan.revision, confirm_start: true });
    if (epoch !== state.epoch) return;
    state.initiative = result;
    if (await refreshAfterSave(owned(result.current_plan), result.id, "today") && state.policy) notice("Your HALO has started. No action or Milestone is marked complete.");
  });
}
function canStart() {
  return state.owner && state.policy && !state.locked && !state.sample && (state.plan.horizon_days === 7 || state.policy.capabilities.custom_horizon) && (!state.initiative || state.initiative.status === "active")
    && (!state.initiative || Date.now() >= Date.parse(state.plan.start_date + "T00:00:00Z"));
}
function renderPlan() {
  const plan = state.plan, execution = plan.cycle_execution, closure = execution?.closure;
  if (menu1607 && state.view === "home") return myHaloOverview();
  const title = state.view === "home" ? "My HALO" : state.view === "review" ? "Review your HALO" : state.initiative?.status === "archived" ? "Your saved HALO" : streamlined ? "1·60·7" : "Today";
  const el = stack(node("p", state.sample ? "READ-ONLY EXAMPLE · 1 · 60 · 7" : "ONE IDENTITY · A SMALL START · SEVEN DAYS", "eyebrow"), node("h1", title));
  if (streamlined && state.view === "today") {
    const stages = row(); stages.classList.add("practice-stages"); stages.setAttribute("aria-label", "1·60·7 steps");
    for (const [key, label] of [["card", "1 Card"], ["proof", "60 Seconds"], ["week", "7 Days"]]) {
      const control = button(label, () => { practiceStage = key; render(); }); control.setAttribute("aria-pressed", String(practiceStage === key)); stages.append(control);
    }
    el.append(stages);
    if (practiceStage === "card") { el.append(identityCard(), button("Continue to 60 seconds", () => { practiceStage = "proof"; render(); }, {primary:true})); return el; }
    if (practiceStage === "proof") {
      el.append(renderTimer());
      if (!execution && !state.sample) el.append(node("p", "Review and start this HALO before using the timer. Starting does not mark any work complete.", "secondary"), button("Review and start this HALO", () => { state.view = "review"; render(); }));
      el.append(button("View seven days", () => { practiceStage = "week"; render(); })); return el;
    }
  }
  el.append(node("p", "My 1·60·7 Overview", "secondary"), identityCard());
  if (streamlined && state.view === "home") {
    el.classList.add("streamlined-overview");
    el.append(row(button("All HALOs", () => { state.view = "halos"; render(); }), button("Start today’s 60 seconds", () => { practiceStage = "proof"; state.view = "today"; render(); }, {primary:true})), dayStrip());
    const milestones = panel("Milestones");
    for (const condition of plan.wembt.conditions) milestones.append(node("p", `${condition.status === "satisfied" ? "Reported met" : condition.status === "unsatisfied" ? "Reported not met" : "Not yet checked"} · ${condition.title}`));
    const openDetails = (tab) => { state.tab = tab; practiceStage = "week"; state.view = "today"; render(); };
    milestones.append(button("View Milestones", () => openDetails("milestones"))); el.append(milestones);
    el.append(row(button("My Blueprint", () => openDetails("blueprint")), button("Timeline", () => openDetails("timeline")), button("Evidence", () => openDetails("evidence")), button("17 Blueprints", () => {state.view = "library"; render();})));
    if (execution && !closure) el.append(button("Record your day", recordDay, {disabled:!editable()}));
    el.append(button("Review plan and history", () => { state.view = "review"; render(); }));
    return el;
  }
  if (state.sample) el.append(panel(null, node("p", "This is a synthetic example, not your saved work or an official book Blueprint."), button("Create my own HALO", showCreate, { primary: true })));
  else if (!editable()) el.append(panel(null, node("p", "This view is read-only. Your original reports and history remain available.", "secondary")));
  if (!state.sample && (!execution || (!state.initiative && !closure && (plan.horizon_days === 7 || state.policy?.capabilities.custom_horizon)))) {
    const next = !!state.initiative;
    const caption = !state.initiative && execution ? "Choose this weekly HALO" : next ? "Start this week" : "Start my HALO";
    el.append(panel(null, node("p", next ? "Review these proposed steps before starting the next week. Earlier evidence is historical, not new progress." : "Review your three editable objects. Starting does not claim that work has been done.", "secondary"),
      button(caption, startPlan, { primary: true, disabled: !canStart() }),
      ...(next && !canStart() ? [node("p", "This practice window starts " + plan.start_date + ".", "meta")] : [])));
  }
  if (["review", "home"].includes(state.view) && !(streamlined && state.view === "home")) {
    const shortcuts = row(); shortcuts.classList.add("identity-links");
    for (const [label, id] of [["Blueprint", "home-blueprint"], ["Milestones", "home-milestones"], ["Timeline", "home-timeline"]]) {
      shortcuts.append(button("View " + label, () => { const target = document.getElementById(id); target?.scrollIntoView({block:"start"}); target?.focus({preventScroll:true}); }));
    }
    shortcuts.append(button("My 1·60·7 Overview", () => { state.view = "today"; render(); }));
    el.append(shortcuts);
    const first = plan.blueprint.actions.find((a) => a.id === plan.blueprint.first_cycle.days[0]?.action_ids[0]);
    if (first) el.append(panel("Your first small action", taskCard(first)));
    for (const [id, card] of [["home-blueprint", blueprintCard()], ["home-milestones", milestonesCard()], ["home-timeline", timelineCard()]]) { card.id = id; card.tabIndex = -1; el.append(card); }
  } else {
    el.append(dayStrip());
    const selected = plan.blueprint.first_cycle.days.find((d) => d.day_offset === practiceDay())?.action_ids || [];
    const nextActions = plan.blueprint.actions.filter((a) => selected.includes(a.id)).slice(0, 3);
    const nextCard = panel("Your next meaningful action");
    for (const action of nextActions) nextCard.append(taskCard(action));
    if (execution && !closure) nextCard.append(button("Record your day", () => recordDay(), { primary: true, disabled: !editable() }));
    const columns = node("div", null, "columns"); columns.append(nextCard, renderTimer()); el.append(columns);
    if (closure) el.append(panel("Week reviewed · " + closure.decision,
      node("p", closure.reflection, "preserve"),
      ...(closure.decision === "retire" ? [node("p", "This HALO is archived. Its evidence remains available."), button("Start another HALO", showCreate)]
        : [node("p", "Another week creates new proposed steps, with no new AI request or copied completion."), button("Plan another week", prepareRepeat, { primary: true, disabled: !editable() })])));
    else if (execution) {
      const reported = new Set(execution.daily_logs.map((r) => r.day_offset));
      el.append(panel("Your weekly review", node("p", `${reported.size} of 7 day reports saved. Missing days can be recorded honestly as no practice or no evidence.`, "secondary"),
        button("Review this week", reviewWeek, { disabled: !editable() || practiceDay() < 7 }),
        node("p", practiceDay() < 7 ? "Weekly review opens on Day 7. You can archive a HALO whenever you choose." : "Review the evidence you actually recorded, not just time elapsed.", "meta")));
    }
    const views = row(); views.setAttribute("role", "group"); views.setAttribute("aria-label", "HALO details");
    for (const [key, label] of [["milestones", "Milestones"], ["blueprint", "Blueprint"], ["timeline", "Timeline"], ["evidence", "Evidence"]]) {
      const choice = button(label, () => { state.tab = key; render(); }); choice.setAttribute("aria-pressed", String((state.tab || "milestones") === key)); views.append(choice);
    }
    el.append(views, ({ milestones: milestonesCard, blueprint: blueprintCard, timeline: timelineCard, evidence: evidenceCard }[state.tab || "milestones"])());
  }
  if (state.plan.alignment_review?.status === "review_suggested") {
    const assessment = state.plan.alignment_review;
    const impact = panel("Does the plan still fit?", node("p", "Your wording changed. Meaning has not been confirmed; these Milestones and unfinished actions may need review. Nothing has been regenerated."));
    const details = node("details"); details.append(node("summary", "Review potentially affected items"));
    for (const condition of plan.wembt.conditions.filter((c) => assessment.condition_ids.includes(c.id))) details.append(node("p", "Milestone: " + condition.title));
    for (const action of plan.blueprint.actions.filter((a) => assessment.action_ids.includes(a.id) && a.status === "planned")) details.append(node("p", "Action: " + action.description));
    impact.append(details, button("Review a new proposal", proposeInterpretation, {disabled:!editable() || !state.policy?.capabilities.intention_translation}), node("p", "Uses one initial AI request. A proposal is saved as a separate draft only after you choose it; this HALO and its history remain intact.", "meta"));
    el.append(impact);
  }
  if (state.history.length) {
    const versions = node("details"); versions.append(node("summary", "Identity and intention history"));
    for (const version of state.history) versions.append(panel("Revision " + version.revision,
      node("p", version.identity_card.statement, "preserve"), node("p", version.identity_card.question, "preserve"),
      node("p", "Current intention: " + (version.intention_record?.current_intention ?? version.intention), "preserve"),
      node("p", version.identity_card.user_edited_fields.length ? "User-edited identity" : version.generation.mode === "llm" ? "AI-proposed identity" : "Unreviewed template suggestion", "meta")));
    el.append(versions);
  }
  if (plan.intention_record?.source_plan_id) el.append(button("Open previous HALO and history", () => run(() => {
    const previous = state.items.find((item) => item.id === plan.intention_record.source_plan_id);
    return openPlan(plan.intention_record.source_plan_id, previous?.initiative_id, "home");
  })));
  if (state.initiative?.runs?.length > 1) {
    const history = panel("Your weeks");
    if (plan.id !== state.initiative.current_plan_id) history.append(node("p", "You are viewing an earlier week. Its saved history is read-only.", "secondary"));
    for (const week of state.initiative.runs) history.append(button(`Open week ${week.sequence}${week.plan_id === state.initiative.current_plan_id ? " · current" : ""}`, () => run(() => openPlan(week.plan_id, state.initiative.id))));
    el.append(history);
  }
  if (!state.sample) el.append(actions(button("Reload saved HALO", () => run(reloadCurrent, { readRetry: reloadCurrent })), button("Export this HALO and history", exportHalo),
    ...(state.initiative?.status === "active" ? [button("Archive HALO", archiveHalo)] : []),
    button(state.initiative ? "Delete entire HALO" : "Delete saved draft", deleteHalo, { cls: "danger" })));
  return el;
}

function proposeInterpretation(options = {}) {
  if (!editable() || state.busy || !state.policy?.capabilities.intention_translation) return;
  const entry = typeof options.entry === "string" ? options.entry : null;
  if (entry !== null && !entry.trim()) return;
  const intention = entry ?? state.plan.intention_record?.current_intention ?? state.plan.intention;
  const horizon = typeof options.horizon === "number" ? options.horizon : state.plan.horizon_days;
  if (state.interpretationProposal) {
    const attempt = state.interpretationAttempt?.body;
    if (attempt?.intention === intention && attempt.horizon_days === horizon && attempt.based_on_plan_id === state.plan.id && attempt.expected_revision === state.plan.revision) { state.view = "interpretation"; render(); return; }
    state.interpretationProposal = null; state.interpretationAttempt = null;
  }
  if (state.identityDraft && entry === null) { notice("Save or cancel your card edit before requesting an interpretation, or use Translate and build plan for this entry."); return; }
  run(async () => {
    const epoch = state.epoch;
    const body = {intention,
      horizon_days:horizon, based_on_plan_id:state.plan.id, expected_revision:state.plan.revision};
    if (!state.interpretationAttempt || JSON.stringify(state.interpretationAttempt.body) !== JSON.stringify(body)) state.interpretationAttempt = {body,key:crypto.randomUUID()};
    let result;
    try {
      result = await api("/halos/generate", "POST", body, {"Idempotency-Key":state.interpretationAttempt.key});
    } catch (error) {
      if (epoch !== state.epoch) return;
      if (error.status && !["generation_pending", "generation_recovery_required"].includes(error.code)) state.interpretationAttempt = null;
      throw error;
    }
    if (epoch !== state.epoch) return;
    owned(result.plan);
    if (result.plan.intention_record?.source_plan_id !== state.plan.id) throw {status:503,code:"invalid_response"};
    state.interpretationProposal = result; state.view = "interpretation"; render();
  }, {building:true});
}
function interpretationScreen() {
  const proposal = state.interpretationProposal, plan = proposal.plan;
  const el = stack(node("h1", "Review a proposed interpretation"),
    node("p", "This proposal has not replaced your saved HALO. Your previous wording, completed work and evidence stay in its history.", "secondary"),
    panel("Your original intention", node("p", plan.intention_record.original_intention, "original-words"), node("p", "Current intention: " + plan.intention_record.current_intention, "original-words")),
    panel("Proposed Identity Card", node("h2", plan.identity_card.heading), node("p", plan.identity_card.statement, "identity-statement"), node("p", plan.identity_card.question)));
  const conditions = panel("Proposed Milestones");
  if (streamlined) conditions.classList.add("streamlined-details", "milestone-collection");
  for (const c of plan.wembt.conditions) {
    const item = node("article", null, streamlined ? "milestone my-halo-list-card" : "milestone");
    item.append(node("h3", c.title), badge("Proposed · not checked"), node("p", c.acceptance_criterion,"secondary")); conditions.append(item);
  }
  el.append(conditions);
  const blueprint = panel("Proposed Blueprint", bookBlueprint(plan)); el.append(blueprint);
  const timeline = panel("Proposed Timeline"), proposedDays = node("ol", null, streamlined ? "timeline timeline-collection" : "timeline");
  if (streamlined) timeline.classList.add("streamlined-details");
  for (const day of scheduledDays(plan)) {
    const item = node("li", null, streamlined ? "my-halo-list-card timeline-day" : undefined); item.append(node("h3", "Day " + day.day_offset));
    for (const id of day.action_ids) { const action = plan.blueprint.actions.find(a => a.id === id); if (action) item.append(node("h3", action.description), node("p", action.duration_minutes + " min estimate · Proposed", "meta")); }
    proposedDays.append(item);
  }
  timeline.append(proposedDays); el.append(timeline);
  el.append(row(button("Save proposed HALO", () => run(async () => {
    const epoch = state.epoch;
    const saved = await api("/halos", "POST", {draft_receipt:proposal.draft_receipt});
    if (epoch !== state.epoch) return;
    owned(saved, plan.id); state.interpretationProposal = null; state.interpretationAttempt = null;
    if (state.identityDraft?.owner === state.owner && state.identityDraft?.id === plan.intention_record.source_plan_id) state.identityDraft = null;
    if (await refreshAfterSave(saved, null, "home")) notice("Your proposed HALO is saved separately. Your previous HALO and its evidence remain available. Review or edit, then choose when to start.");
  }), {primary:true}), button("Keep current HALO", () => { state.interpretationProposal = null; state.interpretationAttempt = null; state.view = "home"; render(); })));
  return el;
}
function showCreate() { state.view = "create"; if (nativeHost) history.pushState({}, "", previewUrl(nativePaths.today)); notice(""); render(); $("intention")?.focus(); }
function upgradePreview() {
  showEditor({ title: "A longer horizon · Plus preview", description: "Longer horizons need a manually granted Plus Preview invitation. Paid checkout is off. Your intention stays here; you can continue with a seven-day practice.",
    fields: [], save: "Keep 7 days", async submit() { state.horizon = "7"; closeEditor(); render(); } });
}
function createScreen() {
  const intro = node("div", null, "intro"); intro.append(node("p", "ONE IDENTITY. A SMALL START. SEVEN DAYS.", "eyebrow"),
    node("h1", "What do you want to start?"), node("p", "Choose something you want to practice. We’ll propose a starting point you can make your own.", "secondary"));
  const form = node("form", null, "create-form"); form.id = "create-form";
  const intentionLabel = node("label", "Your intention"); intentionLabel.htmlFor = "intention";
  const input = node("textarea"); input.id = "intention"; input.name = "intention"; input.maxLength = 4000; input.required = true;
  input.value = state.entry; input.placeholder = "e.g. Make time to write";
  input.addEventListener("input", () => { state.entry = input.value; });
  const durationLabel = node("label", "For how long?"); durationLabel.htmlFor = "horizon";
  const duration = node("select"); duration.id = "horizon"; duration.name = "horizon";
  for (const [value, label] of [["7", "7 days"], ["90", "90 days · Plus preview"], ["365", "1 year · Plus preview"]]) {
    const option = node("option", label); option.value = value; duration.append(option);
  }
  if (state.customDuration || !["7","90","365"].includes(state.horizon)) { const option = node("option", "Custom · " + state.horizon + " days"); option.value = state.horizon; duration.append(option); }
  const customOption = node("option", "Custom time period · Plus preview"); customOption.value = "custom"; duration.append(customOption);
  duration.value = state.horizon;
  const customLabel = node("label", "Custom time period (days)"); customLabel.htmlFor = "custom-horizon";
  const customInput = node("input"); customInput.id = "custom-horizon"; customInput.type = "number"; customInput.min = "1"; customInput.max = "3650"; customInput.step = "1"; customInput.required = true; customInput.value = state.horizon;
  const customFields = stack(customLabel, customInput); customFields.hidden = !state.customDuration && ["7","90","365"].includes(state.horizon);
  customInput.disabled = customFields.hidden; customInput.dataset.baseDisabled = String(customFields.hidden);
  customInput.addEventListener("input", () => { state.horizon = customInput.value; });
  duration.addEventListener("change", () => { state.customDuration = duration.value === "custom"; state.horizon = state.customDuration ? "30" : duration.value; render(); if (state.horizon !== "7" && !state.policy?.capabilities.custom_horizon) upgradePreview(); });
  const language = node("details"); language.append(node("summary", "Language preference · optional"));
  const languageLabel = node("label", "Output language code"); languageLabel.htmlFor = "output-language";
  const languageInput = node("input"); languageInput.id = "output-language"; languageInput.value = state.outputLanguage;
  languageInput.placeholder = "Leave blank to use the language of your words"; languageInput.maxLength = 35;
  languageInput.disabled = !state.policy?.capabilities.intention_translation;
  languageInput.dataset.baseDisabled = String(languageInput.disabled);
  languageInput.pattern = "[a-z]{2,3}(-[A-Za-z0-9]{2,8})*";
  languageInput.addEventListener("input", () => { state.outputLanguage = languageInput.value; });
  language.append(languageLabel, languageInput, node("p", "Examples: en, es, fr, pt-BR. Your original text stays in its original language.", "meta"));
  const submit = node("button", state.receipt ? "Recover saved preview" : "Create my HALO", "primary"); submit.type = "submit";
  submit.dataset.baseDisabled = String((state.horizon !== "7" && !state.policy?.capabilities.custom_horizon) || (!!state.owner && !state.policy) || (!state.owner && !auth.available));
  const quota = state.policy ? `${state.policy.usage.initial_requests_today} of ${state.policy.limits.initial_generation_requests_per_day} AI requests used today. Failed attempts may count.`
    : "Connect an account to create and save your private HALO.";
  form.append(stack(intentionLabel, input), stack(durationLabel, duration), customFields, language, submit, node("p", quota, "meta"));
  if (!auth.available) form.append(node("p", "Account connection is not available here. You can explore the read-only example.", "secondary"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); state.entry = input.value;
    if (!state.entry.trim() || (state.horizon !== "7" && !state.policy?.capabilities.custom_horizon)) return;
    if (!state.owner || state.locked) await connect();
    if (!state.owner || !state.token || !state.policy || !state.entry.trim()) return;
    if (state.receipt && state.attempt?.body.intention !== state.entry) {
      render(); notice("Recover the previous preview or discard it explicitly before generating a different intention."); return;
    }
    run(async () => {
      const epoch = state.epoch;
      const body = { intention: state.entry, horizon_days: Number(state.horizon), ...(state.outputLanguage && state.policy?.capabilities.intention_translation ? {output_language:state.outputLanguage} : {}) };
      if (!state.receipt) {
        if (!state.attempt || JSON.stringify(state.attempt.body) !== JSON.stringify(body)) state.attempt = { body, key: crypto.randomUUID() };
        try {
          const result = await api("/halos/generate", "POST", body, { "Idempotency-Key": state.attempt.key });
          if (epoch !== state.epoch) return;
          owned(result.plan); state.receipt = result.draft_receipt;
        } catch (error) {
          if (epoch !== state.epoch) return;
          if (error.status && !["generation_pending", "generation_recovery_required"].includes(error.code)) state.attempt = null;
          throw error;
        }
      }
      try {
        const plan = owned(await api("/halos", "POST", { draft_receipt: state.receipt }));
        if (epoch !== state.epoch) return;
        Object.assign(state, { receipt: null, attempt: null, entry: "", sample: false, initiative: null, history: [], plan, view: "review" });
        render(); if (await refreshAfterSave(plan, null, "review") && state.policy) notice("Your draft is saved. Review your Identity Card, Milestones and Blueprint, then choose Start my HALO.");
      } catch (error) {
        if (error.code === "draft_receipt_not_found") { state.receipt = null; state.attempt = null; }
        throw error;
      }
    }, { building: true });
  });
  const content = stack(intro, form);
  if (state.receipt) content.append(panel("A previous preview is ready to save", node("p", "Recover it without another generation request, or explicitly discard it before changing the intention.", "secondary"),
    button("Recover original preview", () => { state.entry = state.attempt.body.intention; render(); }),
    button("Discard pending preview", () => { state.receipt = null; state.attempt = null; render(); })));
  content.append(button("Explore an example", loadExample, { cls: "subtle" })); return content;
}
async function loadExample(preferredView = null) {
  run(async () => {
    const epoch = state.epoch;
    const example = await api("/ui/free-example.json", "GET", undefined, {}, null);
    if (epoch !== state.epoch) return;
    if (!example || example.horizon_days !== 7 || example.evidence.length || example.blueprint.actions.some((a) => a.status !== "planned")) throw { status: 503, code: "invalid_response" };
    stopTimer(); closeEditor(); Object.assign(state, { sample: true, plan: example, initiative: null, history: [], repeat: null, view: preferredView === "home" ? "home" : "today", tab: "milestones" });
    render(); notice(preferredView === "home" ? "" : "Read-only example. No personal work or evidence is saved from this example.");
  });
}
function openMyHaloDetail(key) {
  state.myHaloDetail = key; render();
  requestAnimationFrame(() => { const detail = document.getElementById("my-halo-detail"); detail?.scrollIntoView({block:"start"}); detail?.focus({preventScroll:true}); });
}
function myHaloOverview() {
  const plan = state.plan, execution = plan.cycle_execution;
  const header = row(node("h1", "My 1·60·7"), button("View all", () => run(async () => {
    state.view = "halos"; if (state.owner && !state.sample) await lists();
    else if (!overviewExamples) { const result = await api("/ui/my-halo-examples.json", "GET", undefined, {}, null); if (!Array.isArray(result.plans) || result.plans.some(p => p.owner_id !== "00000000-0000-4000-8000-000000000099")) throw {status:503,code:"invalid_response"}; overviewExamples = result.plans; }
    render();
  })));
  header.classList.add("my-halo-heading");
  const el = stack(header); el.classList.add("my-halo-overview");
  el.append(node("p", state.sample ? "SYNTHETIC EXAMPLE · No personal data or saved progress" : execution ? "Day " + practiceDay() + " of 7" : "Not started · review before beginning", "eyebrow"));
  const card = panel(null); card.classList.add("my-halo-identity");
  card.append(node("p", "MY IDENTITY CARD", "eyebrow"), node("p", "It already happened.", "my-halo-card-heading"), node("h2", plan.identity_card.statement), node("p", plan.identity_card.question, "secondary"));
  if (editable()) { const edit = node("details"); edit.append(node("summary", "Edit Identity Card"), identityWriting(plan.identity_card)); card.append(edit); }
  el.append(card, button("Start today’s 60 seconds", () => {
    const model = currentPracticeModule(); model.step = "proof"; model.side = "back"; if (!model.proof.trim()) model.proof = plan.blueprint.first_cycle.first_60_seconds;
    if (!model.deadline) { model.remaining = model.remaining > 0 ? model.remaining : 60; model.deadline = Date.now() + model.remaining * 1000; }
    state.view = "practice"; render(); $("main").focus();
  }, {primary:true,disabled:!state.sample && !editable()}), cycleContext(), dayStrip());
  const conditions = plan.wembt.conditions, met = conditions.filter(c => c.status === "satisfied").length;
  const milestones = panel("Milestones", node("p", `${met} of ${conditions.length} reported met`, "meta")); milestones.classList.add("my-halo-milestones");
  for (const condition of conditions) { const item = node("p", null, "my-halo-milestone"); item.dataset.met = String(condition.status === "satisfied"); item.append(node("span", condition.status === "satisfied" ? "✓" : "○"), node("span", condition.title)); milestones.append(item); }
  milestones.append(button("View Milestones", () => openMyHaloDetail("milestones"), {cls:"subtle"})); el.append(milestones);
  const tiles = node("div", null, "my-halo-tiles");
  const blueprint = button("", () => openMyHaloDetail("blueprint")); blueprint.append(node("strong", "My Blueprint"), node("span", "View your written plan"));
  const library = button("", () => {state.view = "library"; render();}); library.append(node("strong", "17 Blueprints"), node("span", "From the HALO book")); tiles.append(blueprint, library); el.append(tiles);
  el.append(row(button("Timeline", () => openMyHaloDetail("timeline")), button("Evidence", () => openMyHaloDetail("evidence")), button("Review plan and history", () => {state.view = "review"; render();})));
  if (state.myHaloDetail) { const detail = ({blueprint:blueprintCard,timeline:timelineCard,milestones:milestonesCard,evidence:evidenceCard}[state.myHaloDetail])(); detail.id = "my-halo-detail"; detail.tabIndex = -1; el.append(detail); }
  return el;
}
function allHalosScreen() {
  const el = stack(row(node("h1", "My HALO"), button("New HALO", showCreate, {primary:true})), node("p", "ALL HALOS", "eyebrow"), button("Back to My 1·60·7", showHome)); el.classList.add("my-halo-collection");
  const examples = state.sample || !state.owner;
  if (examples) el.append(node("p", "Synthetic examples · no personal data or saved progress", "notice"));
  const items = examples ? (overviewExamples || []).map(plan => ({id:plan.id,intention:plan.intention,identity_statement:plan.identity_card.statement,horizon_days:plan.horizon_days,completed_actions:0,total_actions:plan.blueprint.actions.length,example:plan})) : state.items;
  if (!items.length) el.append(panel("No HALOs here yet", node("p", examples ? "Open My 1·60·7 and choose View all to load the example collection." : "Create a HALO to start your first week.")));
  for (const [label,filter] of [["This week",h=>h.horizon_days<=7],["This quarter",h=>h.horizon_days>7&&h.horizon_days<=90],["This year",h=>h.horizon_days>90]]) {
    const group = items.filter(filter); if (!group.length) continue;
    const section = node("section", null, "my-halo-group"); section.append(node("h2",label));
    for (const item of group) {
      const tile = panel(null); tile.classList.add("my-halo-list-card");
      tile.append(row(node("h3",item.intention),badge(item.horizon_days === 365 ? "1 year" : item.horizon_days + " days")), node("p",item.identity_statement || item.intention,"secondary"));
      const completed = item.completed_actions, total = item.total_actions;
      if (Number.isInteger(completed) && Number.isInteger(total) && total>0 && completed>=0 && completed<=total) { const progress = node("progress"); progress.max=total; progress.value=completed; progress.setAttribute("aria-label", "Actions reported complete for " + item.intention); tile.append(progress, node("p",`${completed} of ${total} actions reported complete`,"meta")); }
      else tile.append(node("p","Open this HALO to view recorded progress.","meta"));
      if (item.initiative_status === "archived") tile.append(badge("Archived · read-only"));
      tile.append(button("Open HALO", () => {
        state.myHaloDetail = null;
        if (item.example) { stopTimer(); Object.assign(state,{plan:item.example,sample:true,initiative:null,history:[],view:"home"}); render(); }
        else run(() => openPlan(item.id,item.initiative_id,"home"));
      })); section.append(tile);
    } el.append(section);
  }
  if (!examples && state.cursor) el.append(button("Load older HALOs", () => run(async () => { const result = await api("/my-halos?before=" + encodeURIComponent(state.cursor)); if (!Array.isArray(result.halos) || result.halos.some(h=>h.owner_id!==state.owner)) throw {status:503,code:"invalid_response"}; state.items=[...new Map([...state.items,...result.halos].map(h=>[h.id,h])).values()]; state.cursor=result.next_cursor; render(); })));
  return el;
}
function halosScreen() {
  if (menu1607) return allHalosScreen();
  const el = stack(node("h1", state.policy?.tier === "plus" ? "My HALOs" : "My HALO"),
    node("p", "SAVED HALOS", "eyebrow"),
    node("p", "Your saved drafts and active or archived HALOs. Earlier weeks remain inside each HALO’s history.", "secondary"),
    row(button("New HALO", showCreate, { primary: true }), button("My HALO Plus overview", () => { state.view = "plus"; render(); })));
  if (!state.owner || state.locked) { el.append(node("p", "Connect an account to see your private HALOs.")); return el; }
  if (state.policy?.requires_initiative_selection) el.append(panel(null,
    node("p", "Choose a saved weekly HALO to continue. If several HALOs are active after a plan change, you can explicitly archive others; all history stays available.")));
  if (!state.items.length) el.append(panel("A place for your next small start", node("p", "No saved HALOs yet. Create one with your intention and seven-day horizon.")));
  for (const [group, items] of [["This week", state.items.filter((h) => h.horizon_days <= 7)], ["This quarter", state.items.filter((h) => h.horizon_days > 7 && h.horizon_days <= 90)], ["This year and beyond", state.items.filter((h) => h.horizon_days > 90)]]) {
    if (!items.length) continue;
    el.append(node("h2", group));
    for (const item of items) {
    const label = item.initiative_status === "archived" ? "Archived · read-only" : item.initiative_status === "active" ? "Active" : item.started ? "Choose to continue" : "Saved draft";
    el.append(panel(null, node("h2", item.intention), row(badge(label), node("p", `${item.horizon_days}-day horizon`, "meta")),
      button("Open HALO", () => run(() => openPlan(item.id, item.initiative_id)))));
    }
  }
  if (state.cursor) el.append(button("Load older HALOs", () => run(async () => {
    const result = await api("/my-halos?before=" + encodeURIComponent(state.cursor));
    if (!Array.isArray(result.halos) || result.halos.some((h) => h.owner_id !== state.owner)) throw { status: 503, code: "invalid_response" };
    state.items = [...new Map([...state.items, ...result.halos].map((h) => [h.id, h])).values()]; state.cursor = result.next_cursor; render();
  })));
  return el;
}
function plusScreen() {
  const el = stack(node("p", "DESIGN PREVIEW · NO UPGRADE OR PAYMENT", "eyebrow"), node("h1", "My HALO Plus Overview"),
    node("p", state.policy?.entitlement === "plus_preview" ? "Your manually granted Plus Preview supports multiple active HALOs and quarterly or annual intentions. No payment or subscription is activated." : "Plus Preview is available by manual invitation to selected testers. No payment or subscription is activated.", "secondary"));
  for (const [title, min, max] of [["This week", 0, 7], ["This quarter", 7, 90], ["This year and beyond", 90, Infinity]]) {
    const group = panel(title);
    const items = state.items.filter((h) => h.horizon_days > min && h.horizon_days <= max);
    if (!items.length) group.append(node("p", "No saved HALOs in this group. No example progress is presented as your work.", "secondary"));
    for (const item of items) group.append(stack(node("h3", item.intention), node("p", `${item.horizon_days}-day horizon · ${item.initiative_status || "saved draft"}`, "meta"), button("Open HALO", () => run(() => openPlan(item.id, item.initiative_id)))));
    el.append(group);
  }
  el.append(panel("HALO AI", node("p", "Cross-HALO suggestions require released capabilities, explicit context consent and verified signals. No suggestion has been generated here.", "secondary")),
    button("Back to My HALO", () => { state.view = "halos"; render(); }));
  return el;
}
function accountScreen() {
  const el = stack(node("h1", "Account"));
  if (!state.owner || state.locked) { el.append(panel("Your private practice", node("p", "Connect an account to save and continue your HALO."))); return el; }
  if (!state.policy) return stack(node("h1", "Account"), panel("Account information unavailable", node("p", "Your saved work remains available. Refresh before creating or changing a HALO."), button("Refresh account information", () => run(reloadCurrent, { readRetry: reloadCurrent }))));
  const p = state.policy;
  if (p.entitlement === "plus_preview" && p.effective_until) el.append(panel("Your Plus Preview",
    node("p", "Preview access ends " + new Date(p.effective_until).toLocaleString() + ". No subscription or payment was created. Saved work remains readable after expiry.", "secondary")));
  el.append(panel(p.tier === "free" ? "HALO Free" : "HALO Plus Preview",
    node("p", `${p.limits.active_initiatives} active HALO${p.limits.active_initiatives === 1 ? "" : "s"} allowed · Seven-day practice within your chosen horizon.`, "secondary"),
    node("p", `${p.usage.initial_requests_today} of ${p.limits.initial_generation_requests_per_day} initial AI requests used today.`),
    node("p", "Daily requests reset " + new Date(p.usage.resets_at).toLocaleString(undefined, { timeZone: "UTC" }) + " UTC.", "meta"),
    node("p", "Weekly repeats and manual edits do not use a new AI request. Retained evidence, export and delete do not require an upgrade.", "secondary"),
    button("Refresh usage", () => run(reloadCurrent, { readRetry: reloadCurrent }))));
  el.append(panel("Your data and your choice", node("p", "Private work stays with your account. Export or delete a HALO from its detail view. Deletion does not reset the daily AI budget.", "secondary"),
    node("p", "Personal AI context, community, marketplace and live checkout are not released in this preview.", "meta")));
  const feedback = panel("Help shape Plus", node("p", "$14.99/month and $119/year are proposed prices for research, not finalized rates or an offer to charge you. Would you consider either?", "secondary"));
  for (const [value, label] of [["monthly", "Consider $14.99/month"], ["annual", "Consider $119/year"], ["prefer_free", "Prefer Free"], ["not_yet", "Need more value first"]]) feedback.append(button(label, () => {
    metric("halo_preview_price_feedback", {choice:value});
    notice("Thanks. With analytics consent enabled, this selection is counted anonymously. No subscription or payment was created.");
  }));
  feedback.append(node("p", "Optional research. Responses are sent only when you have enabled usage analytics in Settings.", "meta")); el.append(feedback);
  return el;
}
function libraryScreen() {
  const content = stack(node("h1", "Blueprints"), node("p", "17 official book Blueprints · included with Free", "secondary"));
  if (streamlined) {
    const label = node("label", "Find a place to start"); label.htmlFor = "blueprint-search";
    const search = node("input"); search.id = "blueprint-search"; search.type = "search"; search.placeholder = "Search Blueprints"; search.value = libraryQuery;
    search.addEventListener("input", () => {
      libraryQuery = search.value;
      for (const item of content.querySelectorAll("[data-blueprint-search]")) item.hidden = !item.dataset.blueprintSearch.includes(libraryQuery.trim().toLocaleLowerCase());
      const empty = content.querySelector(".library-empty"); if (empty) empty.hidden = [...content.querySelectorAll("[data-blueprint-search]")].some(item => !item.hidden);
    });
    content.append(label, search);
  }
  content.append(node("p", "Identity Cards and questions checked against the supplied HALO Interior v32. Linked website prose includes editorial adaptations. Choose a starting point; adopting a practice does not establish progress.", "meta"));
  if (!bookLibrary.items) {
    content.append(node("p", bookLibrary.failed ? "Book library unavailable. Your saved HALOs are unchanged." : "Loading book Blueprints…"));
    if (bookLibrary.failed) content.append(button("Retry book library", () => { bookLibrary.failed = false; render(); }));
    if (!bookLibrary.pending && !bookLibrary.failed) {
      bookLibrary.pending = true;
      api("/ui/official-blueprints.json", "GET", undefined, {}, null).then((result) => {
        if (!Array.isArray(result.blueprints) || result.blueprints.length !== 17 || result.blueprints.some((b) => !/^[a-z0-9-]+$/.test(b.id) || typeof b.identity !== "string" || typeof b.question !== "string")) throw new Error();
        bookLibrary.items = result.blueprints;
      }).catch(() => { bookLibrary.failed = true; }).finally(() => { bookLibrary.pending = false; if (state.view === "library") render(); });
    }
  } else for (const b of bookLibrary.items) {
    const link = node("a", "Read this book Blueprint"); link.href = "https://thehalomethod.co/blueprints/" + b.id + "/";
    const item = panel(String(b.number).padStart(2,"0") + " · " + b.title, node("p", b.identity), node("p", b.question, "secondary"), link,
      button("Start from " + b.title, () => { state.entry = b.title; state.horizon = "7"; showCreate(); }));
    item.dataset.blueprintSearch = [b.title,b.identity,b.question].join(" ").toLocaleLowerCase();
    item.hidden = streamlined && !item.dataset.blueprintSearch.includes(libraryQuery.trim().toLocaleLowerCase()); content.append(item);
  }
  if (streamlined && bookLibrary.items) { const empty = node("p", "No Blueprints match. Try another word.", "library-empty secondary"); empty.setAttribute("role", "status"); empty.hidden = [...content.querySelectorAll("[data-blueprint-search]")].some(item => !item.hidden); content.append(empty); }
  content.append(panel("Extended Blueprints · Plus Preview", node("p", "Additional reviewed Blueprints will appear when released. No unreviewed examples are presented as official book content.", "secondary")));
  return content;
}
function repeatDate() {
  const plan = state.plan;
  const earliest = Math.max(Date.parse(plan.start_date + "T00:00:00Z") + 7 * DAY,
    Date.parse(plan.cycle_execution.started_at.slice(0, 10) + "T00:00:00Z") + 7 * DAY,
    Date.parse(plan.cycle_execution.closure.closed_at.slice(0, 10) + "T00:00:00Z"), Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z"));
  return new Date(earliest).toISOString().slice(0, 10);
}
function prepareRepeat() {
  run(async () => {
    const epoch = state.epoch;
    const plan = state.plan;
    const selected = plan.blueprint.actions.filter((a) => a.status !== "retired").map((a) => a.id);
    const result = await api("/halos/" + plan.id + "/cycle/continuation-proposal", "POST", {
      expected_revision: plan.revision, selected_action_ids: selected, practice_start: repeatDate(), confirm_proposal: true });
    if (epoch !== state.epoch) return;
    state.repeat = { proposal: result.proposal, revision: state.initiative.revision,
      initiativeId: state.initiative.id, planRevision: plan.revision }; state.view = "repeat"; render();
  });
}
function repeatScreen() {
  const context = state.repeat, proposal = context.proposal;
  const form = node("form", null, "stack");
  const dateLabel = node("label", "Next practice window starts"); dateLabel.htmlFor = "repeat-date";
  const input = node("input"); input.id = "repeat-date"; input.type = "date"; input.required = true;
  input.min = proposal.practice_window.start_date; input.value = context.date || input.min;
  input.addEventListener("input", () => { context.date = input.value; });
  form.append(node("p", "YOUR NEXT SEVEN DAYS", "eyebrow"), node("h1", "Another week, chosen by you"),
    node("p", "Review these proposed repeats. Previous completion stays in its original week. You can refine the new saved steps before starting.", "secondary"), dateLabel, input);
  for (let day = 1; day <= 7; day++) {
    const section = panel("Day " + day);
    for (const entry of proposal.actions.filter((e) => e.action.day_offset === day)) {
      const label = node("label", entry.action.description, "choice"), checkbox = node("input");
      checkbox.type = "checkbox"; checkbox.checked = context.selected ? context.selected.includes(entry.based_on_action_id) : true; checkbox.name = "repeat-action"; checkbox.value = entry.based_on_action_id;
      checkbox.addEventListener("change", () => { context.selected = [...form.querySelectorAll('[name="repeat-action"]:checked')].map((el) => el.value); });
      label.prepend(checkbox); section.append(label);
    }
    form.append(section);
  }
  const confirmation = node("label", "Save these as proposed steps. I will choose when to start, and earlier evidence is not new progress.", "choice");
  const confirm = node("input"); confirm.type = "checkbox"; confirm.required = true; confirmation.prepend(confirm); form.append(confirmation);
  const submit = node("button", "Save next week", "primary"); submit.type = "submit";
  form.append(row(submit, button("Back to this week", () => { state.view = "today"; render(); })));
  form.addEventListener("submit", (event) => {
    event.preventDefault(); const selection = [...form.querySelectorAll('[name="repeat-action"]:checked')].map((el) => el.value);
    run(async () => {
      const epoch = state.epoch;
      const result = await api("/initiatives/" + context.initiativeId + "/repeat", "POST", {
        expected_revision: context.revision, expected_plan_revision: context.planRevision,
        basis_sha256: proposal.basis.sha256, selected_action_ids: selection, practice_start: input.value, confirm_repeat: true });
      if (epoch !== state.epoch) return;
      state.initiative = result; state.repeat = null;
      if (await refreshAfterSave(owned(result.current_plan), context.initiativeId, "review") && state.policy) notice("The next week is saved as proposed work. Review and edit it, then choose when to start.");
    });
  });
  return form;
}
function archiveHalo() {
  const initiative = state.initiative;
  showEditor({ title: "Archive this HALO?", description: "This frees the active slot and keeps every week and evidence record available. It does not assert an outcome was achieved.",
    fields: [{ name: "confirm", label: "I choose to archive this HALO.", type: "checkbox", required: true }], save: "Archive HALO",
    async submit() { const epoch = state.epoch; await api("/initiatives/" + initiative.id + "/archive", "POST", { expected_revision: initiative.revision, confirm_archive: true });
      if (epoch !== state.epoch) return;
      closeEditor(); state.initiative = { ...state.initiative, status: "archived", revision: initiative.revision + 1 }; render();
      if (await refreshAfterSave(state.plan, initiative.id, "today") && state.policy) notice("HALO archived. Your evidence and history are retained."); } });
}
function deleteHalo() {
  const plan = state.plan, initiative = state.initiative;
  showEditor({ title: initiative ? "Delete the entire HALO?" : "Delete this saved draft?",
    description: initiative ? `All ${initiative.runs?.length || 1} weeks, revisions and evidence in this HALO will be erased. Export first if you want a copy.` : "This saved draft and all its revisions will be erased. Export first if you want a copy.",
    fields: [{ name: "text", label: "Type DELETE", required: true }, { name: "confirm", label: "I confirm permanent deletion of this HALO and its records.", type: "checkbox", required: true }], save: "Permanently delete",
    async submit(values) {
      const epoch = state.epoch;
      if (values.text !== "DELETE") throw { status: 422, code: "invalid_request" };
      await api(initiative ? "/initiatives/" + initiative.id : "/halos/" + plan.id, "DELETE", {
        expected_revision: initiative ? initiative.revision : plan.revision,
        ...(initiative ? { expected_plan_revision: initiative.current_plan.revision } : {}), confirm_delete: true, confirmation_text: "DELETE" });
      if (epoch !== state.epoch) return;
      closeEditor(); stopTimer(); Object.assign(state, { plan: null, initiative: null, history: [], repeat: null, items: [], active: [], cursor: null, view: "halos" }); render();
      try { await lists(); render(); notice("HALO deleted. Its saved records and generation replays are no longer available."); }
      catch { if (epoch === state.epoch) { state.policy = null; render(); notice("HALO deleted. Account information could not refresh.", reloadCurrent); } }
    } });
}
function exportHalo() {
  run(async () => {
    const epoch = state.epoch;
    const initiative = state.initiative;
    const data = await api(initiative ? "/initiatives/" + initiative.id + "/export" : "/halos/" + state.plan.id + "/export");
    if (epoch !== state.epoch) return;
    const snapshots = initiative ? data.runs?.flatMap((r) => r.revisions) : data.revisions;
    if (!Array.isArray(snapshots) || !snapshots.length || snapshots.some((p) => p.owner_id !== state.owner)
      || (initiative && data.initiative?.owner_id !== state.owner)) throw { status: 503, code: "invalid_response" };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = node("a"); link.href = url; link.download = "my-halo-history.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
    notice("Your HALO history was exported.");
  });
}
function renderHeader() {
  const connected = !!(state.owner && !state.locked);
  $("connection").textContent = connected ? "Account connected" : state.locked ? "Reconnect account" : "Not connected";
  $("tier-label").textContent = state.policy ? (state.policy.tier === "free" ? "Free · 1 · 60 · 7" : "Plus Preview · no subscription") : "1 · 60 · 7";
  $("connect").hidden = connected; $("connect").dataset.baseDisabled = String(!auth.available);
  $("connect").disabled = !auth.available || state.busy;
  $("sign-out").hidden = !state.owner;
  if (state.view === "home" || (menu1607 && state.view === "halos")) $("identity-home").setAttribute("aria-current", "page"); else $("identity-home").removeAttribute("aria-current");
  for (const control of document.querySelectorAll("[data-view]")) {
    const active = control.dataset.view === state.view || (control.dataset.view === "today" && ["review", "repeat", "practice"].includes(state.view));
    if (active) control.setAttribute("aria-current", "page"); else control.removeAttribute("aria-current");
    if (control.dataset.view === "halos") control.textContent = state.policy?.tier === "plus" ? "My HALOs" : "My HALO";
  }
}
function currentPracticeModule() {
  const key = (state.owner || "local") + ":" + (state.plan?.id || "new");
  if (practiceModule?.key !== key) practiceModule = {key, statement:state.plan?.identity_card.statement || state.entry, proof:"", duration:state.plan?.horizon_days || 7, custom:!!state.plan && ![7,90].includes(state.plan.horizon_days), side:"front", step:"card", remaining:60, deadline:null};
  return practiceModule;
}
function practiceModuleScreen() {
  currentPracticeModule();
  practiceModule.hasPlan = !!state.plan;
  practiceModule.question = state.plan?.identity_card.question;
  practiceModule.readOnly = !!state.plan && !state.sample && !editable();
  const panel = stack(node("p", "TRY 1 · 60 · 7", "eyebrow"), node("h1", "Take the 1·60·7 Test"), node("p", "One card. One small action. Return to it each day.", "secondary"));
  const module = mountPractice1607(practiceModule, {
    statement(value) { if (!state.plan) state.entry = value; },
    duration() {},
    ...(state.plan && !state.sample ? {save(value) {
      if (!value.trim()) { notice("Write your identity before saving."); return; }
      const plan = state.plan;
      run(async () => { const epoch = state.epoch; const result = await api("/halos/" + plan.id + "/identity", "PATCH", {expected_revision:plan.revision,changes:{statement:value.trim()}});
        if (epoch !== state.epoch) return; owned(result,plan.id); if (await refreshAfterSave(result, state.initiative?.id, "practice") && state.policy) notice("Your Identity Card is saved. Use Build a new HALO to create a matching new plan; existing evidence stays in history."); });
    }} : {}),
    ...(state.plan?.cycle_execution && !state.sample ? {record:recordDay} : {}),
    ...(state.plan ? {tracker:dayStrip} : {}),
    detail(key) { state.moduleDetail = key; render(); requestAnimationFrame(() => document.getElementById("practice-detail")?.scrollIntoView({block:"start"})); },
    build(statement, duration) {
      if (state.plan && !state.sample) { proposeInterpretation({entry:statement,horizon:duration}); return; }
      state.entry = statement; state.horizon = String(duration); state.customDuration = ![7,90,365].includes(duration); state.view = "create"; render(); if (duration !== 7 && !state.policy?.capabilities.custom_horizon) notice("90-day and custom plans require eligible Plus Preview access. Your current HALO has not changed.");
    }
  });
  disposePractice = module.dispose; panel.append(module.element);
  if (state.plan) {
    const record = state.plan.intention_record;
    const original = node("details", null, "practice-original");
    original.append(node("summary", "Your original words and HALO translation"),
      node("h3", "Your original input"), node("p", record?.original_intention ?? state.plan.intention, "original-words"));
    if (record && record.current_intention !== record.original_intention) original.append(node("h3", "Your latest input"), node("p", record.current_intention, "original-words"));
    original.append(node("h3", "Your editable HALO wording"), node("p", state.plan.identity_card.statement, "preserve"),
      node("p", "Your original words are kept. Edit the card to adjust its wording, or choose Translate and build plan to review a matching new Blueprint, Milestones and Timeline before saving it.", "meta"));
    panel.append(original, cycleContext());
    if (!state.plan.cycle_execution && canStart()) panel.append(button("Start my HALO", startPlan, {primary:true}));
  } else panel.append(node("p", "Build my HALO translates your words into an editable HALO Identity Card and a matching plan. Your original input is preserved.", "meta"));
  panel.append(node("p", state.sample ? "Synthetic example. Card edits are local drafts; Build my HALO prepares a new plan. No personal data or evidence is saved here." : state.owner ? "Duration applies to a new HALO. Existing saved dates, evidence and milestones stay unchanged." : "This card and timer are local to this preview. Connect an account to generate and save a HALO. Nothing is published or shared.", "meta"));
  if (!state.plan) panel.append(button("Explore an example", loadExample));
  if (state.plan && state.moduleDetail) { const details = ({blueprint:blueprintCard,timeline:timelineCard,milestones:milestonesCard}[state.moduleDetail])(); details.id = "practice-detail"; panel.append(details); }
  return panel;
}
function render() {
  disposePractice(); disposePractice = () => {};
  renderHeader(); const main = $("main"); main.replaceChildren();
  if (state.locked) main.append(stack(node("h1", "Reconnect to continue"), node("p", "Your private workspace is hidden until your account is verified again.", "secondary")));
  else if (state.view === "interpretation" && state.interpretationProposal) main.append(interpretationScreen());
  else if (state.view === "create") main.append(createScreen());
  else if (menu1607 && ["practice", "today"].includes(state.view)) main.append(practiceModuleScreen());
  else if (state.view === "halos") main.append(halosScreen());
  else if (state.view === "plus") main.append(plusScreen());
  else if (state.view === "account") main.append(accountScreen());
  else if (state.view === "library") main.append(libraryScreen());
  else if (streamlined && state.view === "community") main.append(stack(node("p", "COMMUNITY", "eyebrow"), node("h1", "Practice together, when it’s ready"), node("p", "Community is not enabled in this preview. Your Identity Card, evidence and HALOs stay private.", "secondary"), button("Back to My HALO", showHome)));
  else if (state.view === "repeat" && state.repeat) main.append(repeatScreen());
  else if (menu1607 && state.view === "home" && !state.plan) main.append(stack(row(node("h1", "My 1·60·7"), button("View all", () => {state.view="halos";render();})), panel("Your Identity Card", node("p","No HALO has been created yet. Your card and seven-day practice will appear here."), button("Create your first HALO",showCreate,{primary:true}))));
  else if (state.plan) main.append(renderPlan());
  else main.append(stack(node("h1", "A small start is enough"), node("p", "Create a weekly HALO or open one from My HALO.", "secondary"), button("Create my HALO", showCreate, { primary: true })));
  busy(state.busy, !$("building").hidden);
  const nextMetricView = `${state.owner && !state.locked && !state.sample ? state.policy?.entitlement || "free" : "public"}:${state.view}`;
  if (metricView !== nextMetricView) { metricView = nextMetricView; metric("halo_preview_active", {feature:state.view}); }
  calendarKey = state.plan ? `${practiceDay()}:${!!canStart()}` : "";
}

function showHome() {
  if (menu1607) state.myHaloDetail = null;
  if (nativeHost) history.pushState({}, "", previewUrl(nativePaths.today + (state.plan && state.owner && !state.locked && !state.sample ? "?halo=" + encodeURIComponent(state.plan.id) : "")));
  if (state.plan && !state.locked) { state.view = "home"; notice(""); render(); $("main").focus(); }
  else if (state.owner && !state.locked && state.items.length) run(async () => {
    const item = state.active[0] || state.items[0]; await openPlan(item.id, item.initiative_id, "home"); render();
  });
  else if (menu1607 && !state.owner) loadExample("home");
  else if (menu1607) {state.view="home";render();}
  else showCreate();
}
$("home").addEventListener("click", showHome);
$("identity-home").addEventListener("click", showHome);
$("connect").addEventListener("click", () => connect());
$("retry").addEventListener("click", () => retry && run(retry, { readRetry: retry }));
$("sign-out").addEventListener("click", async () => {
  clearPrivate(); state.localSignedOut = true; render(); notice("Signed out. Private content was cleared from this screen.");
  try { await auth.signOut(); } catch { notice("Private content was cleared here. Account sign-out could not be confirmed; close this tab or reconnect to try again."); }
});
$("cancel-building").addEventListener("click", () => { abort(); busy(false); render(); notice("Stopped waiting. The original request may still finish. Submit the same entry to recover it without a second generation request."); });
for (const control of document.querySelectorAll("[data-view]")) control.addEventListener("click", () => {
  if (streamlined && control.dataset.view === "today") practiceStage = "week";
  state.view = control.dataset.view; notice(""); render(); $("main").focus();
  if (nativeHost && nativePaths[state.view]) history.pushState({}, "", previewUrl(nativePaths[state.view] + (state.view === "today" && state.plan && state.owner && !state.locked ? "?halo=" + encodeURIComponent(state.plan.id) : "")));
  if (["halos", "account"].includes(state.view) && state.owner && !state.locked) run(async () => { await lists(); render(); }, { readRetry: reloadCurrent });
});
window.addEventListener("popstate", () => {
  if (!nativeHost) return;
  const id = requestedPlan();
  if (id && state.owner && !state.locked && !state.busy && state.plan?.id !== id) {
    const item = [...state.items,...state.active].find((h) => h.id === id);
    run(() => openPlan(id, item?.initiative_id));
  } else { state.view = routeView(); render(); }
});
$("edit-cancel").addEventListener("click", () => closeEditor());
$("editor").addEventListener("cancel", (event) => { if (state.busy) event.preventDefault(); else closeEditor(); });
$("edit-reload").addEventListener("click", () => { closeEditor(); run(reloadCurrent, { readRetry: reloadCurrent }); });
$("edit-form").addEventListener("submit", (event) => {
  event.preventDefault(); if (!state.editor) return;
  const values = formValues();
  if (state.editor.fields.some((f) => f.required && f.type !== "checkbox" && !String(values[f.name]).trim())) { $("edit-error").textContent = "Please complete the required entries."; return; }
  const spec = state.editor; spec.values = values; run(() => spec.submit(values));
});
window.addEventListener("beforeunload", (event) => {
  if ((state.entry.trim() || state.receipt || state.editor || state.identityDraft || state.interpretationProposal) && !state.localSignedOut) { event.preventDefault(); event.returnValue = ""; }
});
if (auth.available && auth.subscribe) auth.subscribe((signedIn) => {
  if (signedIn === false) { clearPrivate(); state.localSignedOut = true; render(); notice("Your account signed out. Private content was cleared."); }
  else if (signedIn === true && !state.localSignedOut && !state.connecting) connect(false);
});
window.addEventListener("pagehide", () => { if (state.owner) lock(); });
window.addEventListener("pageshow", (event) => { if (event.persisted && state.owner && !state.localSignedOut) connect(false); });
render();
if (auth.available && auth.autoConnect) connect(false);
setInterval(() => {
  if (!state.plan || state.locked || state.busy || state.editor || !["today", "review", "home"].includes(state.view)) return;
  if (`${practiceDay()}:${!!canStart()}` !== calendarKey) render();
}, 30000);
