"""Run with python3 .github/ci/test_workflow_jobs.py; no dependencies.

Reads ci.yml as text: these checks only need to know that a job exists and which
commands it runs, so they avoid a YAML dependency on the runner.
"""

import re
import unittest
from pathlib import Path

WORKFLOW = Path(__file__).resolve().parents[1] / "workflows" / "ci.yml"


def job_block(name: str) -> str:
    text = WORKFLOW.read_text()
    match = re.search(rf"^  {re.escape(name)}:\n(.*?)(?=^  [A-Za-z0-9_-]+:\n|\Z)", text, re.S | re.M)
    if match is None:
        raise AssertionError(f"ci.yml has no job named {name!r}")
    return match.group(1)




class NodeBackendJobsTest(unittest.TestCase):
    def test_backend_node_tests_job_lints_typechecks_and_tests_with_coverage(self):
        block = job_block("backend-node-tests")
        for command in ("npm ci", "npm run lint", "npm run typecheck", "npm test -- --coverage"):
            self.assertIn(command, block)

    def test_backend_node_tests_job_has_a_redis_service_and_passes_redis_url(self):
        block = job_block("backend-node-tests")
        self.assertIn("image: redis:8-alpine", block)
        self.assertIn("REDIS_URL: redis://127.0.0.1:${{ job.services.redis.ports['6379'] }}/0", block)








if __name__ == "__main__":
    unittest.main()
