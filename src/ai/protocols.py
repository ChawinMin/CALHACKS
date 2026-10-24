"""Loader for medically reviewed protocols. Read-only: the AI may only select by ID."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

PROTOCOL_DIR = Path(__file__).resolve().parents[2] / "protocols"
FALLBACK_ID = "unknown_emergency"


@dataclass(frozen=True)
class Step:
    id: str
    text: str
    spoken: str
    observable_action: str | None
    needs_confirmation: bool


@dataclass(frozen=True)
class Protocol:
    id: str
    title: str
    priority: int
    escalate_to_emergency_services: bool
    dispatcher_summary: str
    clarifying_question: str
    trigger_signs: dict[str, float]
    steps: tuple[Step, ...]
    reviewed_by: str
    source: str

    @property
    def is_reviewed(self) -> bool:
        return not self.reviewed_by.upper().startswith("PENDING")


def _parse(data: dict) -> Protocol:
    steps = tuple(Step(**s) for s in data["steps"])
    return Protocol(
        id=data["id"],
        title=data["title"],
        priority=int(data["priority"]),
        escalate_to_emergency_services=bool(data["escalate_to_emergency_services"]),
        dispatcher_summary=data["dispatcher_summary"],
        clarifying_question=data["clarifying_question"],
        trigger_signs={k: float(v) for k, v in (data.get("trigger_signs") or {}).items()},
        steps=steps,
        reviewed_by=data["reviewed_by"],
        source=data["source"],
    )


def load_protocols(directory: Path = PROTOCOL_DIR) -> dict[str, Protocol]:
    protocols: dict[str, Protocol] = {}
    for path in sorted(directory.glob("*.yaml")):
        with path.open(encoding="utf-8") as f:
            protocol = _parse(yaml.safe_load(f))
        protocols[protocol.id] = protocol
    if FALLBACK_ID not in protocols:
        raise FileNotFoundError(f"Required fallback protocol '{FALLBACK_ID}' missing in {directory}")
    return protocols
