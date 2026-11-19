import * as adapter from "./auth-adapter.js";
const { auth } = adapter;
const apiOrigin = adapter.apiOrigin || "";

const $ = (id) => document.getElementById(id);
const state = { owner: null, token: null, plan: null, receipt: null, saved: false,
  sample: false, editing: false, edits: {}, dirty: false, busy: false, building: false, locked: false,
  epoch: 0, recent: [], entryText: "", linkedEditor: null, linkedEdits: {} };
const controllers = new Set();
let aiAttempt = null;
let retryOperation = null;
let openViews = { blueprint: false, timeline: false, milestones: false, practice: null };
const expandedItems = new Set();
const editFields = { statement: "edit-statement", question: "edit-question", conduct_criterion: "edit-criterion" };
const message = (text, error = false) => { $("status").textContent = text; $("status").classList.toggle("error", error); };
function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
function observationText(evidence) {
  const labels = { user_report: "User report", practice_timer: "Practice timer", verified_observation: "Recorded observation" };
  const recorded = new Date(evidence.recorded_at);
  const stamp = Number.isNaN(recorded.getTime()) ? "Time unavailable" : recorded.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return `${labels[evidence.kind] || "Observation"} · ${stamp}: ${evidence.description}`;
}
function conditionStatus(condition) {
  if (condition.review_state === "retired") return "Retired from this plan";
  const labels = { unknown: "Still unsure", unsatisfied: "Not met", satisfied: "Met" };
  if (condition.verification_state === "user_reported") return `${labels[condition.status]} · you reported`;
  if (condition.status === "unknown") return "Not yet checked";
  return `${labels[condition.status]} · ${condition.verification_state === "verified" ? "verified observation" : "not verified"}`;
}
function clearWork() {
  openViews = { blueprint: false, timeline: false, milestones: false, practice: null };
  expandedItems.clear();
  $("workspace-details").open = false;
  aiAttempt = null;
  Object.assign(state, { plan: null, receipt: null, saved: false, sample: false, editing: false, edits: {}, dirty: false, linkedEditor: null, linkedEdits: {} });
  $("history").replaceChildren();
}
function abortRequests() { state.epoch++; for (const c of controllers) c.abort(); controllers.clear(); state.busy = false; state.building = false; }
function current(epoch) { if (epoch !== state.epoch) throw new DOMException("Cancelled", "AbortError"); }
async function confirmDiscard(text = "Your unsaved changes will be cleared.") {
  if (!(state.dirty || (state.plan && !state.saved && !state.sample) || (!state.plan && state.entryText.trim()))) return true;
  $("confirm-copy").textContent = text;
  const dialog = $("confirm-dialog"); dialog.returnValue = "cancel"; dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue === "discard"), { once: true }));
}
async function request(path, method = "GET", body = null, isPublic = false, extraHeaders = {}) {
  const epoch = state.epoch;
  if (!isPublic && !state.token) throw Object.assign(new Error(), { status: 401 });
  const controller = new AbortController(); controllers.add(controller);
  try {
    const response = await fetch(isPublic ? path : apiOrigin + path, { method, credentials: "omit", cache: "no-store", signal: controller.signal,
      headers: { ...extraHeaders, ...(isPublic ? {} : { Authorization: `Bearer ${state.token}` }), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    const result = await response.json().catch(() => ({})); current(epoch);
    if (!response.ok) throw Object.assign(new Error(), { status: response.status, code: result.error });
    return result;
  } finally { controllers.delete(controller); }
}
async function aiRequest(path, body) {
  const signature = JSON.stringify([path, body]);
  if (!aiAttempt || aiAttempt.signature !== signature || aiAttempt.terminal) {
    aiAttempt = { signature, key: crypto.randomUUID(), terminal: false };
  }
  const attempt = aiAttempt;
  state.building = true; controls();
  try {
    const result = await request(path, "POST", body, false, { "Idempotency-Key": attempt.key });
    if (aiAttempt === attempt) aiAttempt = null;
    return result;
  } catch (error) {
    if (error.status && !["generation_pending", "generation_recovery_required"].includes(error.code) && error.status !== 401) attempt.terminal = true;
    throw error;
  } finally { state.building = false; controls(); }
}
function handleError(error) {
  if (error.name === "AbortError") return;
  $("error-actions").hidden = false; $("retry").hidden = false; $("reload").hidden = true;
  $("regenerate").hidden = true;
  if (error.status === 401) {
    abortRequests(); state.token = null; state.locked = true;
    message("Your session expired. Reconnect your account to continue. Unsaved edits stay in this tab.", true);
    $("error-actions").hidden = true; render();
  } else if (["generation_pending", "generation_recovery_required"].includes(error.code)) {
    message("The AI request may still be finishing. Try again to recover the same result without starting another request.", true);
  } else if (["generation_expired", "generation_erased", "generation_interrupted", "generation_key_conflict"].includes(error.code)) {
    message("That AI attempt is no longer available. Try again to explicitly start a new preview. Your saved work is unchanged.", true);
  } else if (error.status === 409) {
    message("A newer revision was saved. Your edits are still here. Reload the saved revision when you are ready.", true);
    $("retry").hidden = true; $("reload").hidden = false;
  } else if (error.status === 422 && ["replacement", "condition-replacement"].includes(state.linkedEditor?.kind)) {
    message("Check the replacement and confirmation. Recorded actions, observations, check-ins, and connected protected work cannot be replaced. Your entries are still here.", true);
  } else if (error.status === 422 && state.linkedEditor?.kind === "dependency") {
    message("Check this link. Use available nodes, keep prerequisites in order, and avoid cycles or duplicate links. Your proposal is still here.", true);
  } else if (error.status === 422 && ["cycle-start", "cycle-checkin"].includes(state.linkedEditor?.kind)) {
    message("Check your cycle entry. Start once, choose a valid first-cycle day, provide a changed reflection, and explicitly confirm. Earlier entries remain available; the history limit is 1,000 entries.", true);
  } else if (error.status === 422 && state.linkedEditor?.kind === "object") {
    message("Check the plan change. Keep first-cycle days covered with one to three actions, retain condition coverage, and remove dependency links before retirement. Your entries are still here.", true);
  } else if (error.code === "replan_proposal_not_found") {
    message("This proposal is unavailable or expired. Use Revise proposal for a fresh preview. Your saved HALO is unchanged.", true); $("retry").hidden = true;
  } else if (error.code === "generation_limit_reached") {
    message("Your workspace reached its AI request limit. Try again later; daily limits reset at midnight UTC. Your saved work is unchanged.", true); $("retry").hidden = true;
  } else if (error.code === "proposal_capacity_reached") {
    message("Your account has reached the pending proposal limit. Try a fresh preview after earlier proposals expire.", true); $("retry").hidden = true;
  } else if (error.status === 422 && state.linkedEditor?.kind === "replan") {
    message("Choose a day within the horizon with room for new steps, and select valid proposed actions. Your saved work is unchanged.", true);
  } else {
    const messages = { 403: "Your account does not have permission for this action.",
      404: error.code === "draft_receipt_not_found" ? "This unsaved draft expired. Create a fresh draft to save it." : "This HALO could not be found for your account.",
      422: state.linkedEditor?.kind === "schedule" ? "Check your changes. Schedule days must fit the horizon, prerequisite order, and one-to-three-action daily first-cycle limit. Your edits are still here." : state.linkedEditor?.kind === "observation" ? "Check your entry. A nonempty observation is required; completed or retired work stays protected. Your edits are still here." : "Check your text and horizon, then try again. Your edits are still here.",
      429: "Your workspace has reached its pending-draft limit. Please try again later." };
    message(messages[error.status] || "We couldn't finish that request. Your edits are still here. Try again.", true);
    if (error.code === "draft_receipt_not_found" && state.plan && !state.saved) { $("retry").hidden = true; $("regenerate").hidden = false; }
  }
  $("status").focus();
}
async function perform(label, operation) {
  if (state.busy) return;
  const epoch = state.epoch; retryOperation = () => perform(label, operation);
  state.busy = true; $("error-actions").hidden = true; message(label); controls();
  try { await operation(epoch); current(epoch); }
  catch (error) { handleError(error); }
  finally { if (epoch === state.epoch) { state.busy = false; controls(); } }
}
function controls() {
  $("generation-progress").hidden = !state.busy || !state.building;
  $("generate-form").setAttribute("aria-busy", String(state.busy && state.building));
  $("edit-blueprint-story").disabled = !state.owner || !state.token || state.locked || !state.saved || state.sample || state.busy || state.editing || !!state.linkedEditor;
  for (const input of document.querySelectorAll(".blueprint-story-input")) input.disabled = state.busy;
  $("cancel-blueprint-story").disabled = state.busy;
  $("save-blueprint-story").disabled = state.busy || !state.dirty || !state.owner || state.locked || Object.values(state.linkedEdits).some(v => typeof v !== "string" || !v.trim());
  const connected = !!state.owner && !!state.token && !state.locked;
  for (const id of ["cycle-start", "cycle-checkin", "review-cycle"]) $(id).disabled = !connected || !state.saved || state.sample || state.busy || state.editing || !!state.linkedEditor;
  for (const id of ["cycle-day", "cycle-practice", "cycle-reflection", "cycle-obstacle", "cycle-confirm", "cancel-cycle"]) $(id).disabled = state.busy;
  $("save-cycle-review").disabled = !connected || !state.saved || state.busy || !cycleReviewValid();
  for (const id of ["cycle-decision", "cycle-review-reflection", "cycle-next-first", "cycle-review-confirm", "cancel-cycle-review"]) $(id).disabled = state.busy;
  for (const input of document.querySelectorAll(".cycle-next-action")) input.disabled = state.busy;
  $("save-cycle").disabled = !connected || !state.saved || state.busy || state.linkedEdits.confirm_cycle !== true || (state.linkedEditor?.kind === "cycle-checkin" && !state.linkedEdits.reflection?.trim());
  $("connect").hidden = connected; $("disconnect").hidden = !state.owner;
  $("connect").textContent = state.owner ? "Reconnect account" : "Connect account";
  $("connect").disabled = state.busy; $("generate").disabled = state.busy;
  $("horizon").disabled = $("custom-days").disabled = state.busy || (!!state.plan && !state.locked);
  const browsingBlocked = state.busy || state.editing || !!state.linkedEditor;
  for (const id of ["view-blueprint", "view-timeline", "view-milestones", "show-start", "show-cycle"]) {
    $(id).disabled = browsingBlocked || !state.plan || state.locked;
  }
  $("show-card").disabled = browsingBlocked;
  $("intention").disabled = state.busy || state.locked;
  $("new-halo").disabled = state.busy; $("example").disabled = state.busy;
  $("save-draft").hidden = state.saved; $("save-draft").disabled = !connected || state.sample || !state.receipt || state.busy;
  $("edit-identity").disabled = !connected || !state.saved || state.sample || state.busy || state.editing || !!state.linkedEditor;
  $("save-edit").disabled = !connected || !state.dirty || state.busy;
  $("load-history").disabled = !connected || !state.saved || state.busy;
  $("replan-button").disabled = !connected || !state.saved || state.sample || state.busy || state.editing || !!state.linkedEditor;
  const replan = state.linkedEditor?.kind === "replan", proposal = replan && state.linkedEdits.proposal;
  $("preview-replan").disabled = !connected || !state.saved || state.busy || !replan || !!proposal || !state.linkedEdits.reason?.trim() || !Number.isSafeInteger(state.linkedEdits.start_day) || state.linkedEdits.start_day < 1 || state.linkedEdits.start_day > state.plan?.horizon_days;
  $("accept-replan").disabled = !connected || !state.saved || state.busy || !proposal || !state.linkedEdits.selected_ids?.length || state.linkedEdits.confirm_accept !== true;
  for (const id of ["replan-reason", "replan-start"]) $(id).disabled = state.busy || !!proposal;
  for (const id of ["replan-confirm", "revise-replan", "cancel-replan"]) $(id).disabled = state.busy;
  for (const input of document.querySelectorAll(".replan-include")) input.disabled = state.busy;
  for (const button of document.querySelectorAll(".object-button")) button.disabled = !connected || !state.saved || state.sample || state.busy || state.editing || !!state.linkedEditor || button.dataset.protected === "true";
  $("save-replace").disabled = !connected || !state.saved || state.busy || !replacementValid();
  for (const id of ["replace-description", "replace-criterion", "replace-duration", "replace-gap", "replace-reason", "replace-confirm", "cancel-replace"]) $(id).disabled = state.busy;
  $("save-object").disabled = !connected || !state.saved || state.busy || !objectInputsValid();
  for (const id of ["object-text", "object-criterion", "object-gap", "object-conditions", "object-day", "object-duration", "object-reason", "object-confirm", "cancel-object"]) $(id).disabled = state.busy;
  $("add-dependency").disabled = !connected || !state.saved || state.sample || state.busy || state.editing || !!state.linkedEditor;
  for (const button of document.querySelectorAll(".remove-dependency")) button.disabled = !connected || !state.saved || state.sample || state.busy || state.editing || !!state.linkedEditor || button.dataset.protected === "true";
  $("save-dependency").disabled = !connected || !state.saved || state.busy || !state.linkedEdits.reason?.trim() || (state.linkedEditor?.kind === "dependency" && (state.linkedEditor.mode === "remove" ? !state.linkedEdits.confirm_remove : !state.linkedEdits.from_id || !state.linkedEdits.to_id));
  for (const id of ["dependency-reason", "dependency-confirm", "cancel-dependency"]) $(id).disabled = state.busy;
  for (const id of ["dependency-from", "dependency-to", "dependency-relation"]) $(id).disabled = state.busy || state.linkedEditor?.mode === "remove";
  $("delete-halo").disabled = !connected || !state.saved || state.sample || state.busy || state.editing || !!state.linkedEditor;
  $("confirm-delete").disabled = !connected || !state.saved || state.busy || state.linkedEditor?.kind !== "delete" || state.linkedEdits.confirm_delete !== true || state.linkedEdits.confirmation_text !== "DELETE";
  for (const id of ["delete-confirm-text", "delete-confirm", "cancel-delete"]) $(id).disabled = state.busy;
  $("export-halo").disabled = !connected || !state.saved || state.sample || state.busy;
  for (const id of Object.values(editFields)) $(id).disabled = state.busy;
  for (const button of document.querySelectorAll(".saved-item")) button.disabled = state.busy;
  for (const button of document.querySelectorAll(".linked-edit-button, .observation-button, .condition-check-button")) button.disabled = !connected || !state.saved || state.sample || state.busy || state.editing || !!state.linkedEditor || button.dataset.protected === "true";
  for (const id of ["linked-first", "linked-second", "linked-duration"]) $(id).disabled = state.busy;
  $("save-linked").disabled = !connected || !state.saved || !state.linkedEditor || !state.dirty || state.busy;
  $("edit-schedule").disabled = !connected || !state.saved || state.sample || state.busy || state.editing || !!state.linkedEditor || !state.plan?.blueprint.actions.some((a) => a.status === "planned");
  $("save-schedule").disabled = !connected || !state.saved || !state.dirty || state.busy;
  $("cancel-schedule").disabled = state.busy;
  for (const input of document.querySelectorAll(".schedule-day")) input.disabled = state.busy;
  $("save-observation").disabled = !connected || !state.saved || !state.linkedEdits.description?.trim() || state.busy || (state.linkedEditor?.kind === "condition-check" && !state.linkedEdits.assessment) || (["reopen", "correction"].includes(state.linkedEditor?.kind) && state.linkedEdits.confirm_completion !== true);
  for (const id of ["observation-description", "observation-complete", "condition-assessment", "cancel-observation"]) $(id).disabled = state.busy;
  $("mobile-saved").disabled = state.busy;
  $("account-status").textContent = connected ? "Account connected" : state.locked ? "Reconnect required" : "Not connected";
  $("auth-note").textContent = connected ? "Your draft will be ready to review before you save." : "Connect your account to create and save. Or explore an example first.";
  $("review").setAttribute("aria-busy", String(state.busy));
}
function renderRecent() {
  $("saved-list").replaceChildren(); $("mobile-saved").replaceChildren(node("option", "Recent HALOs"));
  $("mobile-saved").firstChild.value = "";
  if (!state.locked && state.owner) for (const item of state.recent) {
    const button = node("button", item.intention, "saved-item"); button.title = item.intention;
    button.addEventListener("click", () => openSaved(item.id)); $("saved-list").append(button);
    const option = node("option", item.intention); option.value = item.id; $("mobile-saved").append(option);
  }
  $("saved-empty").hidden = !!state.recent.length && !state.locked;
  $("saved-empty").textContent = state.owner && !state.locked ? "No saved HALOs yet. Start with an intention." : "Connect your account to see your saved HALOs.";
  $("mobile-saved").hidden = !state.recent.length || state.locked || !state.owner;
}
const storyLabels = {
  domain: "The Domain", why_hard: "Why It's Hard", if_true: "If This Is True",
  ordinary_day: "An Ordinary Day", comes_with: "What Comes With It",
  when_you_slip: "When You Slip", signs_working: "Signs It's Working",
  example: "Example", assistant_prompt: "Try It With an Assistant",
};
const legacyStory = {
  domain: "Choose the area of life this conduct belongs to.",
  why_hard: "Name the moment, environment or trigger where your old default is strongest. This is not known yet.",
  if_true: "Choose five repeatable behaviors that would follow from this conduct identity. Check them against your actual time and support.",
  ordinary_day: "Describe one boring aligned day. Keep it realistic for your actual time and support.",
  comes_with: "Check the practical demands on your time, energy, money and relationships. Name one trade-off you can realistically support.",
  when_you_slip: "Return at the next safe, appropriate opportunity. If misses repeat, review the action size, setting and support; adjust or rest when needed.",
  signs_working: "Look for changes in what you do and how you return after a miss. Record an observation; these are signals to look for, not promised results.",
  example: "Describe a hypothetical ordinary moment under pressure and the conduct you would choose. This is not evidence that it happened.",
  assistant_prompt: "Help me review this HALO Blueprint. Ask about my old default and hardest trigger. Review the conduct, ordinary day, trade-offs, return after a slip and signs to look for. No guarantees or invented observations. Keep consequential decisions for appropriate qualified review.",
};
function renderBlueprintStory() {
  const plan = state.plan, story = plan.blueprint.story || legacyStory;
  $("blueprint-story-note").textContent = !plan.blueprint.story ? "This earlier HALO has no book-shaped Blueprint yet. These are prompts to complete, not newly generated personal content. Save the HALO before editing." : plan.generation.mode === "mock" && !plan.blueprint.user_edited_fields.includes("story") ? "Default planning prompts · adapt them to your life. No personal history has been inferred." : "Proposed Blueprint · review the assumptions and adapt it to your life. Examples are hypothetical; no progress is established.";
  const container = $("blueprint-story"); container.replaceChildren();
  const faces = node("div", undefined, "blueprint-faces");
  for (const [label,text] of [["The Decision",plan.identity_card.statement],["Ask, in the Moment",plan.identity_card.question]]) {
    const section = node("section"); section.append(node("h3",label),node("p",text)); faces.append(section);
  }
  container.append(faces);
  const sections = node("div",undefined,"blueprint-sections");
  for (const [key,label] of Object.entries(storyLabels)) {
    const section = node("section",undefined,"blueprint-section"); section.append(node("h3",label),node("p",story[key]));
    if (["example","assistant_prompt"].includes(key)) section.classList.add("blueprint-wide");
    sections.append(section);
  }
  container.append(sections);
}
function renderStoryEditor() {
  const fields = $("blueprint-story-fields"); fields.replaceChildren();
  const story = state.plan.blueprint.story || legacyStory;
  for (const [key,label] of Object.entries(storyLabels)) {
    const field = node("textarea",undefined,"blueprint-story-input"); field.id = "story-" + key;
    field.maxLength = 4000; field.required = true; field.rows = 3; field.value = state.linkedEdits[key] ?? story[key];
    const title = node("label",label); title.htmlFor = field.id;
    field.addEventListener("input", () => {
      state.linkedEdits[key] = field.value;
      state.dirty = Object.entries(state.linkedEdits).some(([k,v]) => v !== story[k]); controls();
    });
    fields.append(title,field);
  }
}
$("edit-blueprint-story").addEventListener("click", () => {
  state.linkedEditor = {kind:"blueprint-story"}; state.linkedEdits = {}; state.dirty = false;
  renderStoryEditor(); render(); focusView("blueprint-story-form");
});
$("cancel-blueprint-story").addEventListener("click", async () => {
  if (!await confirmDiscard()) return;
  state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false;
  $("blueprint-story-fields").replaceChildren(); render(); focusView("blueprint-panel");
});
$("blueprint-story-form").addEventListener("submit", event => {
  event.preventDefault();
  perform("Saving your Blueprint…", async () => {
    const changes = Object.fromEntries([...$("blueprint-story-fields").querySelectorAll("textarea")].map(field => [field.id.slice(6),field.value]));
    const plan = await request(`/halos/${encodeURIComponent(state.plan.id)}/blueprint-story`,"PATCH",{expected_revision:state.plan.revision,changes});
    state.plan = plan; state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false;
    $("blueprint-story-fields").replaceChildren(); $("history").replaceChildren();
    noteSaved(plan); render(); message("Blueprint saved as a new revision. Timeline, Milestones and evidence are preserved."); focusView("blueprint-panel");
  });
});
function renderViews(visible = !!state.plan && !state.locked) {
  for (const name of ["blueprint", "timeline", "milestones"]) {
    $(name + "-panel").hidden = !visible || !openViews[name];
    $("view-" + name).setAttribute("aria-expanded", String(visible && openViews[name]));
  }
  $("practice").hidden = !visible || !openViews.practice;
  for (const [id, selected] of [["show-card", !openViews.practice], ["show-start", openViews.practice === "start"], ["show-cycle", openViews.practice === "cycle"]]) {
    $(id).setAttribute("aria-pressed", String(selected));
  }
}
function foldPlanItem(container, id) {
  const fold = node("details", undefined, "plan-item"), summary = node("summary");
  summary.append(container.querySelector("h3"));
  const preview = container.querySelector(":scope > span, :scope > p");
  if (preview) { preview.classList.add("row-preview"); summary.append(preview); }
  const arrow = node("span", "↗", "row-arrow"); arrow.setAttribute("aria-hidden", "true");
  summary.append(arrow);
  const body = node("div", undefined, "row-body");
  while (container.firstChild) body.append(container.firstChild);
  fold.append(summary, body); fold.open = expandedItems.has(id);
  fold.addEventListener("toggle", () => {
    if (fold.open) expandedItems.add(id); else expandedItems.delete(id);
  });
  container.append(fold);
}
function focusView(id) {
  const target = $(id); if (target.tabIndex < 0) target.tabIndex = -1; target.focus();
  target.scrollIntoView({ block: "start" });
}
for (const name of ["blueprint", "timeline", "milestones"]) $("view-" + name).addEventListener("click", () => {
  openViews[name] = !openViews[name]; renderViews();
  if (openViews[name]) focusView(name + "-panel");
});
$("show-card").addEventListener("click", () => {
  openViews = { blueprint: false, timeline: false, milestones: false, practice: null }; renderViews();
  focusView(state.plan && !state.locked ? "review" : "intention");
});
for (const name of ["start", "cycle"]) $("show-" + name).addEventListener("click", () => {
  openViews.practice = name; renderViews();
  focusView(name === "start" ? "practice" : "cycle-heading");
});
function render() {
  renderRecent(); controls();
  const visible = !!state.plan && !state.locked;
  document.body.classList.toggle("has-plan", visible);
  renderViews(visible);
  if (visible) {
    const days = state.plan.horizon_days;
    $("horizon").value = [7, 90, 365].includes(days) ? String(days) : "custom";
    $("custom-days").value = String(days);
    $("custom-days").hidden = $("custom-label").hidden = $("horizon").value !== "custom";
  }
  $("page-title").textContent = visible ? "Your HALO." : "What do you want to do?";
  $("page-lede").textContent = visible ? "One card. A small start. Your next chapter." : "One intention. Choose your timeframe. Start with your card.";
  $("entry").hidden = visible; $("review").hidden = !visible;
  $("identity-form").hidden = !visible || !state.editing;
  $("blueprint-story-form").hidden = !visible || state.linkedEditor?.kind !== "blueprint-story";
  if (visible && state.linkedEditor?.kind === "blueprint-story" && !$("blueprint-story-fields").childElementCount) renderStoryEditor();
  if (visible) renderBlueprintStory();
  $("linked-form").hidden = !visible || !["condition", "action"].includes(state.linkedEditor?.kind);
  $("schedule-form").hidden = !visible || state.linkedEditor?.kind !== "schedule";
  $("dependency-form").hidden = !visible || state.linkedEditor?.kind !== "dependency";
  $("object-form").hidden = !visible || state.linkedEditor?.kind !== "object";
  $("replan-form").hidden = !visible || state.linkedEditor?.kind !== "replan";
  $("observation-form").hidden = !visible || !["observation", "condition-check", "reopen", "correction"].includes(state.linkedEditor?.kind);
  if (!visible) {
    // Private text is removed from the DOM while locked; bound edits remain only in memory.
    for (const id of ["blueprint-story", "blueprint-story-fields", "blueprint-story-note", "identity-statement", "identity-question", "original-intention", "first-step", "conditions", "actions", "assumptions", "sources", "history", "reports", "cycle-summary", "cycle-days", "cycle-log-history", "cycle-day-actions", "cycle-archive"]) $(id).replaceChildren();
    for (const id of Object.values(editFields)) $(id).value = "";
    for (const id of ["linked-first", "linked-second", "linked-duration"]) $(id).value = "";
    $("schedule-fields").replaceChildren(); $("schedule-diff").replaceChildren();
    $("dependencies").replaceChildren(); clearDependencyForm();
    clearObjectForm();
    clearReplanForm(); clearCycleForm(); clearCycleReview(); clearReplacement(); clearDelete();
    clearObservationForm();
    $("intention").value = state.locked ? "" : state.entryText;
    $("condition-count").textContent = $("revision-label").textContent = "";
    $("draft-label").textContent = "Draft · needs review";
    return;
  }
  const plan = state.plan;
  $("draft-label").textContent = state.sample ? "Example · not saved" : state.saved ? "Saved · revision " + plan.revision : "Draft · needs review";
  $("original-intention").textContent = plan.intention;
  $("identity-statement").textContent = plan.identity_card.statement;
  $("identity-question").textContent = plan.identity_card.question;
  $("revision-label").textContent = "REV " + plan.identity_card.revision;
  $("first-step").textContent = plan.cycle_execution?.first_60_seconds || plan.blueprint.first_cycle.first_60_seconds;
  $("condition-count").textContent = plan.wembt.conditions.filter((item) => item.review_state !== "retired").length;
  $("blueprint-heading").textContent = plan.horizon_days < 7 ? (plan.horizon_days === 1 ? "Your first day" : `Your first ${plan.horizon_days} days`) : "The first seven days";
  $("conditions").replaceChildren();
  for (const condition of plan.wembt.conditions) {
    const card = node("article", undefined, "condition"); card.append(node("h3", condition.title));
    card.append(node("span", conditionStatus(condition)));
    card.append(node("p", condition.acceptance_criterion));
    if (condition.review_state === "review") card.append(node("p", "Review needed · check this condition and its linked work."));
    if (condition.gap) card.append(node("p", "Open question: " + condition.gap.description));
    const protectedWork = condition.review_state === "retired" || plan.blueprint.actions.some((a) => a.status === "completed" && a.condition_ids.includes(condition.id));
    card.append(editLinkedButton("condition", condition.id, condition.title, protectedWork));
    const check = node("button", "Check condition", "text-button condition-check-button");
    check.type = "button"; check.dataset.protected = String(condition.review_state === "retired");
    check.setAttribute("aria-label", `Check condition: ${condition.title}`);
    check.addEventListener("click", () => {
      state.linkedEditor = { kind: "condition-check", id: condition.id }; state.linkedEdits = {}; state.dirty = false;
      render(); $("observation-description").focus();
    });
    card.append(check);
    if (condition.review_state !== "retired") card.append(retireObjectButton("condition", condition.id));
    if (condition.review_state !== "retired") card.append(replaceConditionButton(condition));
    if (condition.evidence_ids.length) {
      const details = node("details"); details.append(node("summary", "Recorded checks"));
      for (const id of condition.evidence_ids) {
        const evidence = plan.evidence.find((entry) => entry.id === id);
        if (evidence) details.append(node("p", observationText(evidence), "condition-note"));
      }
      card.append(details);
    }
    foldPlanItem(card, condition.id);
    $("conditions").append(card);
  }
  $("actions").replaceChildren();
  for (const action of [...plan.blueprint.actions].sort((a, b) => a.day_offset - b.day_offset)) {
    const row = node("article", undefined, "action"); const day = node("div", "DAY", "day"); day.append(node("strong", String(action.day_offset).padStart(2, "0")));
    const content = node("div"); content.append(node("h3", action.description));
    content.append(node("p", `${action.duration_minutes} min estimate · ${action.status === "planned" ? "Proposed" : action.status === "completed" ? "Completed · you confirmed" : "Retired from this plan"}${action.review_state === "review" ? " · Review needed" : ""}`));
    const details = node("details"); details.append(node("summary", "Why this step?"));
    details.append(node("p", action.condition_ids.map((id) => plan.wembt.conditions.find((c) => c.id === id)?.title || "Condition").join(" · ")));
    details.append(node("p", "Done when: " + action.done_criterion));
    for (const id of action.evidence_ids) {
      const evidence = plan.evidence.find((entry) => entry.id === id);
      if (evidence) details.append(node("p", observationText(evidence), "observation-note"));
    }
    content.append(details, editLinkedButton("action", action.id, action.description, action.status !== "planned"));
    const observe = node("button", "Record observation", "text-button observation-button");
    observe.type = "button"; observe.dataset.protected = String(action.status !== "planned");
    observe.setAttribute("aria-label", `Record observation: ${action.description}`);
    observe.addEventListener("click", () => {
      state.linkedEditor = { kind: "observation", id: action.id }; state.linkedEdits = {}; state.dirty = false;
      render(); $("observation-description").focus();
    });
    content.append(observe);
    if (action.status === "planned") { content.append(retireObjectButton("action", action.id)); content.append(replaceActionButton(action)); }
    if (action.status === "completed") {
      const reopen = node("button", "Reopen action", "text-button observation-button reopen-button");
      reopen.type = "button"; reopen.setAttribute("aria-label", `Reopen action: ${action.description}`);
      reopen.addEventListener("click", () => {
        state.linkedEditor = { kind: "reopen", id: action.id }; state.linkedEdits = {}; state.dirty = false;
        render(); $("observation-description").focus();
      });
      content.append(reopen);
    }
    foldPlanItem(content, action.id);
    row.append(day, content); $("actions").append(row);
  }
  $("assumptions").replaceChildren(...plan.outcome.assumptions.map((item) => node("li", item)));
  $("sources").replaceChildren();
  const labels = { ai_inferred: "AI assumption", unverified_unknown: "Unverified", expert_reviewed_template: "Reviewed template", verified_external: "Verified external source", user_confirmed: "Your contribution", observed_user_evidence: "Recorded observation" };
  for (const source of plan.sources) {
    const item = node("div", undefined, "source"); item.append(node("strong", labels[source.kind] || "Source"), node("p", source.title));
    if (source.inference_summary) item.append(node("p", source.inference_summary)); $("sources").append(item);
  }
  for (const [field, id] of Object.entries(editFields)) $(id).value = state.edits[field] ?? plan.identity_card[field];
  $("edit-state").textContent = state.dirty ? "Unsaved edits · your saved revision is unchanged." : "Changes stay here until you save.";
  $("history-empty").textContent = state.saved ? "Load earlier snapshots of your HALO." : "Save your HALO to start its revision history.";
  renderDelete(); renderReplacement(); renderCycle(); renderCycleReview(); renderReports(); renderLinkedEditor(); renderScheduleEditor(); renderObservationEditor(); renderDependencies(); renderObjectEditor(); renderReplanEditor(); controls();
}
function clearDelete() { $("delete-form").hidden = true; $("delete-target").textContent = ""; $("delete-confirm-text").value = ""; $("delete-confirm").checked = false; $("delete-confirm").required = $("delete-confirm-text").required = false; }
function renderDelete() {
  if (state.linkedEditor?.kind !== "delete") { clearDelete(); return; }
  $("delete-form").hidden = false; $("delete-target").textContent = state.plan.intention;
  $("delete-confirm").required = $("delete-confirm-text").required = true;
  $("delete-confirm-text").value = state.linkedEdits.confirmation_text ?? ""; $("delete-confirm").checked = state.linkedEdits.confirm_delete ?? false;
}
$("delete-halo").addEventListener("click", () => { state.linkedEditor = {kind:"delete"}; state.linkedEdits = {confirmation_text:"",confirm_delete:false}; state.dirty = false; render(); $("delete-confirm-text").focus(); });
for (const id of ["delete-confirm-text","delete-confirm"]) $(id).addEventListener("input", () => { state.linkedEdits.confirmation_text = $("delete-confirm-text").value; state.linkedEdits.confirm_delete = $("delete-confirm").checked; state.dirty = true; controls(); });
$("cancel-delete").addEventListener("click", async () => { if (!await confirmDiscard()) return; state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false; render(); });
$("delete-form").addEventListener("submit", (event) => { event.preventDefault(); perform("Deleting this HALO…", async () => {
  if (state.linkedEditor?.kind !== "delete" || state.linkedEdits.confirm_delete !== true || state.linkedEdits.confirmation_text !== "DELETE") return;
  const id = state.plan.id;
  await request(`/halos/${encodeURIComponent(id)}`,"DELETE",{expected_revision:state.plan.revision,confirm_delete:true,confirmation_text:state.linkedEdits.confirmation_text});
  state.recent = state.recent.filter((item) => item.id !== id); clearWork(); state.entryText = ""; render(); message("HALO permanently deleted.");
}); });
function replacementBlock(item, condition = false) {
  const plan = state.plan, conditions = plan.wembt.conditions, actions = plan.blueprint.actions, edges = plan.blueprint.dependencies;
  if (!condition && item.condition_ids.some((id) => { const c = conditions.find((c) => c.id === id); return c.review_state === "retired" || c.evidence_ids.length || c.status !== "unknown"; })) return "A linked condition has recorded or retired work.";
  const recorded = new Set(cycleExecutions(plan).flatMap((execution) => execution.daily_logs).flatMap((log) => log.action_ids));
  const pending = [item.id, ...edges.filter((d) => [d.from_id, d.to_id].includes(item.id)).flatMap((d) => [d.from_id, d.to_id])], visited = new Set();
  while (pending.length) {
    const key = pending.pop(); if (visited.has(key)) continue; visited.add(key);
    const a = actions.find((item) => item.id === key), c = conditions.find((item) => item.id === key), node = a || c;
    if (node.review_state === "retired" || node.evidence_ids.length || recorded.has(key) || (a && a.status !== "planned") || (c && c.status !== "unknown")) return "Recorded work, check-ins, or connected protected work must stay intact.";
    pending.push(...edges.filter((d) => d.from_id === key).map((d) => d.to_id));
    if (c) pending.push(...actions.filter((a) => a.condition_ids.includes(key)).map((a) => a.id));
  }
  return "";
}
function replacementButton(item, condition) {
  const button = node("button", condition ? "Replace condition" : "Replace action", "text-button object-button"); button.type = "button";
  const blocked = replacementBlock(item, condition); button.dataset.protected = String(!!blocked); button.title = blocked || "Review a replacement while preserving the original.";
  button.addEventListener("click", () => { state.linkedEditor = {kind:condition ? "condition-replacement" : "replacement", id:item.id}; state.linkedEdits = condition ? {description:item.title, done_criterion:item.acceptance_criterion, gap:"", reason:"", confirm_replacement:false} : {description:item.description, done_criterion:item.done_criterion, duration_minutes:item.duration_minutes, reason:"", confirm_replacement:false}; state.dirty = false; render(); $("replace-description").focus(); }); return button;
}
function replaceActionButton(action) { return replacementButton(action, false); }
function replaceConditionButton(condition) { return replacementButton(condition, true); }
function replacementTarget() { return (state.linkedEditor.kind === "condition-replacement" ? state.plan.wembt.conditions : state.plan.blueprint.actions).find((item) => item.id === state.linkedEditor.id); }
function replacementValid() {
  if (!["replacement", "condition-replacement"].includes(state.linkedEditor?.kind)) return false;
  const e = state.linkedEdits, original = replacementTarget();
  if (!e.description?.trim() || !e.done_criterion?.trim() || !e.reason?.trim() || e.confirm_replacement !== true) return false;
  if (state.linkedEditor.kind === "condition-replacement") return !!e.gap?.trim() && (e.description !== original.title || e.done_criterion !== original.acceptance_criterion || e.gap !== original.gap?.description || original.gap?.type !== "verification_question");
  return Number.isSafeInteger(e.duration_minutes) && e.duration_minutes >= 1 && e.duration_minutes <= 1440 && ["description", "done_criterion", "duration_minutes"].some((key) => original[key] !== e[key]);
}
const replacementFields = [["replace-description", "description"], ["replace-criterion", "done_criterion"], ["replace-duration", "duration_minutes"], ["replace-gap", "gap"], ["replace-reason", "reason"]];
function clearReplacement() {
  $("replace-form").hidden = true; $("replace-summary").textContent = ""; $("replace-links").replaceChildren();
  for (const [id] of replacementFields) { $(id).value = ""; $(id).required = false; }
  $("replace-confirm").checked = false; $("replace-confirm").required = false;
}
function replacementSummary() {
  const original = replacementTarget(), condition = state.linkedEditor.kind === "condition-replacement";
  $("replace-summary").textContent = condition ? `Retire: ${original.title}. Keep type ${original.type} and priority ${original.criticality}. New condition starts unknown, with your new planning question. Prior assumptions stay only on the original. Action content, schedules and first-cycle membership stay unchanged.` : `Retire: ${original.description}. Keep Plan Day ${original.day_offset}, its action kind, and ${original.condition_ids.length} condition links. First-cycle coverage stays intact. New work starts planned and needs review.`;
  $("replace-links").replaceChildren();
  if (condition) for (const action of state.plan.blueprint.actions.filter((a) => a.condition_ids.includes(original.id))) $("replace-links").append(node("li", `Re-link action on Plan Day ${action.day_offset}: ${action.description} — Done when: ${action.done_criterion}. Needs review.`));
  const edges = state.plan.blueprint.dependencies.filter((d) => [d.from_id, d.to_id].includes(original.id));
  for (const edge of edges) $("replace-links").append(node("li", `${edge.from_id === original.id ? "Replacement: " + state.linkedEdits.description : dependencyName(state.plan, edge.from_id)} → ${edge.to_id === original.id ? "Replacement: " + state.linkedEdits.description : dependencyName(state.plan, edge.to_id)} · ${relationLabels[edge.relation]} · ${edge.rationale}`));
  if (!$("replace-links").children.length) $("replace-links").append(node("li", "No action or dependency links to redirect."));
}
function renderReplacement() {
  if (!["replacement", "condition-replacement"].includes(state.linkedEditor?.kind)) { clearReplacement(); return; }
  const condition = state.linkedEditor.kind === "condition-replacement";
  $("replace-form").hidden = false; $("replace-duration-row").hidden = condition; $("replace-gap-row").hidden = !condition;
  $("replace-title").textContent = condition ? "Review condition replacement" : "Review action replacement";
  $("replace-description-label").textContent = condition ? "Replacement condition" : "Replacement action";
  $("replace-criterion-label").textContent = condition ? "Replacement acceptance criterion" : "Replacement done criterion";
  $("replace-reason-label").textContent = condition ? "Why replace this condition?" : "Why replace this action?";
  $("replace-links-heading").textContent = condition ? "Action and dependency links to update" : "Dependency links to redirect";
  $("replace-confirm-copy").textContent = condition ? "I confirm retiring the original condition, adding an unknown replacement, and redirecting the listed links." : "I confirm retiring the original, adding this planned replacement, and redirecting the listed links.";
  for (const [id, field] of replacementFields) { $(id).value = state.linkedEdits[field] ?? ""; $(id).required = field === "duration_minutes" ? !condition : field === "gap" ? condition : true; }
  $("replace-confirm").required = true; $("replace-confirm").checked = state.linkedEdits.confirm_replacement ?? false; replacementSummary();
}
for (const [id, field] of [...replacementFields, ["replace-confirm", "confirm_replacement"]]) $(id).addEventListener("input", () => {
  if (!["replacement", "condition-replacement"].includes(state.linkedEditor?.kind)) return;
  state.linkedEdits[field] = field === "duration_minutes" ? $(id).valueAsNumber : field === "confirm_replacement" ? $(id).checked : $(id).value; state.dirty = true; replacementSummary(); controls();
});
$("cancel-replace").addEventListener("click", async () => { if (!await confirmDiscard()) return; state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false; render(); });
$("replace-form").addEventListener("submit", (event) => { event.preventDefault(); perform("Saving your replacement…", async () => {
  if (!replacementValid()) return;
  const condition = state.linkedEditor.kind === "condition-replacement", e = state.linkedEdits;
  const changes = condition ? {title:e.description, acceptance_criterion:e.done_criterion, gap:e.gap, reason:e.reason, confirm_replacement:e.confirm_replacement} : {description:e.description, done_criterion:e.done_criterion, duration_minutes:e.duration_minutes, reason:e.reason, confirm_replacement:e.confirm_replacement};
  const plan = await request(`/halos/${encodeURIComponent(state.plan.id)}/${condition ? "conditions" : "actions"}/${encodeURIComponent(state.linkedEditor.id)}/replace`, "POST", {expected_revision:state.plan.revision, ...changes});
  state.plan = plan; state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false; $("history").replaceChildren(); noteSaved(plan); render(); message(condition ? "Condition replacement saved as unknown. The original is retired; listed links need review and recorded work stays intact." : "Replacement saved as planned. The original is retired, listed links were redirected, and recorded work stays intact.");
}); });
function replanStartDay() { return state.plan.cycle_execution?.range_end ? Math.min(state.plan.horizon_days, cycleEnd()+1) : state.plan.horizon_days > 7 ? 8 : 1; }
function cycleExecutions(plan = state.plan) { return [...(plan?.cycle_history || []), ...(plan?.cycle_execution ? [plan.cycle_execution] : [])]; }
function cycleDays() { return state.plan.cycle_execution?.days || state.plan.blueprint.first_cycle.days; }
function cycleEnd() { return state.plan?.cycle_execution?.range_end || Math.min(7, state.plan?.horizon_days || 7); }
function nextCycleActions() {
  const used = new Set(cycleExecutions().flatMap((execution) => (execution.days || state.plan.blueprint.first_cycle.days).flatMap((day) => day.action_ids)));
  return state.plan.blueprint.actions.filter((a) => a.status !== "retired" && !used.has(a.id) && a.day_offset > cycleEnd() && a.day_offset <= Math.min(cycleEnd() + 7, state.plan.horizon_days));
}
function cycleReviewValid() {
  if (state.linkedEditor?.kind !== "cycle-review" || !state.linkedEdits.reflection?.trim() || state.linkedEdits.confirm_review !== true) return false;
  const e = state.linkedEdits, current = state.plan.cycle_execution;
  if (!["keep", "refine", "retire"].includes(e.decision)) return false;
  if (e.decision === "retire") return !current.closure;
  if (!current.closure && latestCheckins().size !== cycleDays().length) return false;
  if (cycleEnd() >= state.plan.horizon_days) return true;
  const selected = nextCycleActions().filter((a) => e.selected_action_ids.includes(a.id));
  for (let day = cycleEnd()+1; day <= Math.min(cycleEnd()+7,state.plan.horizon_days); day++) if (selected.filter((a) => a.day_offset === day).length < 1 || selected.filter((a) => a.day_offset === day).length > 3) return false;
  return e.decision !== "refine" || !!e.first_60_seconds?.trim();
}
function clearCycleReview() {
  $("cycle-review-form").hidden = true; $("cycle-review-summary").textContent = $("cycle-review-note").textContent = ""; $("cycle-next-actions").replaceChildren();
  for (const id of ["cycle-review-reflection", "cycle-next-first"]) { $(id).value = ""; $(id).required = false; }
  $("cycle-review-confirm").checked = false; $("cycle-review-confirm").required = false;
}
function renderCycleReview() {
  if (state.linkedEditor?.kind !== "cycle-review") { clearCycleReview(); return; }
  const e = state.linkedEdits, advancing = e.decision !== "retire" && cycleEnd() < state.plan.horizon_days;
  $("cycle-review-form").hidden = false; $("cycle-decision").value = e.decision; $("cycle-review-reflection").value = e.reflection;
  $("cycle-review-reflection").required = $("cycle-review-confirm").required = true; $("cycle-review-confirm").checked = e.confirm_review;
  $("cycle-review-summary").textContent = `Review current plan Days ${cycleDays()[0].day_offset}–${cycleEnd()}. ${latestCheckins().size} of ${cycleDays().length} days have check-ins. Earlier records and action evidence stay intact.`;
  $("cycle-review-note").textContent = e.decision === "retire" ? "Retire this practice window without completing any actions. You can start the next saved window later if your original horizon allows." : advancing ? `Continue with selected saved steps for Plan Days ${cycleEnd()+1}–${Math.min(cycleEnd()+7,state.plan.horizon_days)}. Prepare missing work in Timeline before returning to this review. Check-ins are personal reports, not calendar-day or achievement claims.` : "Your original horizon ends here. This review closes the practice window without claiming that the objective was achieved.";
  $("cycle-next-fields").hidden = !advancing; $("cycle-next-first-row").hidden = !advancing || e.decision !== "refine";
  $("cycle-next-first").value = e.first_60_seconds; $("cycle-next-first").required = advancing && e.decision === "refine";
  $("cycle-next-actions").replaceChildren();
  if (advancing) for (let day=cycleEnd()+1; day<=Math.min(cycleEnd()+7,state.plan.horizon_days); day++) {
    const section = node("section"); section.append(node("h4",`Plan Day ${day}`)); const actions = nextCycleActions().filter((a) => a.day_offset === day);
    if (!actions.length) section.append(node("p","No saved steps. Prepare this day with Review replan or Add action in Timeline."));
    for (const action of actions) {
      const label = node("label",undefined,"completion-choice"), input = node("input"); input.type = "checkbox"; input.className = "cycle-next-action"; input.checked = e.selected_action_ids.includes(action.id);
      input.addEventListener("input", () => { const selected = new Set(e.selected_action_ids); if (input.checked) selected.add(action.id); else selected.delete(action.id); e.selected_action_ids = [...selected]; e.confirm_review = false; $("cycle-review-confirm").checked = false; state.dirty = true; controls(); });
      label.append(input,node("span",`${action.description} · Done when: ${action.done_criterion}${action.status === "completed" ? " · already confirmed by you" : " · planned"}`)); section.append(label);
    }
    $("cycle-next-actions").append(section);
  }
}
$("review-cycle").addEventListener("click", () => {
  const selected = []; for (let day=cycleEnd()+1; day<=Math.min(cycleEnd()+7,state.plan.horizon_days); day++) selected.push(...nextCycleActions().filter((a) => a.day_offset === day).slice(0,3).map((a) => a.id));
  state.linkedEditor = {kind:"cycle-review"}; state.linkedEdits = {decision:"keep",reflection:"",selected_action_ids:selected,first_60_seconds:state.plan.cycle_execution.first_60_seconds || state.plan.blueprint.first_cycle.first_60_seconds,confirm_review:false}; state.dirty = false; render(); $("cycle-decision").focus();
});
for (const id of ["cycle-decision","cycle-review-reflection","cycle-next-first","cycle-review-confirm"]) $(id).addEventListener("input", () => {
  const e = state.linkedEdits; e.decision = $("cycle-decision").value; e.reflection = $("cycle-review-reflection").value; e.first_60_seconds = $("cycle-next-first").value; e.confirm_review = id === "cycle-review-confirm" ? $("cycle-review-confirm").checked : false; $("cycle-review-confirm").checked = e.confirm_review; state.dirty = true;
  if (id === "cycle-decision") renderCycleReview(); controls();
});
$("cancel-cycle-review").addEventListener("click", async () => { if (!await confirmDiscard()) return; state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false; render(); });
$("cycle-review-form").addEventListener("submit", (event) => { event.preventDefault(); perform("Saving your cycle review…", async () => {
  if (!cycleReviewValid()) return; const e = state.linkedEdits, advancing = e.decision !== "retire" && cycleEnd() < state.plan.horizon_days;
  const plan = await request(`/halos/${encodeURIComponent(state.plan.id)}/cycle/review`,"POST",{expected_revision:state.plan.revision,decision:e.decision,reflection:e.reflection,selected_action_ids:advancing ? e.selected_action_ids : [],first_60_seconds:advancing && e.decision === "refine" ? e.first_60_seconds : null,confirm_review:e.confirm_review});
  state.plan = plan; state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false; $("history").replaceChildren(); noteSaved(plan); render(); message("Cycle review saved. Earlier check-ins are preserved. No action or condition was automatically completed.");
}); });
function latestCheckins() {
  return new Map((state.plan?.cycle_execution?.daily_logs || []).map((log) => [log.day_offset, log]));
}
function clearCycleForm() {
  $("cycle-form").hidden = true; $("cycle-form-title").textContent = $("cycle-confirm-text").textContent = "";
  $("cycle-day").replaceChildren(); $("cycle-day-actions").textContent = "";
  $("cycle-reflection").value = $("cycle-obstacle").value = "";
  $("cycle-practice").checked = $("cycle-confirm").checked = false;
  $("cycle-reflection").required = $("cycle-confirm").required = false;
}
function renderCycle() {
  const execution = state.plan.cycle_execution, logs = latestCheckins(), total = cycleDays().length;
  $("cycle-start").hidden = !!execution; $("cycle-checkin").hidden = !execution || !!execution.closure;
  $("review-cycle").hidden = !execution || (!!execution.closure && !(execution.closure.decision === "retire" && cycleEnd() < state.plan.horizon_days));
  $("review-cycle").textContent = execution?.closure ? "Start next cycle" : "Review cycle";
  $("cycle-summary").textContent = execution ? `${logs.size} of ${total} plan days have a check-in. ${[...logs.values()].filter((log) => log.practice_done).length} days with practice reported. ${logs.size === total ? "Every day has an entry; review what you learned." : "Choose a plan day to record or update your reflection."} Actions and conditions need their separate evidence checks.` : "Start when you choose. No work is marked complete by starting or checking in.";
  if (execution?.closure) $("cycle-summary").textContent += ` Reviewed: ${execution.closure.decision}. ${cycleEnd() >= state.plan.horizon_days ? "Original horizon reached; no achievement is implied." : "This practice window is closed."}`;
  $("cycle-heading").textContent = execution?.range_start ? `Your 1·60·7 cycle · Plan Days ${execution.range_start}–${execution.range_end}` : "Your 1·60·7 cycle";
  $("cycle-days").replaceChildren();
  for (const day of cycleDays()) {
    const log = logs.get(day.day_offset), item = node("li");
    const actions = state.plan.blueprint.actions.filter((a) => day.action_ids.includes(a.id));
    item.append(node("strong", `Plan Day ${day.day_offset}`), node("p", `${actions.filter((a) => a.status === "completed").length} of ${actions.length} actions have your completion confirmation. ${log ? log.practice_done ? "Practice reported." : "Practice not reported as done." : "No check-in recorded."}`));
    if (log) { item.append(node("p", log.reflection)); if (log.obstacle) item.append(node("p", "Obstacle: " + log.obstacle)); }
    $("cycle-days").append(item);
  }
  $("cycle-log-history").replaceChildren();
  for (const log of execution?.daily_logs || []) $("cycle-log-history").append(node("p", `Plan Day ${log.day_offset} · ${new Date(log.recorded_at).toLocaleString()} · ${log.supersedes_id ? "Updated entry" : "Initial entry"}: ${log.reflection}${log.obstacle ? " · Obstacle: " + log.obstacle : ""}`));
  $("cycle-archive").replaceChildren();
  for (const archived of state.plan.cycle_history || []) {
    const item = node("article"); item.append(node("h4", `Plan Days ${archived.range_start}–${archived.range_end}: ${archived.closure.decision}`), node("p", archived.closure.reflection));
    for (const log of archived.daily_logs) item.append(node("p", `Plan Day ${log.day_offset}: ${log.reflection}${log.obstacle ? " · Obstacle: " + log.obstacle : ""}`)); $("cycle-archive").append(item);
  }
  if (!["cycle-start", "cycle-checkin"].includes(state.linkedEditor?.kind)) { clearCycleForm(); return; }
  const starting = state.linkedEditor.kind === "cycle-start", e = state.linkedEdits;
  $("cycle-form").hidden = false; $("cycle-fields").hidden = starting;
  $("cycle-form-title").textContent = starting ? "Start your first cycle" : "Your daily check-in";
  $("cycle-confirm-text").textContent = starting ? "I choose to start this first cycle. This does not confirm completed work." : "I confirm this practice report and reflection. Updates retain earlier entries.";
  $("cycle-confirm").required = true; $("cycle-confirm").checked = e.confirm_cycle ?? false;
  $("cycle-reflection").required = !starting; $("cycle-reflection").value = e.reflection ?? "";
  $("cycle-obstacle").value = e.obstacle ?? ""; $("cycle-practice").checked = e.practice_done ?? false;
  $("cycle-day").replaceChildren();
  for (const day of cycleDays()) { const option = node("option", `Plan Day ${day.day_offset}${logs.has(day.day_offset) ? " · update check-in" : ""}`); option.value = day.day_offset; $("cycle-day").append(option); }
  $("cycle-day").value = e.day_offset ?? cycleDays()[0].day_offset;
  cycleDayActions();
}
function cycleDayActions() {
  const day = cycleDays().find((d) => d.day_offset === state.linkedEdits.day_offset);
  $("cycle-day-actions").textContent = day ? "Scheduled actions: " + state.plan.blueprint.actions.filter((a) => day.action_ids.includes(a.id)).map((a) => a.description + " — Done when: " + a.done_criterion).join("; ") : "";
}
function chooseCycleDay(day) {
  const log = latestCheckins().get(day);
  state.linkedEdits = {day_offset: day, reflection: log?.reflection ?? "", obstacle: log?.obstacle ?? "", practice_done: log?.practice_done ?? false, confirm_cycle: false};
}
$("cycle-start").addEventListener("click", () => { state.linkedEditor = {kind: "cycle-start"}; state.linkedEdits = {}; state.dirty = false; render(); $("cycle-confirm").focus(); });
$("cycle-checkin").addEventListener("click", () => {
  state.linkedEditor = {kind: "cycle-checkin"}; chooseCycleDay(cycleDays().find((d) => !latestCheckins().has(d.day_offset))?.day_offset ?? cycleDays()[0].day_offset); state.dirty = false; render(); $("cycle-reflection").focus();
});
$("cycle-day").addEventListener("change", async () => {
  const day = Number($("cycle-day").value);
  if (!await confirmDiscard("Changing the plan day clears unsaved check-in changes.")) { $("cycle-day").value = state.linkedEdits.day_offset; return; }
  chooseCycleDay(day); state.dirty = false; render();
});
for (const id of ["cycle-practice", "cycle-reflection", "cycle-obstacle", "cycle-confirm"]) $(id).addEventListener("input", () => {
  Object.assign(state.linkedEdits, {practice_done: $("cycle-practice").checked, reflection: $("cycle-reflection").value, obstacle: $("cycle-obstacle").value, confirm_cycle: $("cycle-confirm").checked}); state.dirty = true; controls();
});
$("cancel-cycle").addEventListener("click", async () => { if (!await confirmDiscard()) return; state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false; render(); });
$("cycle-form").addEventListener("submit", (event) => { event.preventDefault(); perform("Saving your cycle entry…", async () => {
  if (!["cycle-start", "cycle-checkin"].includes(state.linkedEditor?.kind) || state.linkedEdits.confirm_cycle !== true) return;
  const starting = state.linkedEditor.kind === "cycle-start", e = state.linkedEdits;
  const body = starting ? {confirm_start: true} : {day_offset: e.day_offset, reflection: e.reflection, obstacle: e.obstacle?.trim() ? e.obstacle : null, practice_done: e.practice_done ?? false, confirm_checkin: true};
  const plan = await request(`/halos/${encodeURIComponent(state.plan.id)}/cycle/${starting ? "start" : "checkins"}`, "POST", {expected_revision: state.plan.revision, ...body});
  state.plan = plan; state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false; $("history").replaceChildren(); noteSaved(plan); render(); message(starting ? "Your first cycle started. Record action evidence separately as you go." : "Check-in saved. Earlier entries are retained; action completion and condition assessments are unchanged.");
}); });
function clearReplanForm() {
  $("replan-reason").value = $("replan-start").value = "";
  $("replan-reason").required = $("replan-start").required = $("replan-confirm").required = false;
  $("replan-confirm").checked = false; $("replan-steps").replaceChildren(); $("replan-summary").textContent = "";
}
function replanSummary() {
  const p = state.linkedEdits.proposal; if (!p) return;
  $("replan-summary").textContent = `Add ${state.linkedEdits.selected_ids.length} proposed steps in Days ${p.start_day}–${p.end_day}. Preserve ${p.preserved.actions} existing actions, ${p.preserved.conditions} conditions, ${p.preserved.observations} observations, and ${p.preserved.edited_objects} user-edited objects. ${p.preserved.completed_actions} completed actions stay intact. Base revision ${p.base_revision}.${p.skipped_days.length ? " Full first-cycle days skipped: " + p.skipped_days.join(", ") + "." : ""}`;
}
function renderReplanEditor() {
  if (state.linkedEditor?.kind !== "replan") { clearReplanForm(); return; }
  const e = state.linkedEdits, p = e.proposal;
  $("replan-policy").textContent = p ? (p.mode === "llm" ? "AI inference · review required. Based on your saved HALO and replan reason; no external verification or progress assessment was performed." : "Mock defaults based on your saved conditions. Your reason is recorded for review; this preview used no live model.") : "Review new steps before saving. When AI is enabled, your intention, conduct identity, active conditions, nearby saved actions and this reason go to the configured AI provider. Account details, raw observations and history stay out of that request.";
  $("replan-reason").value = e.reason ?? ""; $("replan-start").value = e.start_day ?? (replanStartDay()); $("replan-start").max = state.plan.horizon_days;
  $("replan-reason").required = $("replan-start").required = !p;
  $("replan-review").hidden = !p; $("preview-replan").hidden = !!p;
  $("replan-confirm").required = !!p; $("replan-confirm").checked = e.confirm_accept ?? false;
  $("replan-steps").replaceChildren(); $("replan-summary").textContent = "Previewing does not save or replace work.";
  if (!p) return;
  for (const action of p.actions) {
    const card = node("article", undefined, "replan-step");
    const label = node("label", undefined, "completion-choice"), input = node("input"); input.type = "checkbox"; input.className = "replan-include"; input.checked = e.selected_ids.includes(action.id);
    input.addEventListener("input", () => {
      const selected = new Set(state.linkedEdits.selected_ids); if (input.checked) selected.add(action.id); else selected.delete(action.id);
      state.linkedEdits.selected_ids = [...selected]; state.dirty = true; replanSummary(); controls();
    });
    label.append(input, node("span", `Include Day ${action.day_offset}: ${action.description}`));
    card.append(label, node("p", "Done when: " + action.done_criterion), node("p", `${action.duration_minutes} min estimate · unverified default`));
    $("replan-steps").append(card);
  }
  replanSummary();
}
function retirementBlock(kind, id) {
  const plan = state.plan;
  if (plan.blueprint.dependencies.some((edge) => edge.from_id === id || edge.to_id === id)) return "Remove dependency links first.";
  if (kind === "condition") return plan.blueprint.actions.some((a) => a.condition_ids.includes(id) && a.status !== "retired") ? "Active or completed work still uses this condition." : "";
  const action = plan.blueprint.actions.find((a) => a.id === id);
  if (!action || action.status !== "planned") return "Recorded work stays protected.";
  if (plan.blueprint.first_cycle.days.some((day) => day.action_ids.includes(id) && day.action_ids.length === 1)) return "Add a same-day replacement first.";
  if (plan.wembt.conditions.some((c) => action.condition_ids.includes(c.id) && !c.gap && !plan.blueprint.actions.some((a) => a.id !== id && a.status !== "retired" && a.condition_ids.includes(c.id)))) return "Add replacement condition coverage first.";
  return "";
}
function retireObjectButton(kind, id) {
  const button = node("button", `Retire ${kind}`, "text-button object-button"); button.type = "button";
  const blocked = retirementBlock(kind, id); button.dataset.protected = String(!!blocked);
  button.title = blocked || "Review retirement; earlier snapshots stay available.";
  button.addEventListener("click", () => {
    state.linkedEditor = { kind: "object", operation: "retire_" + kind, id }; state.linkedEdits = {}; state.dirty = false;
    render(); $("object-reason").focus();
  });
  return button;
}
function objectInputsValid() {
  if (state.linkedEditor?.kind !== "object") return false;
  const op = state.linkedEditor.operation, edits = state.linkedEdits;
  if (op.startsWith("retire")) return !!edits.reason?.trim() && edits.confirm_retire === true;
  if (!edits.text?.trim() || !edits.criterion?.trim()) return false;
  if (op === "add_condition") return !!edits.gap?.trim();
  return !!edits.condition_ids?.length && Number.isSafeInteger(edits.day_offset) && edits.day_offset >= 1 && edits.day_offset <= state.plan.horizon_days && Number.isSafeInteger(edits.duration_minutes) && edits.duration_minutes >= 1 && edits.duration_minutes <= 1440;
}
function clearObjectForm() {
  for (const id of ["object-text", "object-criterion", "object-gap", "object-day", "object-duration", "object-reason"]) { $(id).value = ""; $(id).required = false; }
  $("object-conditions").replaceChildren(); $("object-conditions").required = false;
  $("object-confirm").checked = false; $("object-confirm").required = false; $("object-summary").textContent = "";
}
function renderObjectEditor() {
  if (state.linkedEditor?.kind !== "object") { clearObjectForm(); return; }
  const op = state.linkedEditor.operation, retiring = op.startsWith("retire"), condition = op.endsWith("condition");
  $("object-title").textContent = `${retiring ? "Review retirement of" : "Add"} ${condition ? "a condition" : "an action"}`;
  $("object-add-fields").hidden = retiring; $("object-retire-fields").hidden = !retiring;
  $("object-gap-row").hidden = !condition; $("object-action-fields").hidden = condition;
  $("object-text-label").textContent = condition ? "New condition title" : "New action description";
  $("object-criterion-label").textContent = condition ? "New acceptance criterion" : "New done criterion";
  for (const [id, field] of [["object-text", "text"], ["object-criterion", "criterion"], ["object-gap", "gap"], ["object-reason", "reason"]]) $(id).value = state.linkedEdits[field] ?? "";
  $("object-text").required = $("object-criterion").required = !retiring;
  $("object-gap").required = !retiring && condition;
  $("object-reason").required = $("object-confirm").required = retiring;
  $("object-confirm").checked = state.linkedEdits.confirm_retire ?? false;
  $("object-conditions").replaceChildren(); $("object-conditions").required = !retiring && !condition;
  for (const item of state.plan.wembt.conditions.filter((c) => c.review_state !== "retired")) {
    const option = node("option", item.title); option.value = item.id; option.selected = state.linkedEdits.condition_ids?.includes(item.id) ?? false; $("object-conditions").append(option);
  }
  $("object-day").value = state.linkedEdits.day_offset ?? 1; $("object-day").max = state.plan.horizon_days;
  $("object-duration").value = state.linkedEdits.duration_minutes ?? 5;
  $("object-day").required = $("object-duration").required = !retiring && !condition;
  if (retiring) {
    const target = (condition ? state.plan.wembt.conditions : state.plan.blueprint.actions).find((item) => item.id === state.linkedEditor.id);
    $("object-summary").textContent = `${condition ? target.title : target.description} — retirement preserves this object and its evidence in history.`;
  } else $("object-summary").textContent = condition ? "Add an unknown condition with an explicit question for planning its coverage." : "New work starts as planned and must link to an active condition.";
  $("save-object").textContent = retiring ? "Confirm retirement" : condition ? "Save new condition" : "Save new action";
}
const relationLabels = { prerequisite: "Prerequisite", enables: "Enables", constrains: "Constrains" };
function dependencyName(plan, id) {
  const condition = plan.wembt.conditions.find((item) => item.id === id);
  return condition ? "Condition: " + condition.title : "Action: " + (plan.blueprint.actions.find((item) => item.id === id)?.description || "Unknown node");
}
function dependencyProtected(id) {
  const pending = [id], visited = new Set();
  while (pending.length) {
    const key = pending.pop(); if (visited.has(key)) continue; visited.add(key);
    const action = state.plan.blueprint.actions.find((item) => item.id === key);
    const condition = state.plan.wembt.conditions.find((item) => item.id === key);
    if ((!action && !condition) || (action && (action.status !== "planned" || action.review_state === "retired")) || condition?.review_state === "retired") return true;
    for (const edge of state.plan.blueprint.dependencies) if (edge.from_id === key) pending.push(edge.to_id);
    if (condition) for (const item of state.plan.blueprint.actions) if (item.condition_ids.includes(key)) pending.push(item.id);
  }
  return false;
}
function clearDependencyForm() {
  for (const id of ["dependency-from", "dependency-to"]) { $(id).replaceChildren(); $(id).required = false; }
  $("dependency-reason").value = ""; $("dependency-confirm").checked = false; $("dependency-confirm").required = false;
  $("dependency-relation").value = "prerequisite";
  $("dependency-removal").textContent = "";
}
function renderDependencies() {
  $("dependencies").replaceChildren();
  if (!state.plan.blueprint.dependencies.length) $("dependencies").append(node("p", "No explicit dependencies yet."));
  for (const edge of state.plan.blueprint.dependencies) {
    const row = node("article", undefined, "dependency-row");
    row.append(node("p", `${dependencyName(state.plan, edge.from_id)} → ${dependencyName(state.plan, edge.to_id)}`), node("p", `${relationLabels[edge.relation]} · ${edge.rationale}`));
    const remove = node("button", "Remove link", "text-button remove-dependency"); remove.type = "button";
    remove.dataset.protected = String(dependencyProtected(edge.from_id) || dependencyProtected(edge.to_id));
    remove.title = "Links involving recorded work stay protected.";
    remove.addEventListener("click", () => {
      state.linkedEditor = { kind: "dependency", mode: "remove", ...edge }; state.linkedEdits = {}; state.dirty = false;
      render(); $("dependency-reason").focus();
    });
    row.append(remove); $("dependencies").append(row);
  }
  if (state.linkedEditor?.kind !== "dependency") { clearDependencyForm(); return; }
  const removing = state.linkedEditor.mode === "remove";
  $("dependency-title").textContent = removing ? "Review link removal" : "Add a dependency";
  $("dependency-add-fields").hidden = removing;
  $("dependency-removal").hidden = !removing;
  $("dependency-confirm-row").hidden = !removing;
  $("dependency-confirm").required = removing;
  $("dependency-reason-label").textContent = removing ? "Why remove this link?" : "Why is this link needed?";
  $("save-dependency").textContent = removing ? "Confirm link removal" : "Save dependency";
  if (removing) $("dependency-removal").textContent = `${dependencyName(state.plan, state.linkedEditor.from_id)} → ${dependencyName(state.plan, state.linkedEditor.to_id)} · ${relationLabels[state.linkedEditor.relation]}`;
  for (const [id, field] of [["dependency-from", "from_id"], ["dependency-to", "to_id"]]) {
    const empty = node("option", "Choose a condition or action"); empty.value = ""; $(id).replaceChildren(empty); $(id).required = !removing;
    for (const item of [...state.plan.wembt.conditions, ...state.plan.blueprint.actions]) {
      const option = node("option", dependencyName(state.plan, item.id)); option.value = item.id; option.disabled = dependencyProtected(item.id); $(id).append(option);
    }
    $(id).value = state.linkedEdits[field] ?? "";
  }
  $("dependency-relation").value = state.linkedEdits.relation ?? "prerequisite";
  $("dependency-reason").value = state.linkedEdits.reason ?? "";
  $("dependency-confirm").checked = state.linkedEdits.confirm_remove ?? false;
}
function renderReports() {
  $("reports").replaceChildren();
  if (!state.plan.evidence.length) $("reports").append(node("p", "No reports yet. Record what happened from a Timeline action or Milestone condition."));
  const corrected = new Set(state.plan.sources.map((s) => (s.locator || "").startsWith("halo-evidence-correction:") ? s.locator.slice(25) : null));
  for (const entry of state.plan.evidence) {
    const row = node("article"); row.append(node("p", observationText(entry)));
    const correction = entry.source_refs.some((id) => state.plan.sources.some((s) => s.id === id && (s.locator || "").startsWith("halo-evidence-correction:")));
    if (correction) row.append(node("p", "Correction · does not establish progress"));
    if (corrected.has(entry.id)) row.append(node("p", "Superseded by a correction; original retained"));
    else if (entry.kind === "user_report") {
      const button = node("button", "Correct report", "object-button"); button.type = "button";
      button.addEventListener("click", () => { state.linkedEditor = {kind: "correction", id: entry.id}; state.linkedEdits = {}; state.dirty = false; render(); $("observation-description").focus(); }); row.append(button);
    }
    $("reports").append(row);
  }
}
function clearObservationForm() {
  $("observation-action").textContent = $("observation-criterion").textContent = "";
  $("observation-description").value = ""; $("observation-complete").checked = false;
  $("observation-complete").required = false;
  $("condition-assessment").value = ""; $("condition-assessment").required = false;
}
function renderObservationEditor() {
  if (!["observation", "condition-check", "reopen", "correction"].includes(state.linkedEditor?.kind)) { clearObservationForm(); return; }
  const condition = state.linkedEditor.kind === "condition-check", reopening = state.linkedEditor.kind === "reopen", target = linkedTarget();
  if (state.linkedEditor.kind === "correction") {
    $("observation-title").textContent = "Correct a report";
    $("observation-description-label").textContent = "Corrected observation";
    $("observation-action").textContent = "Original: " + target.description;
    const actions = state.plan.blueprint.actions.filter((a) => a.evidence_ids.includes(target.id));
    const conditions = state.plan.wembt.conditions.filter((c) => c.evidence_ids.includes(target.id));
    $("observation-criterion").textContent = `${actions.length} affected actions; ${conditions.length} affected conditions. Completed actions return to planned; conditions return to unknown. Retired work stays retired.`;
    $("observation-description").value = state.linkedEdits.description ?? "";
    $("completion-choice").hidden = false; $("condition-assessment-row").hidden = true; $("condition-assessment").required = false;
    $("observation-complete").required = true; $("observation-complete").checked = state.linkedEdits.confirm_completion ?? false;
    $("completion-choice-text").textContent = "I confirm this correction and the progress resets described above.";
    $("observation-explanation").textContent = "The original report and history remain available. This correction is not evidence of progress; record a fresh observation before confirming work again.";
    $("save-observation").textContent = "Save correction"; return;
  }

  $("observation-title").textContent = condition ? "Check this condition" : reopening ? "Reopen this action" : "Record what happened";
  $("observation-description-label").textContent = reopening ? "Why reopen this action?" : "What did you observe?";
  $("observation-action").textContent = condition ? target.title : target.description;
  $("observation-criterion").textContent = condition ? "Acceptance criterion: " + target.acceptance_criterion : "Done when: " + target.done_criterion;
  $("observation-description").value = state.linkedEdits.description ?? "";
  $("observation-complete").checked = state.linkedEdits.confirm_completion ?? false;
  $("observation-complete").required = reopening;
  $("completion-choice-text").textContent = reopening ? "I confirm this action should return to planned." : "I confirm I completed this action and met its done criterion.";
  $("completion-choice").hidden = condition;
  $("condition-assessment-row").hidden = !condition; $("condition-assessment").required = condition;
  $("condition-assessment").value = state.linkedEdits.assessment ?? "";
  $("observation-explanation").textContent = condition ? "Choose what your observation supports. This remains your report, not independent verification. Linked actions and prior evidence stay unchanged." : reopening ? "This returns the action to planned in a new revision. Earlier completion and evidence remain in history. Condition assessments stay unchanged." : "Saved as your report, not independent verification. Leave completion unchecked to record a note only. Elapsed time alone does not demonstrate external work.";
  $("save-observation").textContent = condition ? "Save condition check" : reopening ? "Confirm reopening" : "Save observation";
}
function renderScheduleDiff() {
  const moves = Object.entries(state.linkedEdits).filter(([id, day]) => day !== state.plan.blueprint.actions.find((a) => a.id === id)?.day_offset);
  state.dirty = moves.length > 0;
  $("schedule-diff").replaceChildren(...moves.map(([id, day]) => {
    const action = state.plan.blueprint.actions.find((a) => a.id === id);
    return node("p", `${action.description}: Day ${action.day_offset} → ${Number.isSafeInteger(day) ? "Day " + day : "choose a whole day"}`);
  }));
  $("schedule-state").textContent = state.dirty ? "Review these moves before saving. No work is marked complete." : "Choose days to propose a schedule change.";
}
function renderScheduleEditor() {
  $("schedule-fields").replaceChildren(); $("schedule-diff").replaceChildren();
  if (state.linkedEditor?.kind !== "schedule") return;
  for (const action of state.plan.blueprint.actions) {
    if (action.status !== "planned") continue;
    const row = node("div", undefined, "schedule-row");
    const id = "schedule-" + action.id;
    const label = node("label", `Day for: ${action.description}`); label.htmlFor = id;
    const input = node("input"); input.id = id; input.className = "schedule-day";
    input.type = "number"; input.min = "1"; input.max = String(state.plan.horizon_days); input.step = "1"; input.required = true;
    input.value = state.linkedEdits[action.id] ?? action.day_offset;
    input.addEventListener("input", () => { state.linkedEdits[action.id] = input.valueAsNumber; renderScheduleDiff(); controls(); });
    row.append(label, input); $("schedule-fields").append(row);
  }
  renderScheduleDiff();
}
function editLinkedButton(kind, id, title, protectedWork) {
  const button = node("button", kind === "condition" ? "Edit condition" : "Edit action", "text-button linked-edit-button");
  button.type = "button"; button.dataset.protected = String(protectedWork);
  button.setAttribute("aria-label", `Edit ${kind}: ${title}`);
  button.title = protectedWork ? "Recorded work stays unchanged." : `Edit ${kind}`;
  button.addEventListener("click", () => {
    state.linkedEditor = { kind, id }; state.linkedEdits = {}; state.edits = {}; state.dirty = false;
    render(); $("linked-first").focus();
  });
  return button;
}
function linkedTarget() {
  if (!state.linkedEditor || !state.plan || ["schedule", "dependency", "object", "replan", "cycle-start", "cycle-checkin", "cycle-review", "replacement", "condition-replacement", "delete"].includes(state.linkedEditor.kind)) return null;
  if (state.linkedEditor.kind === "correction") return state.plan.evidence.find((e) => e.id === state.linkedEditor.id);
  return (["condition", "condition-check"].includes(state.linkedEditor.kind) ? state.plan.wembt.conditions : state.plan.blueprint.actions).find((item) => item.id === state.linkedEditor.id);
}
function renderLinkedEditor() {
  const target = ["observation", "condition-check", "reopen", "correction"].includes(state.linkedEditor?.kind) ? null : linkedTarget(); if (!target) { for (const id of ["linked-first", "linked-second", "linked-duration"]) $(id).value = ""; $("linked-duration").required = false; return; }
  const condition = state.linkedEditor.kind === "condition";
  $("linked-editor-title").textContent = condition ? "Edit condition" : "Edit planned action";
  $("linked-editor-note").textContent = condition ? "Changing a condition marks linked planned actions for review. It does not establish progress." : "Change the proposed work without changing recorded evidence or the schedule.";
  $("linked-first-label").textContent = condition ? "Condition title" : "Action description";
  $("linked-second-label").textContent = condition ? "Acceptance criterion" : "Done criterion";
  $("linked-first").value = state.linkedEdits[condition ? "title" : "description"] ?? target[condition ? "title" : "description"];
  $("linked-second").value = state.linkedEdits[condition ? "acceptance_criterion" : "done_criterion"] ?? target[condition ? "acceptance_criterion" : "done_criterion"];
  $("linked-duration-row").hidden = condition; $("linked-duration").required = !condition;
  $("linked-duration").value = condition ? "" : state.linkedEdits.duration_minutes ?? target.duration_minutes;
  $("save-linked").textContent = condition ? "Save condition" : "Save action";
  $("linked-edit-state").textContent = state.dirty ? "Unsaved changes · the saved revision is unchanged." : "Changes stay here until you save.";
}
async function refreshRecent() { const result = await request("/halos"); state.recent = result.halos; renderRecent(); }
function noteSaved(plan) { state.recent = [{ id: plan.id, intention: plan.intention, revision: plan.revision }, ...state.recent.filter((item) => item.id !== plan.id)].slice(0, 20); }
async function openSaved(id) {
  if (!await confirmDiscard()) return;
  await perform("Opening your HALO…", async () => {
    const plan = await request("/halos/" + encodeURIComponent(id));
    clearWork(); Object.assign(state, { plan, saved: true, entryText: "" }); render(); document.querySelector(".recent-menu").open = false; $("review").focus(); message("Your saved HALO is ready.");
  });
}
$("connect").addEventListener("click", async () => {
  if (!auth.available) { message("Account sign-in is not connected in this workspace yet. You can explore an example."); return; }
  const previousOwner = state.owner, previousToken = state.token, previousLocked = state.locked;
  abortRequests(); state.token = null; state.locked = true; render();
  await perform("Connecting your account…", async (epoch) => {
    try { await auth.signIn(); current(epoch); }
    catch (error) {
      if (error.name === "AbortError" && epoch === state.epoch) {
        state.token = previousToken; state.locked = previousLocked; render();
        message("Sign-in cancelled. Your entries are still here.");
      }
      throw error;
    }
    const token = await auth.getAccessToken(); current(epoch);
    if (typeof token !== "string" || !token) throw Object.assign(new Error(), { status: 401 });
    state.token = token; const session = await request("/session");
    if (previousOwner !== session.owner_id) { clearWork(); state.recent = []; }
    if (previousOwner && previousOwner !== session.owner_id) { state.entryText = ""; $("horizon").value = "90"; $("custom-days").value = "30"; $("custom-days").hidden = $("custom-label").hidden = true; }
    state.owner = session.owner_id; state.locked = false;
    await refreshRecent();
    if (!state.plan && !state.entryText.trim() && state.recent.length) { state.plan = await request("/halos/" + encodeURIComponent(state.recent[0].id)); state.saved = true; }
    render(); message(previousOwner && previousOwner !== session.owner_id ? "Connected to a different account. The previous account's unsaved work was cleared from this tab." : state.dirty ? "Connected. Your unsaved edits are still here." : "Connected. Your workspace is ready.");
  });
});
function clearAccount(text) {
  abortRequests(); clearWork();
  Object.assign(state, { owner: null, token: null, locked: false, recent: [], entryText: "" });
  $("horizon").value = "90"; $("custom-days").value = "30"; $("custom-days").required = false;
  $("custom-days").hidden = $("custom-label").hidden = true;
  retryOperation = null; render(); $("error-actions").hidden = true; message(text);
}
$("disconnect").addEventListener("click", async () => {
  if (!await confirmDiscard("Signing out clears unsaved work from this tab.")) return;
  clearAccount("Signed out of this HALO workspace.");
  state.busy = true; controls();
  try { await auth.signOut(); } catch { message("Your HALO tab is cleared. Your identity provider may still be signed in.", true); }
  finally { state.busy = false; controls(); }
});
$("new-halo").addEventListener("click", async () => { if (!await confirmDiscard()) return; clearWork(); state.entryText = ""; retryOperation = null; $("error-actions").hidden = true; render(); message(""); $("intention").value = ""; $("intention").focus(); });
$("example").addEventListener("click", async () => {
  if (!await confirmDiscard()) return;
  await perform("Opening an example…", async () => { const plan = await request(new URL("./example.json", import.meta.url).href, "GET", null, true); clearWork(); Object.assign(state, { plan, sample: true, entryText: "" }); render(); message("An illustrative example, not an expert-reviewed plan or saved work."); });
});
$("intention").addEventListener("input", () => { state.entryText = $("intention").value; });
$("horizon").addEventListener("change", () => { const custom = $("horizon").value === "custom"; $("custom-days").hidden = $("custom-label").hidden = !custom; $("custom-days").required = custom; });
$("generate-form").addEventListener("submit", async (event) => {
  event.preventDefault(); if (!$("intention").value.trim()) return;
  if (!state.token || state.locked) {
    if (auth.available) $("connect").click();
    else message("Account connection is unavailable. Explore an example while setup is completed.", true);
    return;
  }
  const intention = $("intention").value;
  const horizon = Number($("horizon").value === "custom" ? $("custom-days").value : $("horizon").value);
  if (!Number.isSafeInteger(horizon) || horizon < 1) { message("Choose a positive whole number of days.", true); return; }
  await perform("Creating your draft…", async () => { const result = await aiRequest("/halos/generate", { intention, horizon_days: horizon }); clearWork(); Object.assign(state, { plan: result.plan, receipt: result.draft_receipt }); render(); message("Your draft is ready. Review its assumptions before saving."); $("review").focus(); });
});
$("save-draft").addEventListener("click", () => perform("Saving your HALO…", async () => {
  const plan = await request("/halos", "POST", { draft_receipt: state.receipt }); state.plan = plan; state.saved = true; noteSaved(plan); render();
  message("Saved. Your revision is recorded.");
}));
$("edit-identity").addEventListener("click", () => { state.editing = true; state.edits = {}; render(); $("edit-statement").focus(); });
for (const [field, id] of Object.entries(editFields)) $(id).addEventListener("input", () => { state.edits[field] = $(id).value; state.dirty = Object.entries(state.edits).some(([key, value]) => value !== state.plan.identity_card[key]); $("edit-state").textContent = state.dirty ? "Unsaved edits · your saved revision is unchanged." : "Changes stay here until you save."; controls(); });
$("cancel-edit").addEventListener("click", async () => { if (!await confirmDiscard()) return; state.editing = state.dirty = false; state.edits = {}; render(); });
$("identity-form").addEventListener("submit", (event) => {
  event.preventDefault();
  perform("Saving your changes…", async () => {
    const changes = Object.fromEntries(Object.entries(state.edits).filter(([key, value]) => value !== state.plan.identity_card[key]));
    const plan = await request(`/halos/${encodeURIComponent(state.plan.id)}/identity`, "PATCH", { expected_revision: state.plan.revision, changes });
    state.plan = plan; state.dirty = state.editing = false; state.edits = {}; $("history").replaceChildren(); noteSaved(plan); render(); message("Changes saved as a new revision. Your linked actions and evidence are preserved.");
  });
});
for (const [id, position] of [["linked-first", 0], ["linked-second", 1], ["linked-duration", 2]]) $(id).addEventListener("input", () => {
  const target = linkedTarget(); if (!target) return;
  const fields = state.linkedEditor.kind === "condition" ? ["title", "acceptance_criterion"] : ["description", "done_criterion", "duration_minutes"];
  const field = fields[position]; if (!field) return;
  state.linkedEdits[field] = position === 2 ? $(id).valueAsNumber : $(id).value;
  state.dirty = Object.entries(state.linkedEdits).some(([key, value]) => value !== target[key]);
  $("linked-edit-state").textContent = state.dirty ? "Unsaved changes · the saved revision is unchanged." : "Changes stay here until you save."; controls();
});
$("cancel-linked").addEventListener("click", async () => {
  if (!await confirmDiscard()) return; state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false; render();
});
$("edit-schedule").addEventListener("click", () => {
  state.linkedEditor = { kind: "schedule" }; state.linkedEdits = {}; state.dirty = false;
  render(); document.querySelector(".schedule-day")?.focus();
});
$("cancel-schedule").addEventListener("click", async () => {
  if (!await confirmDiscard()) return;
  state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false; render();
});
$("schedule-form").addEventListener("submit", (event) => {
  event.preventDefault();
  perform("Saving your schedule…", async () => {
    if (state.linkedEditor?.kind !== "schedule") return;
    const moves = Object.fromEntries(Object.entries(state.linkedEdits).filter(([id, day]) => day !== state.plan.blueprint.actions.find((a) => a.id === id)?.day_offset));
    if (!Object.keys(moves).length || Object.values(moves).some((day) => !Number.isSafeInteger(day) || day < 1 || day > state.plan.horizon_days)) return;
    const plan = await request(`/halos/${encodeURIComponent(state.plan.id)}/schedule`, "PATCH", { expected_revision: state.plan.revision, moves });
    state.plan = plan; state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false;
    $("history").replaceChildren(); noteSaved(plan); render(); message("Schedule saved as a new revision. Review the proposed days; no work was marked complete.");
  });
});
for (const id of ["observation-description", "observation-complete", "condition-assessment"]) $(id).addEventListener("input", () => {
  if (!["observation", "condition-check", "reopen", "correction"].includes(state.linkedEditor?.kind)) return;
  state.linkedEdits.description = $("observation-description").value;
  state.linkedEdits.confirm_completion = $("observation-complete").checked;
  state.linkedEdits.assessment = $("condition-assessment").value;
  state.dirty = !!state.linkedEdits.description || state.linkedEdits.confirm_completion || !!state.linkedEdits.assessment; controls();
});
$("cancel-observation").addEventListener("click", async () => {
  if (!await confirmDiscard()) return;
  state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false; render();
});
$("observation-form").addEventListener("submit", (event) => {
  event.preventDefault();
  perform(state.linkedEditor?.kind === "reopen" ? "Reopening your action…" : "Recording your observation…", async () => {
    if (!["observation", "condition-check", "reopen", "correction"].includes(state.linkedEditor?.kind) || !state.linkedEdits.description?.trim()) return;
    const condition = state.linkedEditor.kind === "condition-check", reopening = state.linkedEditor.kind === "reopen";
    if (state.linkedEditor.kind === "correction") {
      if (state.linkedEdits.confirm_completion !== true) return;
      const plan = await request(`/halos/${encodeURIComponent(state.plan.id)}/evidence/${encodeURIComponent(state.linkedEditor.id)}/correct`, "POST", {expected_revision: state.plan.revision, description: state.linkedEdits.description, confirm_correction: true});
      state.plan = plan; state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false;
      $("history").replaceChildren(); noteSaved(plan); render(); message("Correction saved. Original report retained; affected progress needs fresh checking."); return;
    }

    if (condition && !["unknown", "unsatisfied", "satisfied"].includes(state.linkedEdits.assessment)) return;
    if (reopening && state.linkedEdits.confirm_completion !== true) { message("Confirm that this action should return to planned before continuing.", true); return; }
    const suffix = condition ? `conditions/${encodeURIComponent(state.linkedEditor.id)}/checks` : `actions/${encodeURIComponent(state.linkedEditor.id)}/${reopening ? "reopen" : "observations"}`;
    const plan = await request(`/halos/${encodeURIComponent(state.plan.id)}/${suffix}`, "POST", {
      expected_revision: state.plan.revision,
      ...(reopening ? { reason: state.linkedEdits.description, confirm_reopen: state.linkedEdits.confirm_completion } : { description: state.linkedEdits.description, ...(condition ? { assessment: state.linkedEdits.assessment } : { confirm_completion: state.linkedEdits.confirm_completion ?? false }) }),
    });
    const completed = state.linkedEdits.confirm_completion;
    state.plan = plan; state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false;
    $("history").replaceChildren(); noteSaved(plan); render();
    message(reopening ? "Action reopened as planned. Earlier completion and evidence remain in history." : condition ? "Condition check saved as your report. Linked actions and prior evidence are preserved." : completed ? "Your completion confirmation and observation were saved. Conditions still need separate checking." : "Observation saved as a user report. The action remains proposed.");
  });
});
$("linked-form").addEventListener("submit", (event) => {
  event.preventDefault();
  perform("Saving your linked changes…", async () => {
    const target = linkedTarget(); if (!target) return;
    const changes = Object.fromEntries(Object.entries(state.linkedEdits).filter(([key, value]) => value !== target[key]));
    const kind = state.linkedEditor.kind === "condition" ? "conditions" : "actions";
    const plan = await request(`/halos/${encodeURIComponent(state.plan.id)}/${kind}/${encodeURIComponent(target.id)}`, "PATCH", { expected_revision: state.plan.revision, changes });
    state.plan = plan; state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false;
    $("history").replaceChildren(); noteSaved(plan); render(); message("Changes saved as a new revision. Review the affected work before continuing.");
  });
});
$("load-history").addEventListener("click", () => perform("Loading revision history…", async () => {
  const result = await request(`/halos/${encodeURIComponent(state.plan.id)}/history`);
  $("history").replaceChildren(...result.revisions.map((plan) => {
    const li = node("li"); li.append(node("strong", `Revision ${plan.revision}`), node("p", plan.identity_card.statement), node("p", plan.identity_card.question));
    const details = node("details"); details.append(node("summary", "View conditions and actions in this revision"));
    if (plan.blueprint.story) for (const [key,label] of Object.entries(storyLabels)) details.append(node("p", `${label}: ${plan.blueprint.story[key]}`));
    for (const condition of plan.wembt.conditions) details.append(node("p", `Condition: ${condition.title} — ${condition.acceptance_criterion} · ${conditionStatus(condition)}`));
    for (const edge of plan.blueprint.dependencies) details.append(node("p", `Link: ${dependencyName(plan, edge.from_id)} → ${dependencyName(plan, edge.to_id)} · ${relationLabels[edge.relation]} · ${edge.rationale}`));
    for (const action of plan.blueprint.actions) details.append(node("p", `Action: ${action.description} — ${action.done_criterion} · Day ${action.day_offset} · ${action.duration_minutes} min · ${action.status}`));
    for (const evidence of plan.evidence) details.append(node("p", observationText(evidence)));
    for (const execution of cycleExecutions(plan)) for (const log of execution.daily_logs) details.append(node("p", `Plan Day ${log.day_offset} practice check-in: ${log.reflection}${log.obstacle ? " · Obstacle: " + log.obstacle : ""}`));
    li.append(details); return li;
  }));
  $("history-empty").textContent = "Earlier snapshots remain unchanged."; message("Revision history loaded.");
}));
$("retry").addEventListener("click", () => retryOperation?.());
$("replan-button").addEventListener("click", () => {
  state.linkedEditor = { kind: "replan" }; state.linkedEdits = {}; state.dirty = false;
  render(); $("replan-reason").focus();
});
for (const id of ["replan-reason", "replan-start"]) $(id).addEventListener("input", () => {
  if (state.linkedEditor?.kind !== "replan" || state.linkedEdits.proposal) return;
  state.linkedEdits.reason = $("replan-reason").value; state.linkedEdits.start_day = $("replan-start").valueAsNumber;
  state.dirty = !!state.linkedEdits.reason || state.linkedEdits.start_day !== (replanStartDay()); controls();
});
$("replan-confirm").addEventListener("input", () => { if (state.linkedEditor?.kind === "replan") { state.linkedEdits.confirm_accept = $("replan-confirm").checked; controls(); } });
$("cancel-replan").addEventListener("click", async () => {
  if (!await confirmDiscard()) return;
  state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false; render();
});
$("revise-replan").addEventListener("click", async () => {
  if (!await confirmDiscard("This temporary proposal will be replaced. Saved work stays unchanged.")) return;
  state.linkedEdits = { reason: state.linkedEdits.reason, start_day: state.linkedEdits.start_day }; state.dirty = true; render(); $("replan-reason").focus();
});
$("replan-form").addEventListener("submit", (event) => {
  event.preventDefault();
  perform("Preparing a replan preview…", async () => {
    if (state.linkedEditor?.kind !== "replan" || state.linkedEdits.proposal || !state.linkedEdits.reason?.trim()) return;
    const result = await aiRequest(`/halos/${encodeURIComponent(state.plan.id)}/replan`, { expected_revision: state.plan.revision, start_day: state.linkedEdits.start_day, reason: state.linkedEdits.reason });
    Object.assign(state.linkedEdits, { proposal: result.proposal, proposal_receipt: result.proposal_receipt, selected_ids: result.proposal.actions.map((a) => a.id), confirm_accept: false });
    state.dirty = true; render(); message(`${result.proposal.mode === "llm" ? "AI" : "Mock"} proposal ready for review. Your saved HALO is unchanged.`);
  });
});
$("accept-replan").addEventListener("click", () => perform("Saving selected proposed steps…", async () => {
  const e = state.linkedEdits;
  if (state.linkedEditor?.kind !== "replan" || !e.proposal || !e.selected_ids?.length || e.confirm_accept !== true) { message("Select steps and explicitly confirm acceptance before continuing.", true); return; }
  const plan = await request(`/halos/${encodeURIComponent(state.plan.id)}/replan/accept`, "POST", { expected_revision: e.proposal.base_revision, proposal_receipt: e.proposal_receipt, selected_action_ids: e.selected_ids, confirm_accept: e.confirm_accept });
  state.plan = plan; state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false;
  $("history").replaceChildren(); noteSaved(plan); render(); message("Selected steps saved as a new revision. Existing work and evidence are preserved.");
}));
for (const kind of ["condition", "action"]) $("add-" + kind).addEventListener("click", () => {
  state.linkedEditor = { kind: "object", operation: "add_" + kind }; state.linkedEdits = {}; state.dirty = false;
  render(); $("object-text").focus();
});
for (const id of ["object-text", "object-criterion", "object-gap", "object-conditions", "object-day", "object-duration", "object-reason", "object-confirm"]) $(id).addEventListener("input", () => {
  if (state.linkedEditor?.kind !== "object") return;
  state.linkedEdits = { text: $("object-text").value, criterion: $("object-criterion").value, gap: $("object-gap").value, condition_ids: [...$("object-conditions").selectedOptions].map((option) => option.value), day_offset: $("object-day").valueAsNumber, duration_minutes: $("object-duration").valueAsNumber, reason: $("object-reason").value, confirm_retire: $("object-confirm").checked };
  const e = state.linkedEdits;
  state.dirty = !!e.text || !!e.criterion || !!e.gap || !!e.reason || e.confirm_retire || !!e.condition_ids.length || e.day_offset !== 1 || e.duration_minutes !== 5; controls();
});
$("cancel-object").addEventListener("click", async () => {
  if (!await confirmDiscard()) return;
  state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false; render();
});
$("object-form").addEventListener("submit", (event) => {
  event.preventDefault();
  perform("Saving your plan change…", async () => {
    if (!objectInputsValid()) { message("Complete the fields and confirm any retirement before continuing.", true); return; }
    const editor = state.linkedEditor, e = state.linkedEdits, retiring = editor.operation.startsWith("retire"), condition = editor.operation.endsWith("condition");
    const suffix = `${condition ? "conditions" : "actions"}${retiring ? "/" + encodeURIComponent(editor.id) + "/retire" : ""}`;
    const changes = retiring ? { reason: e.reason, confirm_retire: e.confirm_retire } : condition ? { title: e.text, acceptance_criterion: e.criterion, gap: e.gap } : { description: e.text, done_criterion: e.criterion, condition_ids: e.condition_ids, day_offset: e.day_offset, duration_minutes: e.duration_minutes };
    const plan = await request(`/halos/${encodeURIComponent(state.plan.id)}/${suffix}`, "POST", { expected_revision: state.plan.revision, ...changes });
    state.plan = plan; state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false;
    $("history").replaceChildren(); noteSaved(plan); render(); message(retiring ? "Object retired from this plan. Earlier work and evidence remain in history." : "New planning object saved. No condition was verified and no work was marked complete.");
  });
});
$("add-dependency").addEventListener("click", () => {
  state.linkedEditor = { kind: "dependency", mode: "add" }; state.linkedEdits = {}; state.dirty = false;
  render(); $("dependency-from").focus();
});
for (const id of ["dependency-from", "dependency-to", "dependency-relation", "dependency-reason", "dependency-confirm"]) $(id).addEventListener("input", () => {
  if (state.linkedEditor?.kind !== "dependency") return;
  state.linkedEdits = { from_id: $("dependency-from").value, to_id: $("dependency-to").value, relation: $("dependency-relation").value, reason: $("dependency-reason").value, confirm_remove: $("dependency-confirm").checked };
  state.dirty = !!state.linkedEdits.reason || state.linkedEdits.confirm_remove || (state.linkedEditor.mode === "add" && (!!state.linkedEdits.from_id || !!state.linkedEdits.to_id || state.linkedEdits.relation !== "prerequisite")); controls();
});
$("cancel-dependency").addEventListener("click", async () => {
  if (!await confirmDiscard()) return;
  state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false; render();
});
$("dependency-form").addEventListener("submit", (event) => {
  event.preventDefault();
  perform("Saving your dependency change…", async () => {
    if (state.linkedEditor?.kind !== "dependency") return;
    const removing = state.linkedEditor.mode === "remove", fields = removing ? state.linkedEditor : state.linkedEdits;
    if (!state.linkedEdits.reason?.trim() || !fields.from_id || !fields.to_id || (removing && state.linkedEdits.confirm_remove !== true)) { message("Choose both nodes, enter a reason, and confirm any removal before continuing.", true); return; }
    const plan = await request(`/halos/${encodeURIComponent(state.plan.id)}/dependencies`, "POST", {
      expected_revision: state.plan.revision, operation: removing ? "remove" : "add", from_id: fields.from_id, to_id: fields.to_id, relation: fields.relation || "prerequisite", reason: state.linkedEdits.reason, confirm_remove: removing && state.linkedEdits.confirm_remove,
    });
    state.plan = plan; state.linkedEditor = null; state.linkedEdits = {}; state.dirty = false;
    $("history").replaceChildren(); noteSaved(plan); render(); message("Dependency change saved as a new revision. Earlier graphs remain in history; no progress was recorded.");
  });
});
$("export-halo").addEventListener("click", () => {
  const planId = state.plan?.id, owner = state.owner;
  perform("Preparing your saved HALO download…", async () => {
    if (!planId || state.plan?.id !== planId || state.owner !== owner || !state.saved || state.locked) return;
    const result = await request(`/halos/${encodeURIComponent(planId)}/export`);
    if (result.format !== "halo-export" || result.version !== 1 || result.halo_id !== planId ||
        !Number.isSafeInteger(result.latest_revision) || result.latest_revision < 1 ||
        !Array.isArray(result.revisions) || result.revisions.length !== result.latest_revision ||
        !result.revisions.every((plan, index) => plan && plan.id === planId && plan.owner_id === owner && plan.revision === index + 1)) {
      throw new Error("Invalid export response");
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
    const link = node("a"); link.href = url;
    link.download = `halo-${planId}-revision-${result.latest_revision}.json`;
    link.hidden = true; document.body.append(link);
    try { link.click(); }
    finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    message(`Download prepared with saved revisions 1–${result.latest_revision}. Your unsaved edits stay in this tab.`);
  });
});
$("reload").addEventListener("click", () => state.plan && openSaved(state.plan.id));
$("regenerate").addEventListener("click", async () => {
  if (!state.plan || !await confirmDiscard("A fresh draft will replace this unsaved draft.")) return;
  const intention = state.plan.intention, horizon_days = state.plan.horizon_days;
  perform("Creating a fresh draft…", async () => { const result = await aiRequest("/halos/generate", { intention, horizon_days }); clearWork(); Object.assign(state, { plan: result.plan, receipt: result.draft_receipt }); render(); message("Your fresh draft is ready to review and save."); });
});
$("mobile-saved").addEventListener("change", () => { if ($("mobile-saved").value) openSaved($("mobile-saved").value); $("mobile-saved").value = ""; });
$("help").addEventListener("click", () => $("help-dialog").showModal());
$("close-help").addEventListener("click", () => $("help-dialog").close());
window.addEventListener("beforeunload", (event) => { if (state.dirty || (state.plan && !state.saved && !state.sample) || (!state.plan && state.entryText.trim())) { event.preventDefault(); event.returnValue = ""; } });
render();

// The host reports session changes only; /session still verifies owner authority.
if (auth.available && typeof auth.subscribe === "function") auth.subscribe((signedIn) => {
  if (signedIn === false) {
    if (state.owner || state.token || state.locked) clearAccount("Your account signed out. Private work was cleared from this tab.");
  } else if (signedIn === true) {
    $("connect").click();
  }
});
if (auth.available && auth.autoConnect === true) {
  Promise.resolve().then(() => auth.getAccessToken()).then((token) => { if (token && !state.owner && !state.busy) $("connect").click(); }).catch(() => {});
}

window.addEventListener("pagehide", () => {
  if (!state.owner) return;
  abortRequests(); state.token = null; state.locked = true; render();
});
window.addEventListener("pageshow", (event) => {
  if (!event.persisted || !state.owner) return;
  abortRequests(); state.token = null; state.locked = true; render();
  const epoch = state.epoch;
  Promise.resolve().then(() => auth.getAccessToken()).then((token) => {
    if (epoch !== state.epoch) return;
    if (token) $("connect").click();
    else clearAccount("Your account signed out. Private work was cleared from this tab.");
  }).catch(() => { if (epoch === state.epoch) message("Reconnect your account to restore this workspace.", true); });
});
