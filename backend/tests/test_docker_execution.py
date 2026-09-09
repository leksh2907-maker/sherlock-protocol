import shutil
import subprocess
import unittest

from services.docker_execution import DockerExecutionService, ExecutionStatus


LANGUAGE_CASES = {
    "python": {
        "correct": "print('OK')",
        "compile_error": "def broken(:\n    pass",
        "runtime_error": "raise RuntimeError('boom')",
        "timeout": "while True: pass",
    },
    "c": {
        "correct": '#include <stdio.h>\nint main(void) { puts("OK"); return 0; }',
        "compile_error": "int main(void) { this is not valid C; }",
        "runtime_error": '#include <stdio.h>\nint main(void) { int x = 1 / 0; printf("%d", x); }',
        "timeout": "int main(void) { for (;;) {} }",
    },
    "cpp": {
        "correct": '#include <iostream>\nint main() { std::cout << "OK\\n"; }',
        "compile_error": "int main() { std::this_is_not_valid; }",
        "runtime_error": '#include <iostream>\nint main() { int x = 1 / 0; std::cout << x; }',
        "timeout": "int main() { for (;;) {} }",
    },
    "java": {
        "correct": 'public class Main { public static void main(String[] args) { System.out.println("OK"); } }',
        "compile_error": "public class Main { public static void main(String[] args) { this is invalid; } }",
        "runtime_error": 'public class Main { public static void main(String[] args) { int x = 1 / 0; } }',
        "timeout": 'public class Main { public static void main(String[] args) { while (true) {} } }',
    },
}


def docker_daemon_available() -> bool:
    if shutil.which("docker") is None:
        return False
    try:
        result = subprocess.run(
            ["docker", "info", "--format", "{{.ServerVersion}}"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=2,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


@unittest.skipUnless(docker_daemon_available(), "Docker daemon is required for execution tests")
class DockerExecutionTests(unittest.TestCase):
    def setUp(self):
        self.service = DockerExecutionService(timeout_seconds=8)

    def test_each_language_and_outcome(self):
        expected = {
            "correct": ExecutionStatus.SUCCESS,
            "compile_error": ExecutionStatus.COMPILE_ERROR,
            "runtime_error": ExecutionStatus.RUNTIME_ERROR,
            "timeout": ExecutionStatus.TIMEOUT,
        }
        for language, cases in LANGUAGE_CASES.items():
            for name, source in cases.items():
                with self.subTest(language=language, case=name):
                    result = self.service.run(language, source)
                    self.assertEqual(result.status, expected[name])
                    if name == "correct":
                        self.assertIn("OK", result.stdout)


class DockerUnavailableTests(unittest.TestCase):
    def test_missing_docker_binary_is_internal_error(self):
        result = DockerExecutionService(docker_binary="docker-does-not-exist").run("python", "print(1)")
        self.assertEqual(result.status, ExecutionStatus.INTERNAL_ERROR)


if __name__ == "__main__":
    unittest.main()