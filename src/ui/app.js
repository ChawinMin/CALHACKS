// VisionER front end: step logic, HUD, hologram overlay and the vision hooks.
// The vision team drives it through window.VisionER (see README.md):
//   attachStream(src)  setTarget(box)  setDetected(label, value, confidence)  goTo(step)
(() => {
  "use strict";

  const DATA = window.VISIONER_DATA;
  const P = DATA.LIMB_BLEEDING;
  const STEPS = P.steps;
  const VW = 1600, VH = 900; // overlay viewBox; the lens is always 16:9

  // Where the wound sits in the simulated scene, in viewBox px.
  const SIM_WOUND = { x: 800, y: 505, w: 210, h: 112 };
  const DEFAULT_TARGET = { x: 700, y: 400, w: 220, h: 120 };

  const $ = (id) => document.getElementById(id);
  const el = {
    bench: $("bench"), lens: $("lens"), scene: $("scene"), cam: $("cam"), camImg: null,
    overlay: $("overlay"), hud: $("hud"), home: $("home"), homeCall: $("homeCall"), homeCallLabel: $("homeCallLabel"),
    startGuide: $("startGuide"), roadmapList: $("roadmapList"),
    stepDots: $("stepDots"), stepCount: $("stepCount"), elapsed: $("elapsed"), speakInd: $("speakInd"),
    stepCard: $("stepCard"), stepTitle: $("stepTitle"), stepDetail: $("stepDetail"), checklist: $("checklist"),
    badge911: $("badge911"), badge911Text: $("badge911Text"),
    ring: $("ring"), ringFill: $("ringFill"), ringTime: $("ringTime"), ringSub: $("ringSub"),
    warning: $("warning"), warningText: $("warningText"), kit: $("kit"),
    summary: $("summary"), summaryList: $("summaryList"),
    hudBack: $("hudBack"), hudNext: $("hudNext"), hudNextLabel: $("hudNextLabel"),
    stepList: $("stepList"), backBtn: $("backBtn"), nextBtn: $("nextBtn"), log: $("log"),
    sourcePill: $("sourcePill"), wsPill: $("wsPill"), sourceHint: $("sourceHint"),
    optAuto: $("optAuto"), optVoice: $("optVoice"), optAutoplay: $("optAutoplay"), optSpeed: $("optSpeed"),
    simGauze: $("simGauze"), simGauze2: $("simGauze2"), simSoak: $("simSoak"), simBandage: $("simBandage"),
  };

  // ---------------------------------------------------------------- state
  let S;
  function freshState() {
    return {
      screen: "home",          // "home" | "guide"
      step: 0,
      phase: "wrap",           // step 5: "wrap" -> "stay"
      source: S ? S.source : "sim",
      clock: 0,                // scenario seconds (scaled by clock speed)
      target: null,            // {x,y,w,h,conf,manual} in viewBox px
      lockStart: 0,            // real ms when the wound target first appeared
      locked: false,
      det: { gloves: false, call911: false, gauze: false, bandage: false },
      kitSeen: new Set(),
      pressure: true,
      soak: false,
      gauzeLayers: 0,
      hold: 0,                 // seconds of pressure held
      holdDone: false,
      t: {},                   // scenario timestamps for the EMS handoff
    };
  }
  S = freshState();

  const opts = { auto: true, voice: true, autoplay: false, speed: 1 };
  const stepListeners = [];
  let advanceTimer = null;
  let autoplayTimers = [];
  let jitterTimer = null;

  // ---------------------------------------------------------------- utils
  const fmt = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  };
  const fmtShort = (sec) => { sec = Math.max(0, Math.floor(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
  const stamp = (key) => { if (S.t[key] == null) S.t[key] = S.clock; };
  const normLabel = (l) => String(l).trim().toLowerCase().replace(/[\s-]+/g, "_");
  const ALIASES = { "911": "call911", call_911: "call911", called_911: "call911", glove: "gloves",
    pad: "trauma_pad", traumapad: "trauma_pad", bandaged: "bandage", wrap: "bandage",
    soaking: "soak", soak_through: "soak", hands: "pressure", wound_located: "wound", bleeding: "wound" };

  function log(name, detail) {
    const li = document.createElement("li");
    const t = S.screen === "guide" ? fmt(S.clock) : "--:--";
    li.innerHTML = `${t} <b>${name}</b> ${detail ?? ""}`;
    li.title = li.textContent;
    el.log.prepend(li);
    while (el.log.children.length > 40) el.log.lastChild.remove();
  }

  // ---------------------------------------------------------------- read-aloud
  let lastSpoken = "";
  function speak(text) {
    lastSpoken = text;
    if (!opts.voice || !("speechSynthesis" in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    const voice = speechSynthesis.getVoices().find((v) => /en[-_]US/i.test(v.lang) && /natural|google|aria|jenny|samantha/i.test(v.name))
      || speechSynthesis.getVoices().find((v) => /^en/i.test(v.lang));
    if (voice) u.voice = voice;
    u.onstart = () => el.speakInd.classList.add("on");
    u.onend = u.onerror = () => el.speakInd.classList.remove("on");
    speechSynthesis.speak(u);
  }

  // ---------------------------------------------------------------- navigation
  function start() {
    const keep911 = S.det.call911;
    S = Object.assign(freshState(), { screen: "guide" });
    if (keep911) { S.det.call911 = true; S.t.call911 = 0; }
    log("start", P.id);
    enterStep(0);
  }

  function goHome() {
    clearTimers();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    const src = S.source;
    S = freshState();
    S.source = src;
    renderAll();
  }

  function enterStep(i) {
    clearTimers();
    i = Math.max(0, Math.min(STEPS.length - 1, i));
    const prev = S.step;
    S.step = i;
    S.phase = "wrap";
    if (i !== 3) S.soak = false;
    S.pressure = true;
    stamp(`step${i}`);

    // Manual advance without detection still needs an anchor for the holograms.
    if (i >= 2 && !S.target) setTargetPx(S.source === "sim" ? SIM_WOUND : DEFAULT_TARGET, { manual: true, conf: null });
    if (i >= 2) { S.locked = true; stamp("wound"); }
    if (i === 3 && prev < 3 && S.gauzeLayers === 0) S.gauzeLayers = 1;
    if (i >= 3 && !S.det.gauze) S.det.gauze = true;

    renderAll(true);
    speak(STEPS[i].speak);
    stepListeners.forEach((cb) => { try { cb(i + 1, STEPS[i].id); } catch (e) { console.error(e); } });
    wsSend({ type: "step", step: i + 1, id: STEPS[i].id });
    log("step", `${i + 1} ${STEPS[i].id}`);
    scheduleAutoplay();
  }

  function next() {
    if (S.screen !== "guide") return start();
    if (S.step === STEPS.length - 1) {
      if (S.phase === "wrap") finishWrap();
      return;
    }
    enterStep(S.step + 1);
  }
  function back() {
    if (S.screen !== "guide") return;
    if (S.step === STEPS.length - 1 && S.phase === "stay") { S.phase = "wrap"; renderAll(true); return; }
    if (S.step === 0) return goHome();
    enterStep(S.step - 1);
  }

  function finishWrap() {
    S.det.bandage = true;
    S.kitSeen.add("bandage");
    stamp("bandage");
    S.phase = "stay";
    renderAll(true);
    speak(P.stay.speak);
    wsSend({ type: "step", step: STEPS.length, id: "stay" });
    log("phase", "stay with patient");
  }

  function queueAdvance(ms, fn = next) {
    if (!opts.auto) return;
    clearTimeout(advanceTimer);
    const at = S.step;
    advanceTimer = setTimeout(() => { if (S.screen === "guide" && S.step === at) fn(); }, ms);
  }

  function clearTimers() {
    clearTimeout(advanceTimer);
    autoplayTimers.forEach(clearTimeout);
    autoplayTimers = [];
    clearInterval(jitterTimer);
    jitterTimer = null;
  }

  // ---------------------------------------------------------------- hooks
  // Map a box in camera-frame coordinates to lens viewBox px, honouring object-fit: cover.
  function frameToLens(box) {
    let { x, y, w, h } = Array.isArray(box) ? { x: box[0], y: box[1], w: box[2], h: box[3] } : box;
    const media = !el.cam.hidden ? el.cam : el.camImg && !el.camImg.hidden ? el.camImg : null;
    const fw = media ? (media.videoWidth || media.naturalWidth || VW) : VW;
    const fh = media ? (media.videoHeight || media.naturalHeight || VH) : VH;
    const isNorm = [x, y, w, h].every((v) => v >= 0 && v <= 1.0001);
    if (isNorm) { x *= fw; y *= fh; w *= fw; h *= fh; }
    if (!media) return { x, y, w, h };
    const s = Math.max(VW / fw, VH / fh);
    const ox = (VW - fw * s) / 2, oy = (VH - fh * s) / 2;
    return { x: ox + x * s, y: oy + y * s, w: w * s, h: h * s };
  }

  function setTargetPx(box, meta = {}) {
    const had = !!S.target;
    S.target = { ...box, conf: meta.conf ?? null, manual: !!meta.manual };
    if (!had) S.lockStart = performance.now();
    drawOverlay();
  }

  function setTarget(box, confidence) {
    if (box == null) {
      S.target = null;
      if (S.step <= 1) S.locked = false;
      log("setTarget", "null");
      drawOverlay();
      return;
    }
    const conf = confidence ?? box.confidence ?? box.conf ?? null;
    const px = frameToLens(box);
    if (!jitterTimer) log("setTarget", `${Math.round(px.x)},${Math.round(px.y)} ${Math.round(px.w)}×${Math.round(px.h)}${conf != null ? ` @${(+conf).toFixed(2)}` : ""}`);
    setTargetPx(px, { conf });
  }

  function setDetected(label, value = true, confidence) {
    let key = normLabel(label);
    key = ALIASES[key] || key;
    value = value !== false && value !== 0 && value !== "false";
    log("setDetected", `${key}=${value}${confidence != null ? ` @${(+confidence).toFixed(2)}` : ""}`);
    if (DATA.KIT.some((k) => k.id === key) && value) {
      const isNew = !S.kitSeen.has(key);
      S.kitSeen.add(key);
      if (isNew) popKit(key);
    }
    if (S.screen !== "guide") { if (key === "call911" && value) mark911(); renderAll(); return; }

    switch (key) {
      case "gloves":
        S.det.gloves = value;
        break;
      case "call911":
        if (value) mark911();
        break;
      case "wound":
        if (value && S.step <= 1) {
          if (!S.target) setTargetPx(S.source === "sim" ? SIM_WOUND : DEFAULT_TARGET, { conf: confidence ?? null });
          lockWound();
        }
        break;
      case "gauze":
      case "trauma_pad":
        if (!value) break;
        if (S.step === 3 && S.soak) {
          S.soak = false;
          S.gauzeLayers += 1;
          speak("Good. Keep pressing.");
        } else if (S.step <= 2) {
          S.det.gauze = true;
          S.gauzeLayers = Math.max(1, S.gauzeLayers);
          stamp("gauze");
          if (S.step === 2) queueAdvance(1200);
        }
        break;
      case "pressure":
        if (S.step !== 3) break;
        if (!value && S.pressure) { S.pressure = false; speak(P.released.speak); flashWarning(); }
        else if (value && !S.pressure) { S.pressure = true; speak("Good. Keep holding."); }
        break;
      case "soak":
        if (S.step === 3 && value && !S.soak) { S.soak = true; speak(P.soak.speak); stamp("soak"); }
        break;
      case "bandage":
        S.det.bandage = value;
        if (value && S.step === STEPS.length - 1 && S.phase === "wrap") {
          if (opts.auto) queueAdvance(900, finishWrap); else renderAll();
          return;
        }
        break;
    }
    if (S.step === 0 && S.det.gloves && S.det.call911) queueAdvance(1200);
    renderAll();
  }

  function lockWound() {
    if (S.locked) return;
    S.locked = true;
    stamp("wound");
    speak("Bleeding source found.");
    log("lock", "wound");
    renderAll();
    queueAdvance(1600);
  }

  function mark911() {
    if (S.det.call911) return;
    S.det.call911 = true;
    S.t.call911 = S.screen === "guide" ? S.clock : 0;
    log("911", "confirmed");
  }

  function goTo(step) {
    if (step === "home") return goHome();
    let i = typeof step === "number" ? step - 1 : STEPS.findIndex((s) => s.id === step);
    if (step === "stay") i = STEPS.length - 1;
    if (i < 0 || i >= STEPS.length) { console.warn("VisionER.goTo: unknown step", step); return; }
    log("goTo", String(step));
    if (S.screen !== "guide") start();
    enterStep(i);
    if (step === "stay") finishWrap();
  }

  function attachStream(src) {
    if (src == null) { setSource("sim"); return; }
    el.cam.hidden = true;
    if (el.camImg) el.camImg.hidden = true;
    if (src instanceof MediaStream) {
      el.cam.srcObject = src; el.cam.hidden = false; el.cam.play().catch(() => {});
    } else if (src instanceof HTMLVideoElement && src.srcObject) {
      el.cam.srcObject = src.srcObject; el.cam.hidden = false; el.cam.play().catch(() => {});
    } else if (typeof src === "string") {
      // MJPEG / snapshot URL from the Python side, e.g. http://localhost:5000/video
      if (!el.camImg) {
        el.camImg = Object.assign(document.createElement("img"), { className: "cam", alt: "Live camera view" });
        el.cam.after(el.camImg);
      }
      el.camImg.src = src; el.camImg.hidden = false;
    } else { console.warn("VisionER.attachStream: unsupported source", src); return; }
    S.source = "camera";
    el.scene.style.visibility = "hidden";
    opts.autoplay = el.optAutoplay.checked = false;
    syncSourceUI();
    log("attachStream", typeof src === "string" ? src : "MediaStream");
  }

  function onStep(cb) { if (typeof cb === "function") stepListeners.push(cb); }

  window.VisionER = {
    attachStream, setTarget, setDetected, goTo, onStep,
    next, back, reset: goHome,
    get state() {
      return { screen: S.screen, step: S.step + 1, stepId: STEPS[S.step].id, phase: S.phase,
        clock: S.clock, hold: S.hold, target: S.target, detected: { ...S.det }, kit: [...S.kitSeen],
        soak: S.soak, pressure: S.pressure, gauzeLayers: S.gauzeLayers };
    },
  };

  // ---------------------------------------------------------------- render
  function currentCopy() {
    const st = STEPS[S.step];
    if (S.step === 3 && S.soak) return { kicker: `Step 4 of ${STEPS.length}`, ...P.soak, cls: "is-alert" };
    if (S.step === STEPS.length - 1 && S.phase === "stay") return { kicker: "Until EMS arrives", ...P.stay, cls: "is-done" };
    return { kicker: `Step ${S.step + 1} of ${STEPS.length}`, title: st.title, detail: st.detail, cls: "" };
  }

  function renderAll(animateCard = false) {
    const guide = S.screen === "guide";
    el.home.hidden = guide;
    el.hud.hidden = !guide;

    // home
    if (!guide) {
      el.homeCallLabel.textContent = S.det.call911 ? "911 called. Now pick the emergency" : "Not sure? Call 911 first";
      el.homeCall.classList.toggle("is-done", S.det.call911);
    }

    if (guide) {
      const c = currentCopy();
      el.stepCount.textContent = c.kicker;
      el.stepTitle.textContent = c.title;
      el.stepDetail.textContent = c.detail;
      el.stepCard.className = `step-card ${c.cls}`;
      if (animateCard) { void el.stepCard.offsetWidth; el.stepCard.classList.add("enter"); }
      renderChecklist();

      [...el.stepDots.children].forEach((li, i) => {
        const done = i < S.step || (i === S.step && S.phase === "stay");
        li.className = done ? "done" : i === S.step ? "now" : "";
      });

      el.badge911.dataset.state = S.det.call911 ? "done" : "pending";
      el.badge911Text.textContent = S.det.call911 ? `911 called at ${fmt(S.t.call911 || 0)}` : "911 not called";

      // warning banner
      let warn = "";
      if (S.step === 3 && !S.pressure) warn = "Hands lifted. Press down again. Don’t lift to check.";
      else if (S.step === 3 && S.soak) warn = "Don’t remove the soaked gauze. Stack new gauze on top.";
      else if (S.step === 3) warn = STEPS[3].warning;
      else if (S.step === 4 && S.phase === "wrap") warn = "Don’t remove the gauze underneath.";
      el.warning.hidden = !warn;
      el.warningText.textContent = warn;

      const staying = S.step === STEPS.length - 1 && S.phase === "stay";
      el.ring.hidden = S.step < 3 || staying; // the handoff card reports the hold time instead
      el.summary.hidden = !staying;
      el.hudBack.disabled = false;
      const last = S.step === STEPS.length - 1;
      el.hudNext.disabled = last && S.phase === "stay";
      el.hudNextLabel.textContent = last ? (S.phase === "stay" ? "Done" : "Bandage on") : "Next";
    }

    // kit chips
    [...el.kit.children].forEach((li) => li.classList.toggle("seen", S.kitSeen.has(li.dataset.id)));

    // sim scene reacts to what the wearer has done
    const gauzeOn = guide && (S.det.gauze || S.step >= 3);
    el.simGauze.setAttribute("opacity", gauzeOn ? 1 : 0);
    el.simGauze2.setAttribute("opacity", guide && S.gauzeLayers >= 2 ? 1 : 0);
    el.simBandage.setAttribute("opacity", guide && S.det.bandage ? 1 : 0);

    // console step list
    [...el.stepList.children].forEach((li, i) => {
      li.className = !guide ? "" : i < S.step || (i === S.step && S.phase === "stay") ? "done" : i === S.step ? "now" : "";
    });
    el.backBtn.disabled = !guide;
    el.nextBtn.textContent = !guide ? "Start" : el.hudNextLabel.textContent;
    el.nextBtn.disabled = guide && el.hudNext.disabled;
    document.querySelectorAll(".det").forEach((b) => {
      const k = b.dataset.det;
      const fired = k === "pressure-off" ? !S.pressure : k === "soak" ? S.soak : k === "wound" ? S.locked
        : k === "trauma_pad" ? S.kitSeen.has("trauma_pad") : !!S.det[k];
      b.classList.toggle("fired", guide && fired);
      if (k === "pressure-off") b.textContent = S.pressure ? "Hands lifted" : "Hands back on";
    });

    drawOverlay();
    tick(0);
  }

  function renderChecklist() {
    const items = [];
    if (S.step === 0) {
      items.push({ ok: S.det.gloves, text: S.det.gloves ? "Gloves on" : "Gloves: grab from kit" });
      items.push({ ok: S.det.call911, text: S.det.call911 ? `911 called at ${fmt(S.t.call911 || 0)}` : "911 called", btn: !S.det.call911 });
    } else if (S.step === 1) {
      items.push({ ok: S.locked, text: S.locked ? "Bleeding source located" : S.target ? "Locking on…" : "Looking for the wound…" });
    } else if (S.step === 2) {
      items.push({ ok: S.det.gauze, text: S.det.gauze ? "Gauze on wound" : "Gauze over the outline" });
    } else if (S.step === 3) {
      items.push({ ok: S.holdDone, text: S.holdDone ? "3:00 held. Keep the pressure on" : "Hold for at least 3:00" });
      if (S.gauzeLayers > 1) items.push({ ok: true, text: `${S.gauzeLayers} gauze layers` });
    } else if (S.step === 4 && S.phase === "wrap") {
      items.push({ ok: S.det.bandage, text: "Bandage wrapped over gauze" });
    }
    el.checklist.innerHTML = items.map((it) =>
      `<li class="${it.ok ? "ok" : ""}">${it.text}${it.btn ? '<button type="button" data-act="call911">I called</button>' : ""}</li>`
    ).join("");
  }

  function popKit(id) {
    const li = el.kit.querySelector(`[data-id="${id}"]`);
    if (!li) return;
    li.classList.remove("pop"); void li.offsetWidth; li.classList.add("pop");
  }

  function flashWarning() {
    renderAll();
    el.warning.classList.remove("flash"); void el.warning.offsetWidth; el.warning.classList.add("flash");
  }

  // ---------------------------------------------------------------- holograms
  let overlayKey = "";
  function overlayKind() {
    if (S.screen !== "guide") return "none";
    switch (S.step) {
      case 0: return "none";
      case 1: return !S.target ? "scan" : S.locked ? "locked" : "locking";
      case 2: return S.det.gauze ? "outline" : "gauze";
      case 3: return S.soak ? "soak" : S.pressure ? "press" : "released";
      case 4: return S.phase === "stay" ? "stay" : "wrap";
    }
    return "none";
  }

  function drawOverlay() {
    const kind = overlayKind();
    const t = S.target;
    const key = `${kind}|${t ? `${Math.round(t.w / 16)}x${Math.round(t.h / 16)}|${t.manual}` : "-"}|${t?.conf != null ? Math.round(t.conf * 100) : ""}`;
    if (key !== overlayKey) {
      overlayKey = key;
      el.overlay.innerHTML = buildOverlay(kind, t);
    }
    const anchor = el.overlay.querySelector("#anchor");
    if (anchor && t) anchor.setAttribute("transform", `translate(${t.x + t.w / 2} ${t.y + t.h / 2})`);
  }

  const arrowDown = (x, y, cls = "holo-stroke") =>
    `<g transform="translate(${x} ${y})"><g class="holo-arrow"><path class="${cls}" d="M0 -46 V0 M-16 -16 L0 0 L16 -16" stroke-linecap="round" stroke-linejoin="round"/></g></g>`;

  function brackets(hw, hh, len = 34, cls = "holo-stroke") {
    const p = (sx, sy) => `M${sx * hw} ${sy * (hh - len)} V${sy * hh} H${sx * (hw - len)}`;
    return `<path class="${cls}" stroke-linecap="round" d="${p(-1, -1)} ${p(1, -1)} ${p(-1, 1)} ${p(1, 1)}"/>`;
  }

  function label(text, y, cls = "holo-text") {
    return `<text class="${cls}" x="0" y="${y}" text-anchor="middle">${text}</text>`;
  }

  // Ghost hand, palm down, fingers pointing away from the wearer. Centered on the palm.
  function ghostHand(s, dx, dy) {
    const f = (x, h, w = 30) => `<rect x="${x}" y="${-40 - h}" width="${w}" height="${h + 20}" rx="${w / 2}"/>`;
    return `<g transform="translate(${dx} ${dy}) scale(${s})">
      <g class="holo-fill holo-faint">
        ${f(-62, 78)}${f(-28, 100)}${f(6, 92)}${f(40, 70, 28)}
        <rect x="-70" y="-50" width="140" height="130" rx="40"/>
        <rect x="-118" y="-6" width="30" height="92" rx="15" transform="rotate(-38 -103 40)"/>
      </g></g>`;
  }

  function buildOverlay(kind, t) {
    if (kind === "none") return "";
    if (kind === "scan") {
      return `<defs><linearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#6fe9ff" stop-opacity="0"/><stop offset="1" stop-color="#6fe9ff" stop-opacity=".22"/></linearGradient></defs>
        <g class="scanline"><rect x="0" y="-120" width="${VW}" height="120" fill="url(#scanGrad)"/><rect x="0" y="-3" width="${VW}" height="3" fill="#6fe9ff" opacity=".9"/></g>
        <g transform="translate(${VW / 2} ${VH / 2 + 40})">${brackets(330, 190, 46)}
          ${label("SCANNING FOR BLEEDING", -220)}
          <text class="holo-text holo-sub" x="0" y="250" text-anchor="middle">LOOK AT THE INJURED LIMB · HOLD STILL</text></g>`;
    }
    if (!t) return "";
    const hw = t.w / 2, hh = t.h / 2;
    const conf = t.conf != null ? ` · ${Math.round(t.conf * 100)}%` : t.manual ? " · MANUAL" : "";
    let body = "";
    switch (kind) {
      case "locking":
        body = `<g class="holo-pulse">${brackets(hw + 26, hh + 26)}</g>${label("LOCKING ON…", -(hh + 50))}`;
        break;
      case "locked":
        body = `<ellipse class="holo-stroke holo-dash" rx="${hw}" ry="${hh}"/>${brackets(hw + 26, hh + 26)}
          ${label(`BLEEDING SOURCE${conf}`, -(hh + 50))}`;
        break;
      case "outline":
        body = `<ellipse class="holo-stroke" rx="${hw}" ry="${hh}" opacity=".7"/>${label(`GAUZE ON${conf}`, -(hh + 46))}`;
        break;
      case "gauze": {
        const gw = hw + 18, gh = hh + 18;
        body = `<ellipse class="holo-stroke holo-dash" rx="${hw}" ry="${hh}" opacity=".7"/>
          <g class="holo-drop"><rect class="holo-fill" x="${-gw}" y="${-gh}" width="${gw * 2}" height="${gh * 2}" rx="12"/>
            <path class="holo-stroke holo-hair" d="${Array.from({ length: 5 }, (_, i) => `M${-gw + (i + 1) * (gw * 2) / 6} ${-gh} V${gh}`).join(" ")} M${-gw} 0 H${gw}"/></g>
          ${arrowDown(0, -(gh + 30))}${label("PLACE GAUZE HERE", -(gh + 100))}`;
        break;
      }
      case "press":
      case "released": {
        const s = Math.max(0.55, Math.min(1.4, (t.w + 40) / 260));
        const warn = kind === "released";
        body = `<rect class="${warn ? "holo-warnfill" : "holo-fill holo-faint"}" x="${-hw - 18}" y="${-hh - 18}" width="${t.w + 36}" height="${t.h + 36}" rx="12"/>
          <g class="holo-push">${ghostHand(s, -10 * s, 10 * s)}${ghostHand(s, 10 * s, -14 * s)}</g>
          ${arrowDown(-hw - 70, 0, warn ? "holo-stroke holo-warnfill" : "holo-stroke")}${arrowDown(hw + 70, 0, warn ? "holo-stroke holo-warnfill" : "holo-stroke")}
          ${label(warn ? "PRESS DOWN · DON’T LIFT" : "PRESS HARD · BOTH HANDS", -(hh + 150 * s), warn ? "holo-text holo-warntext" : "holo-text")}`;
        break;
      }
      case "soak": {
        const gw = hw + 26, gh = hh + 26;
        body = `<rect class="holo-warnfill" x="${-hw - 18}" y="${-hh - 18}" width="${t.w + 36}" height="${t.h + 36}" rx="12" opacity=".8"/>
          <g class="holo-drop"><rect class="holo-fill" x="${-gw}" y="${-gh}" width="${gw * 2}" height="${gh * 2}" rx="12" transform="rotate(-5)"/></g>
          ${arrowDown(0, -(gh + 30))}${label("ADD GAUZE ON TOP", -(gh + 100))}`;
        break;
      }
      case "wrap": {
        const bands = [-2, -1, 0, 1, 2].map((k, i) =>
          `<g class="holo-wrap" style="animation-delay:${i * 0.25}s"><rect class="holo-fill" x="${k * 62 - 22}" y="${-hh * 2.1}" width="44" height="${hh * 4.2}" rx="10" transform="rotate(16 ${k * 62} 0)"/></g>`).join("");
        body = `<ellipse class="holo-stroke" rx="${hw}" ry="${hh}" opacity=".45"/>${bands}
          <path class="holo-stroke" d="M${hw + 80} ${-hh} A ${hh * 1.3} ${hh * 1.3} 0 1 1 ${hw + 80} ${hh}" />
          <path class="holo-stroke" stroke-linejoin="round" d="M${hw + 64} ${hh - 18} L${hw + 80} ${hh} L${hw + 60} ${hh + 14}"/>
          ${label("WRAP TIGHT OVER GAUZE", -(hh * 2.1 + 34))}`;
        break;
      }
      case "stay":
        // The step card already says "Stay with them"; the hologram only marks the dressing.
        body = `<ellipse rx="${hw + 30}" ry="${hh + 20}" class="holo-okfill"/>`;
        break;
    }
    return `<g id="anchor">${body}</g>`;
  }

  // ---------------------------------------------------------------- clock
  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(0.25, (now - lastFrame) / 1000);
    lastFrame = now;
    tick(dt);
    requestAnimationFrame(frame);
  }

  function tick(dt) {
    if (S.screen !== "guide") return;
    const sdt = dt * opts.speed;
    S.clock += sdt;
    el.elapsed.textContent = fmt(S.clock);

    // wound lock after the target has been stable for a moment
    if (S.step === 1 && S.target && !S.locked && performance.now() - S.lockStart > 1200) lockWound();

    if (S.step === 3 && S.pressure) {
      S.hold += sdt;
      if (!S.holdDone && S.hold >= P.holdSeconds) {
        S.holdDone = true;
        stamp("holdDone");
        speak(P.holdDone.speak);
        renderAll();
        queueAdvance(2500);
      }
    }
    if (S.step >= 3) {
      const frac = Math.min(1, S.hold / P.holdSeconds);
      el.ringFill.style.strokeDashoffset = String(326.7 * (1 - frac));
      el.ringTime.textContent = fmtShort(S.hold);
      el.ring.classList.toggle("done", S.holdDone);
      el.ring.classList.toggle("paused", S.step === 3 && !S.pressure);
      el.ringSub.textContent = S.step === 3 && !S.pressure ? "paused" : S.holdDone ? "held" : `hold ${fmtShort(P.holdSeconds)}`;
    }

    // sim: soak spreads through the gauze while the branch is active
    const soakR = S.soak ? Math.min(1, (S.clock - (S.t.soak || 0)) / 6) : S.gauzeLayers > 1 ? 1 : 0;
    el.simSoak.setAttribute("rx", 95 * soakR);
    el.simSoak.setAttribute("ry", 48 * soakR);

    if (!el.summary.hidden) renderSummary();
  }

  function renderSummary() {
    const rows = [
      ["Emergency", "Limb bleeding"],
      ["911 called", S.det.call911 ? `T+${fmt(S.t.call911 || 0)}` : "not confirmed"],
      ["Wound found", S.t.wound != null ? `T+${fmt(S.t.wound)}` : "-"],
      ["Gauze layers", String(Math.max(1, S.gauzeLayers))],
      ["Pressure held", fmtShort(S.hold)],
      ["Bandaged", S.t.bandage != null ? `T+${fmt(S.t.bandage)}` : "-"],
      ["On scene", fmt(S.clock)],
    ];
    el.summaryList.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  }

  // ---------------------------------------------------------------- autoplay (simulated vision)
  function scheduleAutoplay() {
    if (!opts.autoplay || S.source !== "sim" || S.screen !== "guide") return;
    const at = (ms, fn) => autoplayTimers.push(setTimeout(() => { if (S.screen === "guide") fn(); }, ms));
    const i = S.step;
    if (i === 0) {
      if (!S.det.gloves) at(2500, () => setDetected("gloves", true, 0.93));
      if (!S.det.call911) at(4500, () => setDetected("call911", true));
    } else if (i === 1) {
      at(2200, () => { setTarget(toNorm(SIM_WOUND), 0.92); startJitter(); });
    } else if (i === 2) {
      startJitter();
      at(1500, () => setDetected("gauze", true, 0.88));
      at(3800, () => setDetected("gauze", true, 0.9));
    } else if (i === 3) {
      startJitter();
      at(9000, () => setDetected("soak", true, 0.8));
      at(14000, () => setDetected("gauze", true, 0.86));
    } else if (i === 4) {
      startJitter();
      at(4000, () => setDetected("bandage", true, 0.9));
    }
  }

  const toNorm = (b) => ({ x: b.x / VW, y: b.y / VH, w: b.w / VW, h: b.h / VH });

  // Small tracking wobble so the hologram visibly follows the detection.
  function startJitter() {
    clearInterval(jitterTimer);
    let t0 = performance.now();
    jitterTimer = setInterval(() => {
      const k = (performance.now() - t0) / 1000;
      const b = { ...SIM_WOUND, x: SIM_WOUND.x + Math.sin(k * 1.7) * 4, y: SIM_WOUND.y + Math.cos(k * 1.3) * 3 };
      setTargetPx(b, { conf: S.target?.conf ?? 0.92 });
    }, 120);
  }

  // ---------------------------------------------------------------- manual target (drag on lens)
  let drag = null;
  function lensPoint(e) {
    const r = el.lens.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * VW, y: ((e.clientY - r.top) / r.height) * VH };
  }
  el.lens.addEventListener("pointerdown", (e) => {
    if (S.screen !== "guide" || e.target.closest("button, .step-card, .summary")) return;
    drag = { a: lensPoint(e) };
    el.lens.setPointerCapture(e.pointerId);
  });
  el.lens.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const b = lensPoint(e);
    const x = Math.min(drag.a.x, b.x), y = Math.min(drag.a.y, b.y), w = Math.abs(b.x - drag.a.x), h = Math.abs(b.y - drag.a.y);
    let r = el.overlay.querySelector(".manual-box");
    if (!r) { r = document.createElementNS("http://www.w3.org/2000/svg", "rect"); r.setAttribute("class", "manual-box"); el.overlay.appendChild(r); }
    Object.entries({ x, y, width: w, height: h }).forEach(([k, v]) => r.setAttribute(k, v));
    drag.box = { x, y, w, h };
  });
  el.lens.addEventListener("pointerup", () => {
    if (!drag) return;
    el.overlay.querySelector(".manual-box")?.remove();
    if (drag.box && drag.box.w > 24 && drag.box.h > 18) {
      clearInterval(jitterTimer); jitterTimer = null;
      setTargetPx(drag.box, { manual: true });
      log("setTarget", "manual drag");
      if (S.step === 1) S.lockStart = performance.now() - 600;
      renderAll();
    }
    drag = null;
  });

  // ---------------------------------------------------------------- source switching
  async function setSource(src) {
    if (src === "webcam") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        attachStream(stream);
        S.source = "webcam";
      } catch (err) {
        log("webcam", `failed: ${err.name}`);
        return setSource("sim");
      }
    } else {
      const s = el.cam.srcObject;
      if (s && s.getTracks) s.getTracks().forEach((t) => t.stop());
      el.cam.srcObject = null; el.cam.hidden = true;
      if (el.camImg) { el.camImg.remove(); el.camImg = null; }
      el.scene.style.visibility = "";
      S.source = "sim";
    }
    syncSourceUI();
  }

  function syncSourceUI() {
    const sim = S.source === "sim";
    document.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("is-on", b.dataset.source === (sim ? "sim" : "webcam")));
    el.sourcePill.textContent = sim ? "Simulated scene" : S.source === "webcam" ? "Webcam" : "Vision stream";
    el.sourcePill.classList.toggle("live", !sim);
    el.optAutoplay.disabled = !sim;
    el.sourceHint.textContent = sim
      ? "Drag on the lens to place the wound target by hand, or turn on Autoplay to run the whole flow."
      : "Live camera. Vision team drives the overlay via setTarget / setDetected. Drag on the lens as a fallback.";
  }

  // ---------------------------------------------------------------- websocket bridge (optional)
  // ?ws=ws://localhost:8765  messages: {type:"target", box:{x,y,w,h}, confidence}
  //   {type:"detected", label, value, confidence}  {type:"goTo", step}  {type:"stream", url}
  let ws = null;
  function wsSend(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
  function connectWs(url) {
    el.wsPill.hidden = false;
    el.wsPill.textContent = "WS · connecting";
    ws = new WebSocket(url);
    ws.onopen = () => { el.wsPill.textContent = "WS · live"; el.wsPill.classList.add("live"); log("ws", "open"); wsSend({ type: "hello", step: S.step + 1 }); };
    ws.onclose = () => { el.wsPill.textContent = "WS · retrying"; el.wsPill.classList.remove("live"); setTimeout(() => connectWs(url), 2000); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === "target") setTarget(m.box ?? null, m.confidence);
      else if (m.type === "detected") setDetected(m.label, m.value ?? true, m.confidence);
      else if (m.type === "goTo") goTo(m.step);
      else if (m.type === "stream") attachStream(m.url);
    };
  }

  // ---------------------------------------------------------------- build static UI
  function buildStatic() {
    el.roadmapList.textContent = DATA.EMERGENCIES.filter((e) => !e.live).map((e) => e.title === "AED use" ? "AED" : e.title).join(", ");
    el.stepDots.innerHTML = STEPS.map(() => "<li></li>").join("");
    el.kit.innerHTML = DATA.KIT.map((k) => `<li data-id="${k.id}">${k.label}</li>`).join("");
    el.stepList.innerHTML = STEPS.map((s) => `<li><span class="t">${s.title}</span><span class="a">${s.advanceOn}</span></li>`).join("");
  }

  function bind() {
    el.startGuide.addEventListener("click", start);
    el.homeCall.addEventListener("click", () => { mark911(); speak("Call 9 1 1 now. Then pick the emergency."); renderAll(); });
    el.checklist.addEventListener("click", (e) => { if (e.target.dataset.act === "call911") setDetected("call911", true); });
    el.hudNext.addEventListener("click", next);
    el.hudBack.addEventListener("click", back);
    el.nextBtn.addEventListener("click", next);
    el.backBtn.addEventListener("click", back);
    el.stepList.addEventListener("click", (e) => {
      const li = e.target.closest("li"); if (!li) return;
      goTo([...el.stepList.children].indexOf(li) + 1);
    });
    document.querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => setSource(b.dataset.source)));
    document.querySelectorAll(".det").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.det;
      if (k === "pressure-off") setDetected("pressure", !S.pressure);
      else if (k === "wound") { if (!S.target) setTarget(S.source === "sim" ? toNorm(SIM_WOUND) : toNorm(DEFAULT_TARGET), 0.9); setDetected("wound", true, 0.9); }
      else setDetected(k, true, 0.9);
    }));
    $("skip30").addEventListener("click", () => { if (S.step === 3) { S.hold += 30; log("hold", "+30s"); } });
    $("clearTarget").addEventListener("click", () => { clearInterval(jitterTimer); jitterTimer = null; setTarget(null); renderAll(); });
    $("homeBtn").addEventListener("click", goHome);
    $("resetBtn").addEventListener("click", () => { S.det.call911 = false; goHome(); el.log.innerHTML = ""; });
    $("consoleToggle").addEventListener("click", toggleConsole);

    el.optAuto.addEventListener("change", () => { opts.auto = el.optAuto.checked; });
    el.optVoice.addEventListener("change", () => { opts.voice = el.optVoice.checked; if (!opts.voice && "speechSynthesis" in window) speechSynthesis.cancel(); });
    el.optAutoplay.addEventListener("change", () => { opts.autoplay = el.optAutoplay.checked; clearTimers(); scheduleAutoplay(); });
    el.optSpeed.addEventListener("change", () => { opts.speed = +el.optSpeed.value; });

    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input, select, textarea")) return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") back();
      else if (e.key.toLowerCase() === "c") toggleConsole();
      else if (e.key.toLowerCase() === "h") goHome();
      else if (e.key.toLowerCase() === "s") speak(lastSpoken);
    });
    if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => {};
  }

  function toggleConsole() {
    const hidden = el.bench.classList.toggle("no-console");
    $("consoleToggle").setAttribute("aria-pressed", String(!hidden));
  }

  // ---------------------------------------------------------------- boot
  buildStatic();
  bind();
  syncSourceUI();
  renderAll();
  requestAnimationFrame(frame);

  const params = new URLSearchParams(location.search);
  if (params.get("ws")) connectWs(params.get("ws"));
  if (params.get("stream")) attachStream(params.get("stream"));
  if (params.get("autoplay") === "1") { opts.autoplay = el.optAutoplay.checked = true; }
  if (params.get("console") === "0") toggleConsole();
})();
