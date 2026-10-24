"""Score observed signs against each protocol's trigger_signs (noisy-OR)."""
from __future__ import annotations

from dataclasses import dataclass

from .protocols import FALLBACK_ID, Protocol
from .understanding import Observation


@dataclass(frozen=True)
class Candidate:
    protocol_id: str
    score: float                 # 0..1
    matched_signs: tuple[str, ...]


def classify(obs: Observation, protocols: dict[str, Protocol]) -> list[Candidate]:
    """Return candidates with score > 0, best first."""
    candidates: list[Candidate] = []
    for pid, proto in protocols.items():
        if pid == FALLBACK_ID:
            continue
        miss = 1.0
        matched = []
        for sign, weight in proto.trigger_signs.items():
            conf = obs.signs.get(sign, 0.0)
            if conf > 0:
                miss *= 1.0 - weight * conf
                matched.append(sign)
        if matched:
            candidates.append(Candidate(pid, round(1.0 - miss, 4), tuple(matched)))
    # Ties: more urgent protocol first.
    candidates.sort(key=lambda c: (-c.score, protocols[c.protocol_id].priority))
    return candidates
