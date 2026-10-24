// Wound detection client. Sends camera frames to /api/classify (src/vision/server.py),
// then drives VisionER: setTarget() with the located box, setDetected("wound") for bleeding types.
// Also lets you load a dataset photo as the "camera" so the flow can be tried without a real wound.
(() => {
  const V = window.VisionER;
  const $ = (id) => document.getElementById(id);
  const cam = $("cam"), chip = $("woundChip"), probsEl = $("woundProbs"), file = $("woundFile");
  const NAMES = { Abrasions: "Abrasion", Bruises: "Bruise", Burns: "Burn", Cut: "Cut", Ingrown_nails: "Ingrown nail", Laceration: "Laceration", Stab_wound: "Stab wound" };
  const MIN_CONF = 0.55, NEED = 3, EVERY_MS = 600;
  const canvas = document.createElement("canvas");
  let timer = null, busy = false, recent = [], locked = false, imgStream = null, redraw = null;

  function setChip(text, cls) {
    chip.textContent = text; chip.className = "pill " + (cls || ""); chip.hidden = !text;
  }

  function showProbs(p) {
    probsEl.innerHTML = Object.entries(p).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([k, v]) => `<li><span>${NAMES[k] || k}</span><i style="--w:${Math.round(v * 100)}%"></i><b>${Math.round(v * 100)}%</b></li>`).join("");
  }

  async function classify() {
    if (busy || cam.hidden || !cam.videoWidth) return;
    busy = true;
    try {
      canvas.width = 320; canvas.height = Math.round(320 * cam.videoHeight / cam.videoWidth);
      canvas.getContext("2d").drawImage(cam, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
      const res = await fetch("/api/classify", { method: "POST", body: blob });
      const r = await res.json();
      if (r.error) throw new Error(r.error);
      handle(r);
    } catch (e) {
      setChip("Wound AI offline: run python -m src.vision.server", "warn");
    } finally { busy = false; }
  }

  function handle(r) {
    showProbs(r.probs);
    const name = NAMES[r.label] || r.label, pct = Math.round(r.confidence * 100);
    if (r.confidence < MIN_CONF) { recent = []; setChip(`No clear wound (${name} ${pct}%)`); return; }
    recent.push(r.label); recent = recent.slice(-NEED);
    const stable = recent.length === NEED && recent.every((l) => l === r.label);
    if (!r.bleeding) {
      setChip(`${name} ${pct}%: not a bleeding wound`, "warn");
      return;
    }
    setChip(`${name} ${pct}%${stable ? "" : " …"}`, "live");
    if (!stable) return;
    if (V.state.screen !== "guide") return;          // wait for the user to press Start
    V.setTarget(r.box, r.confidence);                // keep the box following the wound
    if (!locked && V.state.stepId === "find-wound") { locked = true; V.setDetected("wound", true, r.confidence); }
  }

  function begin() { if (!timer) timer = setInterval(classify, EVERY_MS); }
  function end() { clearInterval(timer); timer = null; recent = []; locked = false; setChip(""); probsEl.innerHTML = ""; }

  // Watch the camera element: any attached stream (webcam, vision stream, loaded photo) is analysed.
  new MutationObserver(() => (cam.hidden ? end() : begin())).observe(cam, { attributes: true, attributeFilter: ["hidden"] });
  V.onStep((n) => { if (n <= 2) locked = false; });
  document.addEventListener("click", (e) => { if (e.target.closest("#homeBtn,#resetBtn")) locked = false; });

  // Load a photo as the camera feed.
  $("woundLoad").addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    const f = file.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 1280; c.height = 720;
      const g = c.getContext("2d");
      const draw = () => {
        g.fillStyle = "#26221e"; g.fillRect(0, 0, c.width, c.height);
        const s = Math.min(c.width / img.width, c.height / img.height);
        g.drawImage(img, (c.width - img.width * s) / 2, (c.height - img.height * s) / 2, img.width * s, img.height * s);
      };
      draw();
      if (imgStream) imgStream.getTracks().forEach((t) => t.stop());
      imgStream = c.captureStream(5);
      locked = false; recent = [];
      V.attachStream(imgStream);
      clearInterval(redraw);
      redraw = setInterval(draw, 200);              // keep the stream producing frames
    };
    img.src = URL.createObjectURL(f);
    file.value = "";
  });
})();
