"""Run untrusted source code in short-lived, isolated Docker containers.

The caller supplies source code only. Language, image, command, and all
container security options are selected by this module and cannot be supplied
by a participant.
"""

from __future__ import annotations

import base64
import secrets
import shutil
import subprocess
import time
from dataclasses import dataclass
from enum import Enum
from typing import Final


class SupportedLanguage(str, Enum):
    PYTHON = "python"
    C = "c"
    CPP = "cpp"
    JAVA = "java"


class ExecutionStatus(str, Enum):
    SUCCESS = "success"
    COMPILE_ERROR = "compile_error"
    RUNTIME_ERROR = "runtime_error"
    TIMEOUT = "timeout"
    INTERNAL_ERROR = "internal_error"


@dataclass(frozen=True)
class ExecutionResult:
    status: ExecutionStatus
    stdout: str
    stderr: str
    exit_code: int | None
    duration_ms: int


@dataclass(frozen=True)
class _LanguageSpec:
    image: str
    source_name: str
    command: str


_COMPILE_MARKER_PREFIX: Final[str] = "__SHERLOCK_COMPILE_OK__"
_COMPILE_ERROR_MARKER_PREFIX: Final[str] = "__SHERLOCK_COMPILE_ERROR__"
_COMPILE_FAILURE_EXIT_CODE: Final[int] = 125
_MAX_SOURCE_BYTES: Final[int] = 64 * 1024
_MAX_INPUT_BYTES: Final[int] = 64 * 1024
_MAX_OUTPUT_BYTES: Final[int] = 64 * 1024
_LANGUAGES: Final[dict[SupportedLanguage, _LanguageSpec]] = {
    SupportedLanguage.PYTHON: _LanguageSpec(
        image="sherlock-exec-python:3.12",
        source_name="main.py",
        command="if python -m py_compile /workspace/main.py; then printf '%s\\n' {marker}; exec python /workspace/main.py; else printf '%s\\n' {compile_marker} >&2; exit 125; fi",
    ),
    SupportedLanguage.C: _LanguageSpec(
        image="sherlock-exec-c:14",
        source_name="main.c",
        command="if gcc -std=c11 -O2 -pipe /workspace/main.c -o /workspace/program; then printf '%s\\n' {marker}; exec /workspace/program; else printf '%s\\n' {compile_marker} >&2; exit 125; fi",
    ),
    SupportedLanguage.CPP: _LanguageSpec(
        image="sherlock-exec-cpp:14",
        source_name="main.cpp",
        command="if g++ -std=c++17 -O2 -pipe /workspace/main.cpp -o /workspace/program; then printf '%s\\n' {marker}; exec /workspace/program; else printf '%s\\n' {compile_marker} >&2; exit 125; fi",
    ),
    SupportedLanguage.JAVA: _LanguageSpec(
        image="sherlock-exec-java:21",
        source_name="Main.java",
        command="if javac -encoding UTF-8 /workspace/Main.java; then printf '%s\\n' {marker}; exec java -cp /workspace Main; else printf '%s\\n' {compile_marker} >&2; exit 125; fi",
    ),
}


