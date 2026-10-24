# Medically Reviewed Protocols

Source of truth for all first-aid steps. The AI may only *select* a protocol by ID; it may not edit or invent steps.

Planned files (one per workflow): `cpr.yaml`, `severe_bleeding.yaml`, `stroke.yaml`, `choking.yaml`, `seizure.yaml`, `allergic_reaction.yaml`.

Each protocol should include: `id`, `title`, `trigger_signs`, `steps[]` (text, spoken text, observable action, confirmation needed), `escalate_to_emergency_services`, `reviewed_by`, `source`.

Changes require PR review with the reviewer named in `reviewed_by`.
