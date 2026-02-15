import unittest

from idk.inference_pipeline import InMemoryTraceSink, LabFeaturesV1, run_inference


class DummyModel:
    def __init__(self):
        self.called = 0

    def predict_proba(self, rows):
        self.called += 1
        return [[0.2, 0.8]]


class InferencePipelineTests(unittest.TestCase):
    def _valid_features(self):
        return LabFeaturesV1(
            age_years=30,
            sex="female",
            hgb_g_dl=11.4,
            mcv_fl=78,
            mch_pg=25,
            mchc_g_dl=31,
            rdw_pct=16.0,
            rbc_10e12_l=4.1,
            plt_10e9_l=250,
            wbc_10e9_l=6.5,
            glucose_mmol_l=5.2,
            total_cholesterol_mmol_l=4.8,
            bmi_kg_m2=23.0,
        )

    def test_out_of_scope_skips_model_call(self):
        model = DummyModel()
        sink = InMemoryTraceSink(records=[])
        features = LabFeaturesV1(age_years=17, sex="female")

        response = run_inference(
            features,
            model,
            model_version="model-v1",
            threshold=0.6,
            threshold_version="th-v1",
            trace_sink=sink,
        )

        self.assertEqual(response.status, "out_of_scope")
        self.assertEqual(response.decision, "out_of_scope")
        self.assertIsNone(response.risk_score)
        self.assertEqual(model.called, 0)
        self.assertEqual(len(sink.records), 1)

    def test_valid_case_predicts_and_traces(self):
        model = DummyModel()
        sink = InMemoryTraceSink(records=[])

        response = run_inference(
            self._valid_features(),
            model,
            model_version="model-v1",
            threshold=0.6,
            threshold_version="th-v1",
            trace_sink=sink,
        )

        self.assertEqual(response.status, "ok")
        self.assertEqual(response.decision, "high_risk")
        self.assertAlmostEqual(response.risk_score, 0.8)
        self.assertEqual(model.called, 1)
        self.assertEqual(sink.records[0].model_version, "model-v1")
        self.assertEqual(sink.records[0].threshold_version, "th-v1")


if __name__ == "__main__":
    unittest.main()