class DockerExecutionService:
    """Synchronous Docker runner with bounded resources and no host mounts."""

    def __init__(
        self,
        *,
        timeout_seconds: float = 5.0,
        cpus: float = 0.5,
        memory_limit: str = "128m",
        pids_limit: int = 64,
        docker_binary: str = "docker",
    ) -> None:
        if timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        if cpus <= 0:
            raise ValueError("cpus must be positive")
        if pids_limit <= 0:
            raise ValueError("pids_limit must be positive")
        self.timeout_seconds = timeout_seconds
        self.cpus = cpus
        self.memory_limit = memory_limit
        self.pids_limit = pids_limit
        self.docker_binary = docker_binary

    def run(self, language: SupportedLanguage | str, source: str, stdin_data: str = "") -> ExecutionResult:
        """Compile and run source code in a fresh, disposable container."""
        try:
            language = SupportedLanguage(language)
        except ValueError:
            return ExecutionResult(ExecutionStatus.INTERNAL_ERROR, "", "Unsupported language.", None, 0)

        source_bytes = source.encode("utf-8")
        if len(source_bytes) > _MAX_SOURCE_BYTES:
            return ExecutionResult(ExecutionStatus.INTERNAL_ERROR, "", "Source code is too large.", None, 0)
        input_bytes = stdin_data.encode("utf-8")
        if len(input_bytes) > _MAX_INPUT_BYTES:
            return ExecutionResult(ExecutionStatus.INTERNAL_ERROR, "", "Input is too large.", None, 0)
        if shutil.which(self.docker_binary) is None:
            return ExecutionResult(ExecutionStatus.INTERNAL_ERROR, "", "Docker is not available.", None, 0)
        try:
            docker_info = subprocess.run(
                [self.docker_binary, "info", "--format", "{{.ServerVersion}}"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=2,
                check=False,
                env={},
            )
        except (OSError, subprocess.TimeoutExpired):
            return ExecutionResult(ExecutionStatus.INTERNAL_ERROR, "", "Docker is not available.", None, 0)
        if docker_info.returncode != 0:
            return ExecutionResult(
                ExecutionStatus.INTERNAL_ERROR,
                "",
                _docker_error(docker_info.stderr),
                docker_info.returncode,
                0,
            )

        spec = _LANGUAGES[language]
        try:
            image_info = subprocess.run(
                [self.docker_binary, "image", "inspect", spec.image],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=2,
                check=False,
                env={},
            )
        except (OSError, subprocess.TimeoutExpired):
            return ExecutionResult(ExecutionStatus.INTERNAL_ERROR, "", "Docker image is not available.", None, 0)
        if image_info.returncode != 0:
            return ExecutionResult(
                ExecutionStatus.INTERNAL_ERROR,
                "",
                f"Docker image {spec.image} is not available. Build the Round 2 execution images first.",
                image_info.returncode,
                0,
            )
        marker = f"{_COMPILE_MARKER_PREFIX}{secrets.token_hex(16)}"
        compile_marker = f"{_COMPILE_ERROR_MARKER_PREFIX}{secrets.token_hex(16)}"
        command = spec.command.format(marker=marker, compile_marker=compile_marker)
        encoded_source = base64.b64encode(source_bytes).decode("ascii")
        container_name = f"sherlock-exec-{secrets.token_hex(12)}"
        docker_args = [
            self.docker_binary,
            "run",
            "--name",
            container_name,
            "--rm",
            "--init",
            "--network",
            "none",
            "--cpus",
            str(self.cpus),
            "--memory",
            self.memory_limit,
            "--memory-swap",
            self.memory_limit,
            "--pids-limit",
            str(self.pids_limit),
            "--read-only",
            "--security-opt",
            "no-new-privileges:true",
            "--cap-drop",
            "ALL",
            "--user",
            "10001:10001",
            "--workdir",
            "/workspace",
            "--tmpfs",
            "/workspace:rw,exec,nosuid,nodev,uid=10001,gid=10001,mode=700",
            "--tmpfs",
            "/tmp:rw,noexec,nosuid,nodev,uid=10001,gid=10001,mode=700",
            spec.image,
            "sh",
            "-c",
            f"printf '%s' '{encoded_source}' | base64 -d > /workspace/{spec.source_name} && {command}",
        ]

        started = time.monotonic()
        process: subprocess.Popen[bytes] | None = None
        try:
            process = subprocess.Popen(
                docker_args,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env={},
            )
            stdout, stderr = process.communicate(input_bytes, timeout=self.timeout_seconds)
            duration_ms = int((time.monotonic() - started) * 1000)
        except subprocess.TimeoutExpired:
            self._cleanup_container(container_name, process)
            duration_ms = int((time.monotonic() - started) * 1000)
            return ExecutionResult(ExecutionStatus.TIMEOUT, "", "Execution timed out.", None, duration_ms)
        except OSError as exc:
            self._cleanup_container(container_name, process)
            return ExecutionResult(ExecutionStatus.INTERNAL_ERROR, "", str(exc), None, 0)

        stdout_text = _truncate(stdout.decode("utf-8", errors="replace"))
        stderr_text = _truncate(stderr.decode("utf-8", errors="replace"))
        marker_line = marker + "\n"
        compile_marker_line = compile_marker + "\n"
        if marker_line in stdout_text:
            stdout_text = stdout_text.replace(marker_line, "", 1)
            status = ExecutionStatus.SUCCESS if process.returncode == 0 else ExecutionStatus.RUNTIME_ERROR
        elif compile_marker_line in stderr_text:
            stderr_text = stderr_text.replace(compile_marker_line, "", 1)
            status = ExecutionStatus.COMPILE_ERROR
        elif process.returncode == _COMPILE_FAILURE_EXIT_CODE:
            status = ExecutionStatus.INTERNAL_ERROR
        else:
            status = ExecutionStatus.RUNTIME_ERROR

        return ExecutionResult(status, stdout_text, stderr_text, process.returncode, duration_ms)

    def _cleanup_container(self, name: str, process: subprocess.Popen[bytes] | None) -> None:
        if process is not None and process.poll() is None:
            try:
                subprocess.run(
                    [self.docker_binary, "kill", name],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=2,
                    check=False,
                    env={},
                )
            except (OSError, subprocess.TimeoutExpired):
                pass
            try:
                process.communicate(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate()
        try:
            subprocess.run(
                [self.docker_binary, "rm", "-f", name],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=2,
                check=False,
                env={},
            )
        except (OSError, subprocess.TimeoutExpired):
            pass


def _truncate(value: str) -> str:
    if len(value.encode("utf-8")) <= _MAX_OUTPUT_BYTES:
        return value
    truncated = value.encode("utf-8")[:_MAX_OUTPUT_BYTES].decode("utf-8", errors="ignore")
    return truncated + "\n[output truncated]"


def _docker_error(stderr: bytes) -> str:
    message = stderr.decode("utf-8", errors="replace").strip()
    return message or "Docker is not available."
