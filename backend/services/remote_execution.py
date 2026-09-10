"""Execution adapter for a remote, Docker-backed execution agent.

The public Render API never receives Docker access. When EXECUTION_SERVER_URL
and EXECUTION_SERVER_TOKEN are configured, code execution is forwarded to a
small authenticated agent running on the organizer's machine.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from enum import Enum

from services.docker_execution import ExecutionResult, ExecutionStatus, SupportedLanguage


class RemoteExecutionService:
    def __init__(self, base_url: str, token: str, timeout_seconds: float = 12.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout_seconds = timeout_seconds

    def run(self, language: SupportedLanguage | str, source: str, stdin_data: str = "") -> ExecutionResult:
        try:
            language = SupportedLanguage(language)
        except ValueError:
            return ExecutionResult(ExecutionStatus.INTERNAL_ERROR, "", "Unsupported language.", None, 0)

        payload = json.dumps(
            {"language": language.value, "source_code": source, "input_data": stdin_data}
        ).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}/execute",
            data=payload,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token}",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                body = response.read(256 * 1024)
                data = json.loads(body.decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            return ExecutionResult(
                ExecutionStatus.INTERNAL_ERROR,
                "",
                f"Remote execution service unavailable: {exc}",
                None,
                0,
            )

        try:
            status = ExecutionStatus(data.get("status", ExecutionStatus.INTERNAL_ERROR.value))
        except ValueError:
            status = ExecutionStatus.INTERNAL_ERROR
        return ExecutionResult(
            status=status,
            stdout=str(data.get("stdout", "")),
            stderr=str(data.get("stderr", "")),
            exit_code=data.get("exit_code"),
            duration_ms=int(data.get("duration_ms", 0) or 0),
        )


def build_execution_service():
    """Use remote execution when configured; otherwise keep local Docker behavior."""
    url = os.getenv("EXECUTION_SERVER_URL", "").strip()
    token = os.getenv("EXECUTION_SERVER_TOKEN", "").strip()
    if url and token:
        return RemoteExecutionService(url, token)

    from services.docker_execution import DockerExecutionService

    return DockerExecutionService()
