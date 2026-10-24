# EmergencyAI (CALHACKS)

Real-time emergency first-aid assistant combining computer vision, an AI workflow engine, a voice assistant, and ESP32 biomedical sensors.

> **Safety:** This is a training/demo project, not a medical device. The AI selects and narrates *medically reviewed* protocols from `protocols/`; it must never invent or override them.

## Repository layout

| Path | Task | Purpose |
|---|---|---|
| `src/vision/` | 1 | Webcam, pose, hand tracking, injury/object detection |
| `src/ai/` | 2 | Scenario classification, decision workflow, uncertainty handling |
| `src/voice/` | 3 | Speech-to-text, text-to-speech, voice commands |
| `src/hardware/` + `firmware/` | 4 | ESP32 / MPU6050 / heartbeat module, serial/WiFi to Python |
| `src/guidance/` | 5 | CPR, bleeding, stroke, choking, seizure, allergic reaction workflows |
| `src/ui/` | 6 | Emergency button, camera view, timers, handoff summary |
| `src/integration/` | 7 | Wiring modules together, offline fallback, safety guard |
| `tests/` | 8 | Accuracy, latency, failure and escalation tests |
| `protocols/` | 2, 5, 7 | Medically reviewed protocol definitions (source of truth) |
| `docs/` | all | Workflow and task board |

## Start here
1. Read [docs/WORKFLOW.md](docs/WORKFLOW.md) – how we work as a team.
2. Pick a task in [docs/TASKS.md](docs/TASKS.md) and claim it.
3. Follow [CONTRIBUTING.md](CONTRIBUTING.md) for branches and PRs.
