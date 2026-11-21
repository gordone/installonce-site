// Three production views over the existing owner-authorized HALO API.
// Screen selection never grants a tier, changes authentication or supplies an API URL.
export function createScreens({ state, request, onError, onNavigate, onOpen, onCreate }) {
  const paths = { dashboard: "/my-halo/dashboard/", overview: "/my-halo/overview/", plus: "/my-halo/plus/" };
  const fromPath = () => Object.entries(paths).find(([, path]) => path === location.pathname)?.[0] || "overview";
  const requestedPlan = () => {
    if (location.pathname !== paths.overview) return null;
    const id = new URLSearchParams(location.search).get("halo");
    return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
  };
  let view = fromPath(), cacheOwner = null, loading = null, focusedPlan = null;
  let focusOverview = location.pathname === paths.overview;
  const summaries = new Map(), failed = new Set();
  const $ = (id) => document.getElementById(id);
  const el = (tag, text, cls = "") => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; n.className = cls; return n; };
  const button = (text, action, primary = false) => {
    const b = el("button", text, primary ? "button primary" : "text-button"); b.type = "button";
    b.disabled = state.busy; b.addEventListener("click", action); return b;
  };
  function remember(plan) {
    if (!state.owner || plan?.owner_id !== state.owner || !plan.id) return;
    const actions = plan.blueprint.actions, conditions = plan.wembt.conditions.filter((c) => c.review_state !== "retired");
    summaries.set(plan.id, { owner: state.owner, revision: plan.revision, horizon: plan.horizon_days,
      statement: plan.identity_card.statement, actions: actions.length,
      completed: actions.filter((a) => a.status === "completed").length,
      conditions: conditions.length, met: conditions.filter((c) => c.status === "satisfied" && c.evidence_ids.length).length,
      started: !!plan.cycle_execution, retired: plan.cycle_execution?.closure?.decision === "retire" });
  }
  async function loadSummaries() {
    const owner = state.owner, epoch = state.epoch;
    if (!owner || state.locked || loading?.epoch === epoch) return;
    const queue = state.recent.filter((h) => !(summaries.get(h.id)?.revision >= Number(h.revision || 0)) && !failed.has(h.id));
    if (!queue.length) return;
    const run = { epoch, owner }; loading = run;
    const worker = async () => {
      while (queue.length && state.epoch === epoch && state.owner === owner && !state.locked) {
        const item = queue.shift();
        try {
          const plan = await request("/halos/" + encodeURIComponent(item.id));
          if (state.epoch !== epoch || state.owner !== owner || state.locked) return;
          if (plan.owner_id !== owner || plan.id !== item.id) throw Object.assign(new Error(), { status: 503 });
          remember(plan);
        } catch (error) {
          if (state.epoch !== epoch || state.owner !== owner || error.name === "AbortError") return;
          failed.add(item.id);
          if (error.status === 401) { onError(error); return; }
        }
      }
    };
    try { await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker)); }
    finally {
      if (loading === run) loading = null;
      if (state.epoch === epoch && state.owner === owner && !state.locked) render();
    }
  }
  function select(next, updateUrl = true) {
    if (!paths[next]) return;
    view = next; focusOverview = next === "overview";
    if (updateUrl && location.pathname.startsWith("/my-halo/") && location.pathname !== paths[next]) history.pushState({}, "", paths[next]);
  }
  function card(item, summary) {
    const box = el("article", undefined, "halo-list-card");
    box.append(el("h3", item.intention));
    if (summary) {
      box.append(el("p", summary.statement, "halo-list-conduct"));
      const status = summary.retired ? "Retired · history retained" : summary.started ? "Practice started" : "Saved draft";
      box.append(el("p", `${summary.horizon} days · ${status}`, "halo-list-meta"));
      const progress = el("progress"); progress.max = Math.max(1, summary.actions); progress.value = summary.completed;
      progress.setAttribute("aria-label", "Reported action completion for " + item.intention);
      box.append(progress, el("p", `${summary.completed} of ${summary.actions} actions reported complete · ${summary.met} of ${summary.conditions} Milestones with recorded supporting assessments`, "halo-list-meta"));
    } else box.append(el("p", failed.has(item.id) ? "Progress unavailable. Open this HALO to retry." : "Loading saved details…", "halo-list-meta"));
    box.append(button("Open HALO", () => onOpen(item.id)));
    return box;
  }
  function renderList(target, plus) {
    target.replaceChildren();
    target.append(el("p", plus ? "MY HALO PLUS · PREVIEW" : "MY HALO DASHBOARD", "eyebrow"),
      el("h1", plus ? "My HALO Plus Overview" : "My HALO"));
    target.append(el("p", plus ? "Explore the grouped view with your existing saved HALOs. This preview does not activate a subscription or grant additional capabilities." : "Your intentions, your practice, your next small start.", "halo-screen-lede"));
    const top = el("div", undefined, "halo-screen-actions");
    top.append(button("New HALO", onCreate, true), button("1·60·7 Overview", () => { select("overview"); onNavigate(); }));
    target.append(top);
    if (!state.owner || state.locked) {
      target.append(el("p", state.locked ? "Reconnect your account to restore your private HALOs." : "Connect your account to see your saved HALOs. Your plans stay private.", "halo-screen-empty"));
      target.append(button("Connect account to view HALOs", () => $("connect").click(), true)); return;
    }
    target.append(el("p", "Showing up to 20 recently updated saved HALOs. Progress reflects recorded reports, not independently verified outcomes.", "halo-list-meta"));
    if (!state.recent.length) target.append(el("p", "No saved HALOs yet. Begin with an intention and a timeframe.", "halo-screen-empty"));
    for (const [title, min, max] of [["This week", 0, 7], ["This quarter", 7, 90], ["This year and beyond", 90, Infinity], ["Details unavailable", -1, -1]]) {
      const items = state.recent.filter((item) => {
        const s = summaries.get(item.id);
        return min === -1 ? !s : s && s.owner === state.owner && s.horizon > min && s.horizon <= max;
      });
      if (!items.length && (!plus || min === -1)) continue;
      const group = el("section", undefined, "halo-list-group"); group.append(el("h2", title));
      if (!items.length) group.append(el("p", "No saved HALOs in this group.", "halo-list-meta"));
      for (const item of items) group.append(card(item, summaries.get(item.id)));
      target.append(group);
    }
    if (failed.size) target.append(button("Retry unavailable details", () => { failed.clear(); render(); }));
    if (plus) {
      const ai = el("section", undefined, "halo-list-card halo-plus-ai");
      ai.append(el("h2", "HALO AI"), el("p", "Open an individual HALO to generate a new draft from its saved Identity Card. Cross-HALO suggestions, live billing, community and marketplace capabilities are not released by this preview.", "halo-screen-lede"));
      target.append(ai);
    }
  }
  function render() {
    if (cacheOwner !== state.owner) { summaries.clear(); failed.clear(); cacheOwner = state.owner; }
    if (state.saved && !state.locked) remember(state.plan);
    document.body.dataset.haloScreen = view;
    if (view === "overview" && location.pathname === paths.overview && state.saved && state.owner && !state.locked && !state.busy && state.plan?.owner_id === state.owner && requestedPlan() !== state.plan.id) history.replaceState({}, "", paths.overview + "?halo=" + encodeURIComponent(state.plan.id));
    for (const control of document.querySelectorAll(".screen-tabs [data-halo-screen]")) {
      if (control.dataset.haloScreen === view) control.setAttribute("aria-current", "page"); else control.removeAttribute("aria-current");
      control.setAttribute("aria-disabled", String(state.busy));
    }
    $("overview-screen").hidden = view !== "overview";
    $("dashboard-screen").hidden = view !== "dashboard";
    $("plus-screen").hidden = view !== "plus";
    if (view === "dashboard") renderList($("dashboard-screen"), false);
    if (view === "plus") renderList($("plus-screen"), true);
    if (!state.owner || state.locked) {
      if (view !== "dashboard") $("dashboard-screen").replaceChildren();
      if (view !== "plus") $("plus-screen").replaceChildren();
    }
    $("overview-report-state").textContent = state.locked ? "Reconnect to continue" : state.sample ? "Read-only example" : state.plan?.cycle_execution ? `${new Set(state.plan.cycle_execution.daily_logs.map((d) => d.day_offset)).size} of 7 day reports recorded` : state.plan ? "Ready for your first small start" : "Choose a HALO or create one below";
    if (view !== "overview" && state.owner && !state.locked) loadSummaries();
  }
  for (const control of document.querySelectorAll(".screen-tabs [data-halo-screen]")) control.addEventListener("click", (event) => {
    event.preventDefault(); if (state.busy) return;
    select(control.dataset.haloScreen); onNavigate(); $(view === "overview" ? "overview-screen" : view + "-screen").focus();
  });
  window.addEventListener("popstate", () => {
    view = fromPath(); focusOverview = view === "overview";
    const id = requestedPlan();
    if (view === "overview" && id && state.owner && !state.locked && !state.busy && id !== state.plan?.id) onOpen(id);
    else onNavigate();
  });
  return { render, select, requestedPlan, shouldFocusOverview() {
    if (!focusOverview || view !== "overview" || !state.plan || state.locked || focusedPlan === state.plan.id) return false;
    focusedPlan = state.plan.id; return true;
  } };
}
