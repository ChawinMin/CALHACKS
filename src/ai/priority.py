"""Prioritize the emergency call and the instructions given to the user / dispatcher."""
from __future__ import annotations

from dataclasses import dataclass, field

from .protocols import Protocol, Step


@dataclass
class DispatchPlan:
    call_emergency_services: bool
    call_immediately: bool                     # True: call before anything else
    dispatcher_summary: str
    ordered_steps: list[Step] = field(default_factory=list)
    queued_protocols: list[str] = field(default_factory=list)   # follow after the primary

    @property
    def first_instruction(self) -> str:
        return self.ordered_steps[0].spoken if self.ordered_steps else ""


def build_dispatch_plan(primary: Protocol, secondary: list[Protocol], uncertain: bool) -> DispatchPlan:
    """Emergency call comes first. Uncertain cases still escalate (over-triage is the safe error)."""
    escalate = primary.escalate_to_emergency_services or uncertain or any(
        p.escalate_to_emergency_services for p in secondary
    )
    steps = list(primary.steps)
    # Put the 'call_911' step first for urgent protocols so help is on the way before treatment.
    # CPR/choking/bleeding/anaphylaxis (priority <= 2) all call first; 'check_response' stays first for CPR.
    call = next((s for s in steps if s.id == "call_911"), None)
    if call and primary.priority <= 2 and steps[0] is not call and primary.id != "cpr":
        steps.remove(call)
        steps.insert(0, call)

    summary = primary.dispatcher_summary
    if secondary:
        summary += " Also possible: " + "; ".join(p.title.lower() for p in secondary) + "."
    if uncertain:
        summary += " Cause not confirmed."

    return DispatchPlan(
        call_emergency_services=escalate,
        call_immediately=escalate and primary.priority <= 2,
        dispatcher_summary=summary,
        ordered_steps=steps,
        queued_protocols=[p.id for p in secondary],
    )
