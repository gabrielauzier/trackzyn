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


# select-stack:begin python
class ContractDriftJobTest(unittest.TestCase):
    def test_job_runs_the_export_check(self):
        block = job_block("contract-drift")
        self.assertIn("backend/scripts/export_openapi.py --check", block)
        # The comparison must run on the locked dependency set, like the backend tests.
        self.assertIn("uv sync --locked", block)

    def test_job_checks_the_timezone_list_the_node_backend_uses(self):
        self.assertIn("backend/scripts/export_timezones.py --check", job_block("contract-drift"))


# select-stack:end


# select-stack:begin node
class NodeBackendJobsTest(unittest.TestCase):
    def test_backend_node_tests_job_lints_typechecks_and_tests_with_coverage(self):
        block = job_block("backend-node-tests")
        for command in ("npm ci", "npm run lint", "npm run typecheck", "npm test -- --coverage"):
            self.assertIn(command, block)

    def test_backend_node_tests_job_has_a_redis_service_and_passes_redis_url(self):
        block = job_block("backend-node-tests")
        self.assertIn("image: redis:8-alpine", block)
        self.assertIn("REDIS_URL: redis://127.0.0.1:${{ job.services.redis.ports['6379'] }}/0", block)


# select-stack:end


# select-stack:begin multi
class BothStacksJobsTest(unittest.TestCase):
    def test_contract_job_runs_the_suite_against_both_stacks(self):
        block = job_block("contract")
        self.assertRegex(block, r"stack:\s*\[python, node\]")
        self.assertIn("CONTRACT_STACK: ${{ matrix.stack }}", block)
        self.assertIn("node scripts/summary.mjs .logs/result.json --no-skip", block)

    def test_schema_diff_job_runs_the_script_with_its_self_test(self):
        block = job_block("schema-diff")
        self.assertIn("backend-node/scripts/schema-diff.sh --self-test", block)
# select-stack:end


# select-stack:begin multi
class StackJobsTest(unittest.TestCase):
    def test_stack_switch_runs_cases_1_2_4_17_18(self):
        block = job_block("stack-switch")
        self.assertIn("node --test --test-name-pattern='^C(1|2|4|17|18) ' scripts/stack/stack.test.mjs", block)
        self.assertIn("steps.changes.outputs.run_stack_switch", block)

    def test_stack_switch_runs_the_preflight(self):
        self.assertIn("scripts/stack/preflight.sh", job_block("stack-switch"))

    def test_select_stack_job_runs_case_14_for_both_stacks(self):
        block = job_block("select-stack")
        self.assertRegex(block, r"stack:\s*\[python, node\]")
        self.assertIn("ONLY_STACK: ${{ matrix.stack }}", block)
        self.assertIn("node --test --test-name-pattern='^C14 ' scripts/stack/select-stack.test.mjs", block)
        self.assertIn("steps.changes.outputs.run_select_stack", block)


class ChangesWiringTest(unittest.TestCase):
    def test_new_jobs_read_run_backend_node(self):
        for name in ("backend-node-tests", "contract", "schema-diff"):
            with self.subTest(job=name):
                self.assertIn("steps.changes.outputs.run_backend_node", job_block(name))
                self.assertIn("python3 .github/ci/changes.py", job_block(name))

    def test_contract_and_schema_diff_also_run_for_backend_changes(self):
        for name in ("contract", "schema-diff"):
            with self.subTest(job=name):
                self.assertIn("steps.changes.outputs.run_backend ", job_block(name) + " ")


RELEASE = WORKFLOW.with_name("release.yml")


class ReleaseWorkflowTest(unittest.TestCase):
    def test_publishes_three_images(self):
        text = RELEASE.read_text()
        images = re.findall(r"images: \$\{\{ env\.IMAGE_PREFIX \}\}/(launchkit-[a-z-]+)", text)
        self.assertEqual(sorted(images), ["launchkit-backend", "launchkit-backend-node", "launchkit-frontend"])
        node = re.search(r"^  build-backend-node:\n(.*?)(?=^  [a-z-]+:\n)", text, re.S | re.M).group(1)
        self.assertIn("context: ./backend-node", node)
        self.assertIn("file: ./backend-node/Dockerfile", node)
        self.assertRegex(text, r"needs: \[build-backend, build-backend-node, build-frontend\]")


    def test_stack_jobs_read_their_outputs(self):
        for name, output in (("stack-switch", "run_stack_switch"), ("select-stack", "run_select_stack")):
            with self.subTest(job=name):
                self.assertIn(f"steps.changes.outputs.{output}", job_block(name))
                self.assertIn("python3 .github/ci/changes.py", job_block(name))
# select-stack:end


if __name__ == "__main__":
    unittest.main()
