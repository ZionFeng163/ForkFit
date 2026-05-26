import unittest
from datetime import datetime, timezone
from unittest.mock import Mock

from forkfit.config import Settings
from forkfit.fixtures import demo_meal_pack
from forkfit.models import LLMCallTrace, RunTrace, StepTrace
from forkfit.observability import LangSmithRunExporter
from forkfit.stores.base import RunRecord


class LangSmithRunExporterTests(unittest.TestCase):
    def test_disabled_exporter_does_not_upload(self):
        client = Mock()
        exporter = LangSmithRunExporter(Settings(langsmith_tracing=False), client=client)

        exporter.export_run(self._record())

        client.create_run.assert_not_called()

    def test_enabled_exporter_uploads_trace_metrics(self):
        client = Mock()
        exporter = LangSmithRunExporter(
            Settings(
                langsmith_tracing=True,
                langsmith_api_key="test-key",
                langsmith_project="forkfit-test",
            ),
            client=client,
        )

        exporter.export_run(self._record())

        client.create_run.assert_called_once()
        kwargs = client.create_run.call_args.kwargs
        self.assertEqual(kwargs["name"], "forkfit.workflow")
        self.assertEqual(kwargs["project_name"], "forkfit-test")
        self.assertEqual(kwargs["outputs"]["llm_call_count"], 1)
        self.assertEqual(kwargs["outputs"]["total_duration_ms"], 12.5)
        self.assertEqual(
            kwargs["extra"]["metadata"]["step_durations_ms"],
            {"user_agent": 12.5},
        )
        self.assertEqual(
            kwargs["extra"]["metadata"]["llm_calls"][0]["agent"],
            "user",
        )

    def test_upload_failure_does_not_raise(self):
        client = Mock()
        client.create_run.side_effect = RuntimeError("network unavailable")
        exporter = LangSmithRunExporter(
            Settings(langsmith_tracing=True, langsmith_api_key="test-key"),
            client=client,
        )

        exporter.export_run(self._record())

        client.create_run.assert_called_once()

    def _record(self) -> RunRecord:
        now = datetime.now(timezone.utc)
        return RunRecord(
            id="run_test",
            user_id="demo_user",
            status="succeeded",
            input_payload={},
            original_meal_pack=demo_meal_pack(),
            trace=RunTrace(
                steps=[
                    StepTrace(
                        node="user_agent",
                        duration_ms=12.5,
                        status="success",
                    )
                ],
                llm_calls=[
                    LLMCallTrace(
                        agent="user",
                        model="qwen3.6-flash",
                        duration_ms=12.0,
                        prompt_tokens=100,
                        completion_tokens=50,
                        status="success",
                    )
                ],
            ),
            created_at=now,
            started_at=now,
            finished_at=now,
        )


if __name__ == "__main__":
    unittest.main()
