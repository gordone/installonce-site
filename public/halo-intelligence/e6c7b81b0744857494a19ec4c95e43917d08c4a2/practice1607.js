// The public HALO 1607 card/proof/week interaction, adapted for the MVP's explicit saves.
// No network, storage, evidence or completion writes originate in this component.
export function mountPractice1607(model, actions) {
  const root = document.createElement("section"); root.className = "practice-module";
  root.dataset.building = String(!!model.building);
  root.innerHTML = `<div class="practice-duration" aria-label="New HALO duration"></div>
    <div class="halo-test"><div class="test-brand"><span>H A L O ◯</span><span>1 · 60 · 7</span></div>
    <div class="step-tabs" aria-label="Practice steps"></div>
    <div class="card-stage"><div class="index-card">
      <section class="card-face card-front"><span class="card-label">The Card — Side One</span>
      <label class="card-prompt" for="practice-identity">It already happened. I am</label>
      <textarea id="practice-identity" class="card-input" rows="3" placeholder="a person who keeps promises"></textarea>
      <div class="card-footer"><span>Present tense</span><span>Decide it</span></div></section>
      <section class="card-face card-back"><span class="card-label">The Card — Side Two</span>
      <label class="card-question" for="practice-proof">What would the person I’ve decided to be do right now?</label>
      <textarea id="practice-proof" class="card-input" rows="3" placeholder="One tiny action I can do now"></textarea>
      <div class="card-footer"><span>One small action</span><span>Do it now</span></div></section>
    </div></div><div class="practice-card-actions"></div>
    <div class="test-panel"><p class="panel-label"></p><h2 class="practice-heading"></h2><p class="practice-description"></p>
      <p class="practice-clock" role="timer" aria-label="Seconds remaining"></p><div class="panel-actions"></div>
      <p class="practice-message" role="status" aria-live="polite"></p><p class="practice-build-status" role="status" aria-live="polite"></p></div>
    <div class="practice-details" aria-label="HALO details"></div></div>`;
  const $ = selector => root.querySelector(selector);
  const button = (text, fn, disabled = false) => { const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.disabled = disabled; b.dataset.baseDisabled = String(disabled); b.addEventListener("click", fn); return b; };
  const input = $("#practice-identity"), proof = $("#practice-proof"), card = $(".index-card");
  input.value = model.statement; proof.value = model.proof;
  if (model.hasPlan) $(".card-prompt").textContent = "It already happened.";
  if (model.question) $(".card-question").textContent = model.question;
  input.maxLength = 4000; proof.maxLength = 4000;
  input.disabled = model.readOnly || model.building; proof.disabled = model.readOnly;
  input.dataset.baseDisabled = String(!!(model.readOnly || model.building)); proof.dataset.baseDisabled = String(!!model.readOnly);
  input.addEventListener("input", () => { model.statement = input.value; actions.statement(input.value); if (model.hasPlan) message("Card draft changed. Build a new HALO to regenerate its Blueprint, Timeline and Milestones."); });
  proof.addEventListener("input", () => { model.proof = proof.value; });
  for (const days of [7,90,"custom"]) { const b = button(days === "custom" ? "Custom" : days + " days", () => { model.custom = days === "custom"; if (model.custom) customInput.value = String(model.duration); else { model.duration = days; actions.duration(days); } update(); }, !!model.building); b.dataset.days = String(days); $(".practice-duration").append(b); }
  const custom = document.createElement("label"); custom.className = "practice-custom"; custom.textContent = "Number of days";
  const customInput = document.createElement("input"); customInput.type = "number"; customInput.min = "1"; customInput.max = "3650"; customInput.required = true; customInput.value = String(model.duration); customInput.step = "1";
  custom.append(customInput); $(".practice-duration").after(custom);
  customInput.disabled = !!model.building; customInput.dataset.baseDisabled = String(!!model.building);
  customInput.addEventListener("input", () => { if (customInput.validity.valid && customInput.value) { model.duration = Number(customInput.value); actions.duration(model.duration); } });
  for (const [key,label] of [["card","1 Card"],["proof","60 Seconds"],["week","7 Days"]]) { const status = document.createElement("span"); status.textContent = label; status.dataset.step = key; $(".step-tabs").append(status); }
  $(".practice-card-actions").append(button("Turn card over", () => { model.side = model.side === "front" ? "back" : "front"; update(); }));
  if (actions.save) $(".practice-card-actions").append(button("Save Identity Card", () => actions.save(input.value), model.readOnly || !!model.building));
  if (actions.build) {
    const build = button(model.hasPlan ? "Translate and build plan" : "Build my HALO", () => {
      if (model.custom && !customInput.reportValidity()) return;
      if (!model.statement.trim()) { message("Write your identity first."); model.side = "front"; update(); input.focus(); return; }
      actions.build(model.statement,model.duration);
    }, model.readOnly || !!model.building);
    build.className = "primary"; $(".practice-card-actions").prepend(build);
  }
  let interval = null;
  const message = text => { $(".practice-message").textContent = text; };
  function stop() { if (interval !== null) clearInterval(interval); interval = null; }
  function tick() { model.remaining = model.deadline ? Math.max(0, Math.ceil((model.deadline - Date.now()) / 1000)) : model.remaining;
    $(".practice-clock").textContent = String(model.remaining).padStart(2,"0");
    if (model.deadline && model.remaining === 0) { model.deadline = null; stop(); message("60 seconds finished. Nothing has been marked complete. Record only what you actually did."); update(); }
  }
  function start() { if (!model.proof.trim()) { message("Enter one tiny action on Side Two first."); model.side = "back"; update(); proof.focus(); return; }
    model.remaining = model.remaining > 0 ? model.remaining : 60; model.deadline = Date.now() + model.remaining * 1000; message(""); update(); }
  function update() {
    card.classList.toggle("flipped", model.side === "back");
    $(".card-front").inert = model.side === "back"; $(".card-back").inert = model.side !== "back";
    $(".card-front").setAttribute("aria-hidden", String(model.side === "back")); $(".card-back").setAttribute("aria-hidden", String(model.side !== "back"));
    custom.hidden = !model.custom;
    for (const b of root.querySelectorAll("[data-days]")) b.setAttribute("aria-pressed",String(b.dataset.days === "custom" ? model.custom : !model.custom && Number(b.dataset.days) === model.duration));
    for (const b of root.querySelectorAll("[data-step]")) { b.classList.toggle("active", b.dataset.step === model.step); if (b.dataset.step === model.step) b.setAttribute("aria-current","step"); else b.removeAttribute("aria-current"); }
    $(".panel-label").textContent = model.step === "card" ? "1 — The card" : model.step === "proof" ? "60 — One small action" : "7 — Live it";
    $(".practice-heading").textContent = model.step === "card" ? "Finish the sentence on the card." : model.step === "proof" ? "Do one tiny action now." : "Keep your card visible for seven days.";
    $(".practice-description").textContent = model.step === "week" ? "Return to the identity each day. Report what happened; missed days are part of the record." : model.step === "proof" ? "Write one action on Side Two, then start the timer." : "Make it present-tense and observable. You can edit both sides before you begin.";
    $(".practice-clock").hidden = model.step !== "proof";
    const controls = $(".panel-actions"); controls.replaceChildren();
    root.querySelector(".practice-tracker")?.remove();
    if (model.step === "card") { const startPractice = button("Start the 60-second practice", () => { if (!model.statement.trim()) { message("Write your identity first."); input.focus(); return; } model.step = "proof"; model.side = "back"; message(""); update(); }); if (model.startHighlighted) startPractice.className = "practice-start-highlight"; controls.append(startPractice); }
    if (model.step === "proof") {
      controls.append(button(model.deadline ? "Pause timer" : model.remaining < 60 && model.remaining > 0 ? "Resume timer" : "Start timer", () => { if (model.deadline) { tick(); model.deadline = null; stop(); update(); } else start(); }, model.readOnly));
      if (model.startHighlighted && !model.deadline) controls.firstElementChild.classList.add("practice-start-highlight");
      controls.append(button("I did it — stop timer", () => { model.deadline = null; stop(); model.step = "week"; model.side = "front"; message("You reported doing the action. Nothing has been saved or marked complete automatically."); update(); }, model.readOnly || !model.proof.trim()));
    }
    if (model.step === "week") {
      const tracker = document.createElement("div"); tracker.className = "practice-tracker";
      if (actions.tracker) tracker.append(actions.tracker());
      else { const days = document.createElement("ol"); days.setAttribute("aria-label","Seven days — no practice reported"); for (let i=1;i<=7;i++) { const day = document.createElement("li"); day.textContent = "Day " + i; days.append(day); } tracker.append(days); }
      controls.before(tracker);
      if (actions.record) controls.append(button("Record today’s practice", actions.record, model.readOnly)); controls.append(button("Return to my card", () => { model.step = "card"; model.side = "front"; update(); }));
    }
    $(".practice-details").replaceChildren();
    const ready = model.hasPlan && !model.building && !model.buildError;
    for (const [key,label] of [["blueprint","View Blueprint"],["timeline","View Timeline"],["milestones","View Milestones"]]) {
      const view = button(label, () => actions.detail(key), !ready); view.dataset.ready = String(!!ready);
      if (ready) view.className = "practice-ready"; $(".practice-details").append(view);
    }
    $(".practice-details").setAttribute("aria-busy",String(!!model.building));
    $(".practice-build-status").textContent = model.building ? "Building your Blueprint, Timeline and Milestones in the background. Start your 60-second practice now." : model.buildError || (model.planReady ? "Your plan is saved and ready. The highlighted View buttons open it." : "");

    tickDisplay(); stop(); if (model.deadline) interval = setInterval(tick,250);
  }
  function tickDisplay() { $(".practice-clock").textContent = String(model.deadline ? Math.max(0,Math.ceil((model.deadline-Date.now())/1000)) : model.remaining).padStart(2,"0"); }
  update(); return {element:root,dispose:stop};
}
