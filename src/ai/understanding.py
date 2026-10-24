"""Turn a free-text description (plus optional vision/sensor signs) into structured observations.

The model may only choose from SIGN_VOCABULARY; it never selects protocols or writes instructions.
If no API key / network is available, a keyword extractor is used so the system works offline.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

MODEL = "claude-haiku-5-5"

SIGN_VOCABULARY: dict[str, str] = {
    "unresponsive": "person does not respond to voice or touch",
    "collapsed": "person suddenly collapsed",
    "not_breathing": "person is not breathing",
    "abnormal_breathing": "gasping, labored or abnormal breathing",
    "no_pulse": "no pulse detected",
    "heavy_bleeding": "heavy external bleeding",
    "spurting_blood": "blood spurting from a wound",
    "blood_soaking_through": "blood soaking through bandage or clothing",
    "visible_wound": "a visible wound or cut",
    "amputation": "limb or body part cut off",
    "face_droop": "one side of face drooping",
    "arm_weakness": "arm weakness or numbness on one side",
    "speech_difficulty": "slurred or confused speech",
    "sudden_confusion": "sudden confusion",
    "severe_headache": "sudden severe headache",
    "vision_loss": "sudden vision loss",
    "loss_of_balance": "sudden dizziness or loss of balance",
    "clutching_throat": "hands clutching throat",
    "cannot_speak_cough": "cannot speak or cough",
    "choking_on_food": "choking on food or object",
    "turning_blue": "lips or face turning blue",
    "convulsions": "convulsing / shaking uncontrollably",
    "jerking_movements": "jerking limbs",
    "staring_unresponsive": "blank staring",
    "loss_of_consciousness": "passed out",
    "seizure_history": "known seizure disorder / epilepsy",
    "hives_swelling": "hives or swelling of skin/face",
    "swollen_tongue_throat": "swelling of tongue, lips or throat",
    "wheezing": "wheezing",
    "known_allergen_exposure": "recent exposure to a known allergen (sting, food, drug)",
    "dizzy_faint": "dizzy or faint",
}

# Keyword fallback. Negation is handled crudely in _negated().
_KEYWORDS: dict[str, list[str]] = {
    "unresponsive": [r"unresponsive", r"not responding", r"won'?t wake", r"unconscious", r"no response"],
    "collapsed": [r"collaps"],
    "not_breathing": [r"not breathing", r"stopped breathing", r"isn'?t breathing", r"no breathing", r"can'?t breathe"],
    "abnormal_breathing": [r"gasping", r"hard to breathe", r"trouble breathing", r"difficulty breathing", r"short of breath"],
    "no_pulse": [r"no pulse", r"can'?t find a pulse", r"without a pulse"],
    "heavy_bleeding": [r"bleeding (a lot|heavily|badly|profusely)", r"heavy bleeding", r"lots? of blood", r"severe bleeding"],
    "spurting_blood": [r"spurt", r"squirting"],
    "blood_soaking_through": [r"soaking through", r"soaked (through|the)", r"won'?t stop bleeding", r"bleeding (won'?t|will not) stop"],
    "visible_wound": [r"\bcut\b", r"\bwound\b", r"\bstabbed\b", r"gash", r"laceration", r"\bbleeding\b"],
    "amputation": [r"amputat", r"severed", r"cut off"],
    "face_droop": [r"face (is )?droop", r"drooping", r"lopsided", r"crooked smile"],
    "arm_weakness": [r"arm (is )?(weak|numb)", r"can'?t (lift|raise) (his|her|their|an|the) arm", r"numb(ness)? (on )?one side", r"weak(ness)? on one side"],
    "speech_difficulty": [r"slurr", r"can'?t speak", r"trouble speaking", r"speech"],
    "sudden_confusion": [r"confus", r"disoriented"],
    "severe_headache": [r"worst headache", r"severe headache", r"sudden headache"],
    "vision_loss": [r"can'?t see", r"lost (their |his |her )?vision", r"vision (loss|blurr)"],
    "loss_of_balance": [r"loss of balance", r"lost balance", r"can'?t walk straight", r"dizzy"],
    "clutching_throat": [r"clutch\w* (his |her |their )?(throat|neck)", r"hands (at|on) (his |her |their )?throat"],
    "cannot_speak_cough": [r"can'?t (speak|talk|cough)", r"cannot (speak|talk|cough)", r"unable to (speak|cough)"],
    "choking_on_food": [r"chok", r"swallowed wrong", r"something stuck"],
    "turning_blue": [r"turning blue", r"blue lips", r"cyanos"],
    "convulsions": [r"convuls", r"seiz", r"fitting"],
    "jerking_movements": [r"jerk", r"shaking uncontrollably", r"twitch"],
    "staring_unresponsive": [r"staring", r"blank stare", r"zoned out"],
    "loss_of_consciousness": [r"passed out", r"fainted", r"blacked out", r"unconscious"],
    "seizure_history": [r"epilep", r"seizure disorder", r"history of seizures"],
    "hives_swelling": [r"hives", r"rash", r"swollen (face|lips|eyes)", r"swelling"],
    "swollen_tongue_throat": [r"swollen (tongue|throat)", r"tongue (is )?swell", r"throat (is )?(closing|swell|tight)", r"lips? swell"],
    "wheezing": [r"wheez"],
    "known_allergen_exposure": [r"allerg", r"peanut", r"bee sting", r"\bstung\b", r"shellfish", r"epipen", r"anaphyla"],
    "dizzy_faint": [r"faint", r"lightheaded", r"dizzy"],
}

_NEGATORS = r"(no|not|isn'?t|aren'?t|wasn'?t|without|never|denies?)\W+(\w+\W+){0,2}$"


@dataclass
class Observation:
    """Structured result of understanding a report. `signs` maps vocabulary tag -> confidence (0..1)."""
    text: str
    signs: dict[str, float] = field(default_factory=dict)
    source: str = "keywords"   # "llm" | "keywords"

    def merge(self, extra: dict[str, float]) -> "Observation":
        """Add signs from other sources (vision, sensors). Keeps the higher confidence."""
        for sign, conf in extra.items():
            if sign in SIGN_VOCABULARY:
                self.signs[sign] = max(self.signs.get(sign, 0.0), float(conf))
        return self


def _negated(text: str, start: int) -> bool:
    return re.search(_NEGATORS, text[max(0, start - 30):start]) is not None


def extract_signs_keywords(text: str) -> dict[str, float]:
    lowered = text.lower()
    signs: dict[str, float] = {}
    for sign, patterns in _KEYWORDS.items():
        for pat in patterns:
            for m in re.finditer(pat, lowered):
                if not _negated(lowered, m.start()):
                    signs[sign] = 0.8
                    break
            if sign in signs:
                break
    return signs


def _extract_signs_llm(text: str, client=None) -> dict[str, float]:
    import anthropic

    client = client or anthropic.Anthropic()
    tool = {
        "name": "report_signs",
        "description": "Report which observed signs are present in the bystander's description.",
        "input_schema": {
            "type": "object",
            "properties": {
                "signs": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "sign": {"type": "string", "enum": list(SIGN_VOCABULARY)},
                            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                        },
                        "required": ["sign", "confidence"],
                    },
                }
            },
            "required": ["signs"],
        },
    }
    vocab = "\n".join(f"- {k}: {v}" for k, v in SIGN_VOCABULARY.items())
    resp = client.messages.create(
        model=MODEL,
        max_tokens=512,
        system=(
            "You extract observed signs from an emergency bystander's description. "
            "Only report signs that are stated or clearly implied; respect negations "
            "('not bleeding' means no bleeding sign). Never give medical advice. "
            f"Allowed signs:\n{vocab}"
        ),
        tools=[tool],
        tool_choice={"type": "tool", "name": "report_signs"},
        messages=[{"role": "user", "content": text}],
    )
    for block in resp.content:
        if block.type == "tool_use":
            return {
                s["sign"]: max(0.0, min(1.0, float(s["confidence"])))
                for s in block.input.get("signs", [])
                if s.get("sign") in SIGN_VOCABULARY
            }
    return {}


def understand(text: str, client=None, use_llm: bool | None = None) -> Observation:
    """Understand a description. Falls back to keywords on any LLM failure or when offline."""
    if use_llm is None:
        use_llm = client is not None or bool(os.environ.get("ANTHROPIC_API_KEY"))
    if use_llm:
        try:
            return Observation(text, _extract_signs_llm(text, client), source="llm")
        except Exception:
            pass  # offline / API error: safety-critical path must still work
    return Observation(text, extract_signs_keywords(text), source="keywords")
