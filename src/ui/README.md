# VisionER front end (`src/ui/`)

The AR glasses view for the Cal Hacks demo: **controlling bleeding from a limb wound with gauze**, five steps, end to end. The laptop screen stands in for the glasses display. The other emergencies are shown on the home screen as roadmap and are not functional.

No backend and no build step: plain HTML, CSS and JS that run entirely in the browser. Open `src/ui/index.html` directly, or serve the folder with any static file server if you prefer a localhost URL:

```bash
python -m http.server 5173 --directory src/ui
```

The only network request is the Google Sans font from Google Fonts; without internet it falls back to the system sans.

## What's on screen

| Layer | Contents |
|---|---|
| Scene | Simulated forearm with a wound (default), or the webcam / vision stream |
| Holograms | Scan sweep, wound outline, gauze placement, ghost hands pressing, bandage wrap. All anchored to the current target box |
| HUD | Step card, progress dots, elapsed clock, 911 badge, 3:00 pressure ring, safety warning, kit chips, EMS handoff card |
| Console (right) | Operator controls for the demo: source, step list, simulated detections, autoplay, clock speed, hook log |

Every step can be advanced by hand (**Next**, → or Space), so the demo still runs if detection is unreliable on stage. You can also **drag a box on the lens** to place the wound target manually.

Keys: `→`/`Space` next · `←` back · `C` toggle console · `H` home · `S` repeat the last spoken line.

URL options: `?autoplay=1` (simulated vision runs the whole flow), `?console=0`.

## Steps and what advances them

| # | id | Instruction | Auto-advances when |
|---|---|---|---|
| 1 | `gloves-911` | Put on gloves. Call 911. | `gloves` detected **and** `call911` confirmed |
| 2 | `find-wound` | Find the wound. | a target is set and held ~1.2 s, or `wound` detected |
| 3 | `place-gauze` | Place gauze on the wound. | `gauze` detected |
| 4 | `press-hold` | Press hard. Hold. | 3:00 of pressure held |
| 5 | `wrap` | Wrap with a bandage, then stay with them | `bandage` detected → "Stay with them" + EMS handoff |

During step 4: `soak` switches to "add gauze on top" until `gauze` is detected again (layer count goes up), and `pressure=false` pauses the timer and flashes "don't lift" until `pressure=true`.

Step text lives in [`protocol.js`](protocol.js). It follows AHA lay-rescuer / Stop the Bleed guidance but **has not been clinician-reviewed**.

## Vision hooks: `window.VisionER`

```js
VisionER.attachStream(stream)   // a MediaStream (e.g. from getUserMedia). null = back to simulated scene
VisionER.setTarget(box, conf?)  // {x, y, w, h} of the wound in the camera frame. null clears it
VisionER.setDetected(label, value = true, conf?)
VisionER.goTo(step)             // step id ("press-hold"), 1-based number (4), "stay" or "home"
VisionER.onStep((n, id) => {})  // tells vision which detector to run
VisionER.state                  // current step, target, detections, hold time
```

- `box` can be normalized (0–1) or pixels in the camera frame; arrays `[x, y, w, h]` work too. The UI handles the crop from `object-fit: cover`, so send raw frame coordinates.
- Labels: `gloves`, `call911`, `wound`, `gauze`, `trauma_pad`, `bandage`, `soak`, `pressure`. Case, spaces and dashes don't matter.

Detection runs in the browser too: call the hooks from the same page, e.g. a MediaPipe or TensorFlow.js model reading `document.getElementById("cam")`. There is no server to send detections to.
