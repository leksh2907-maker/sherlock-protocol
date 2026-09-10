"""Small authenticated HTTP bridge from the internet to local Docker Desktop.

Run this only on the organizer laptop. It exposes code execution, not the
Docker daemon itself. The existing DockerExecutionService keeps the actual
sandboxing and resource limits.
"""

from __future__ import annotations

import hmac
import os

from flask import Flask, jsonify, request

from services.docker_execution import DockerExecutionService, SupportedLanguage

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 160 * 1024
TOKEN = os.getenv("EXECUTION_SERVER_TOKEN", "").strip()
service = DockerExecutionService(timeout_seconds=5.0)


def authorized() -> bool:
    supplied = request.headers.get("Authorization", "")
    expected = f"Bearer {TOKEN}" if TOKEN else ""
    return bool(TOKEN) and hmac.compare_digest(supplied, expected)


@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "sherlock-execution-agent"})


@app.post("/execute")
def execute():
    if not authorized():
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Request body must be valid JSON."}), 400

    language = data.get("language")
    source = data.get("source_code")
    input_data = data.get("input_data", "")
    if language not in {item.value for item in SupportedLanguage}:
        return jsonify({"error": "Invalid language."}), 400
    if not isinstance(source, str) or not source.strip():
        return jsonify({"error": "source_code is required."}), 400
    if not isinstance(input_data, str):
        return jsonify({"error": "input_data must be a string."}), 400

    result = service.run(language, source, input_data)
    return jsonify(
        {
            "status": result.status.value,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_code,
            "duration_ms": result.duration_ms,
        }
    ), 200


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("Set EXECUTION_SERVER_TOKEN before starting the execution agent.")
    app.run(host="127.0.0.1", port=int(os.getenv("EXECUTION_AGENT_PORT", "8787")), debug=False)
