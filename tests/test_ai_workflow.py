import unittest

from src.ai import Decision, EmergencyWorkflow
from src.ai.protocols import load_protocols


class WorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.wf = EmergencyWorkflow(use_llm=False)  # keyword mode: deterministic, offline

    def pid(self, text, **kw):
        return self.wf.handle_text(text, **kw)

    def test_protocols_load(self):
        self.assertGreaterEqual(len(load_protocols()), 7)

    def test_cpr(self):
        r = self.pid("He collapsed, is unresponsive and not breathing")
        self.assertEqual(r.protocol.id, "cpr")
        self.assertEqual(r.decision, Decision.SELECTED)
        self.assertTrue(r.plan.call_emergency_services)

    def test_bleeding_calls_first(self):
        r = self.pid("Blood is spurting from his leg, bleeding a lot")
        self.assertEqual(r.protocol.id, "severe_bleeding")
        self.assertEqual(r.plan.ordered_steps[0].id, "call_911")
        self.assertTrue(r.plan.call_immediately)

    def test_stroke(self):
        r = self.pid("Her face is drooping, her arm is weak and speech is slurred")
        self.assertEqual(r.protocol.id, "stroke")

    def test_choking(self):
        r = self.pid("He is clutching his throat and can't speak or cough")
        self.assertEqual(r.protocol.id, "choking")

    def test_seizure(self):
        r = self.pid("She is convulsing on the floor, shaking uncontrollably")
        self.assertEqual(r.protocol.id, "seizure")

    def test_allergic(self):
        r = self.pid("He ate peanuts, his tongue is swollen and he is wheezing")
        self.assertEqual(r.protocol.id, "allergic_reaction")

    def test_negation(self):
        r = self.pid("He is not breathing... actually he is breathing, no bleeding")
        self.assertNotIn("heavy_bleeding", r.observation.signs)

    def test_unknown_falls_back_and_escalates(self):
        r = self.pid("My friend seems off")
        self.assertEqual(r.decision, Decision.UNKNOWN)
        self.assertEqual(r.protocol.id, "unknown_emergency")
        self.assertTrue(r.plan.call_emergency_services)
        self.assertIsNotNone(r.clarifying_question)

    def test_uncertain_asks_question(self):
        r = self.pid("There is a cut and some blood")
        self.assertEqual(r.decision, Decision.UNKNOWN if r.confidence < 0.4 else Decision.CLARIFY)
        self.assertTrue(r.plan.call_emergency_services)

    def test_vision_signs_merge(self):
        r = self.pid("Man on the ground", extra_signs={"unresponsive": 0.9, "not_breathing": 0.9})
        self.assertEqual(r.protocol.id, "cpr")

    def test_llm_failure_falls_back(self):
        class Broken:
            class messages:
                @staticmethod
                def create(**_):
                    raise RuntimeError("offline")

        wf = EmergencyWorkflow(client=Broken())
        r = wf.handle_text("not breathing and unresponsive")
        self.assertEqual(r.observation.source, "keywords")
        self.assertEqual(r.protocol.id, "cpr")

    def test_secondary_and_priority(self):
        r = self.pid("Unresponsive, not breathing, and blood is spurting from his arm")
        self.assertEqual(r.protocol.id, "cpr")
        self.assertIn("severe_bleeding", r.plan.queued_protocols)


if __name__ == "__main__":
    unittest.main()
