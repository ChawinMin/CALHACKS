# Team Workflow

## Phases
| Phase | Tasks | Goal |
|---|---|---|
| 1 – Core MVP | 1, 2, 3, 5 | One complete emergency training workflow (start with **CPR**) working with camera + voice |
| 2 – Hardware | 4, 7 | ESP32 sensors streaming into the app; modules integrated; offline fallback |
| 3 – Final app | 6, 8 | Polished UI, handoff summary, testing, demo |

Finish Phase 1 end-to-end before widening scope. A thin working slice beats many half-built features.

## Suggested ownership
One **owner** per task, others review. Put names in `docs/TASKS.md`.

| Role | Tasks |
|---|---|
| Vision lead | 1 |
| AI / protocol lead | 2, 5 |
| Voice lead | 3 |
| Hardware lead | 4 |
| Integration / UI lead | 6, 7 |
| Everyone | 8 (testing) |

## Daily loop
1. Pull `main`, check `docs/TASKS.md` and open Issues.
2. Create a branch `task<N>/<short-description>` (e.g. `task1/pose-estimation`).
3. Commit small, push often.
4. Open a PR early (draft is fine) and request 1 reviewer.
5. Merge into `main` after review; tick the checkbox in `docs/TASKS.md`.
6. 5-minute sync at the start and end of each work block: done / next / blocked.

## Interfaces between modules
Agree on these early so people can work in parallel:
- **Vision -> AI:** JSON of observations (pose keypoints, hand positions, detected injuries, timestamp).
- **Sensors -> Python:** JSON lines `{ "t": ms, "accel": [x,y,z], "gyro": [x,y,z], "hr": bpm|null }`.
- **Voice <-> Guidance:** `speak(text)`, `on_command(callback)`.
- **AI -> Guidance:** selects a protocol ID from `protocols/`; never emits free-form medical steps.

## Safety rules (non-negotiable)
- Protocols live in `protocols/` and change only via PR with a named reviewer.
- AI output is limited to *choosing* a protocol and *describing observations*; the safety guard in `src/integration/` blocks anything else.
- Unknown or low confidence -> fall back to "call emergency services" and dispatcher instructions.
- Every module must degrade gracefully if camera, mic, or sensors are missing.

## Definition of done (per task)
- Runs on a teammate's machine from README steps
- Has a basic test or documented manual test in `tests/`
- Reviewed and merged to `main`
- Checkbox ticked in `docs/TASKS.md`
