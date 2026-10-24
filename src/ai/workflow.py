"""Decision workflow: observation -> classified candidates -> protocol selection -> prioritized plan.

The AI only *selects* a protocol ID. Steps come verbatim from protocols/.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from .classifier import Candidate, classify
from .priority import DispatchPlan, build_dispatch_plan
from .protocols import FALLBACK_ID, Protocol, load_protocols
from .understanding import Observation, understand

CONFIDENT = 0.70      # select protocol outright
POSSIBLE = 0.40       # ask a clarifying question, but still escalate
MARGIN = 0.15         # min gap between top two to be "confident"
SECONDARY = 0.50      # other protocols at/above this are queued behind the primary


class Decision(str, Enum):
    SELECTED = "selected"        # confident match
    CLARIFY = "clarify"          # plausible but uncertain: ask a question
    UNKNOWN = "unknown"          # no match: safe default protocol


@dataclass
class WorkflowResult:
    decision: Decision
    protocol: Protocol
    confidence: float
    candidates: list[Candidate]
    plan: DispatchPlan
    clarifying_question: str | None = None
    secondary_protocols: list[Protocol] = field(default_factory=list)
    observation: Observation | None = None
    notes: list[str] = field(default_factory=list)


class EmergencyWorkflow:
    def __init__(self, protocols: dict[str, Protocol] | None = None, client=None, use_llm: bool | None = None):
        self.protocols = protocols or load_protocols()
        self.client = client
        self.use_llm = use_llm

    def handle_text(self, text: str, extra_signs: dict[str, float] | None = None) -> WorkflowResult:
        """Entry point. `extra_signs` carries vision/sensor-derived signs (tag -> confidence)."""
        obs = understand(text, client=self.client, use_llm=self.use_llm)
        if extra_signs:
            obs.merge(extra_signs)
        return self.decide(obs)

    def decide(self, obs: Observation) -> WorkflowResult:
        candidates = classify(obs, self.protocols)
        notes: list[str] = []
        fallback = self.protocols[FALLBACK_ID]

        if not candidates or candidates[0].score < POSSIBLE:
            decision, primary, confidence, question = Decision.UNKNOWN, fallback, 0.0, fallback.clarifying_question
            notes.append("No protocol matched confidently; using safe default.")
            if candidates:
                confidence = candidates[0].score
        else:
            top = candidates[0]
            runner_up = candidates[1].score if len(candidates) > 1 else 0.0
            primary = self.protocols[top.protocol_id]
            confidence = top.score
            if top.score >= CONFIDENT and (top.score - runner_up) >= MARGIN:
                decision, question = Decision.SELECTED, None
            elif top.score >= CONFIDENT:
                # Close call between protocols: the more urgent one leads (never delays CPR for a tie).
                close = [c for c in candidates if top.score - c.score < MARGIN]
                primary = min((self.protocols[c.protocol_id] for c in close), key=lambda p: p.priority)
                confidence = next(c.score for c in close if c.protocol_id == primary.id)
                decision, question = Decision.SELECTED, None
                notes.append("Close scores; most urgent protocol chosen.")
            else:
                decision, question = Decision.CLARIFY, primary.clarifying_question
                notes.append("Plausible but uncertain; asking a clarifying question while escalating.")

        secondary = [
            self.protocols[c.protocol_id]
            for c in candidates
            if c.score >= SECONDARY and c.protocol_id != primary.id
        ]
        secondary.sort(key=lambda p: p.priority)

        plan = build_dispatch_plan(primary, secondary, uncertain=decision is not Decision.SELECTED)
        return WorkflowResult(decision, primary, confidence, candidates, plan, question, secondary, obs, notes)
