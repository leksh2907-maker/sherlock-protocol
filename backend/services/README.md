# Docker execution service

Build the fixed language images from the repository root:

```powershell
docker build -f backend/docker/execution/python.Dockerfile -t sherlock-exec-python:3.12 backend/docker/execution
docker build -f backend/docker/execution/c.Dockerfile -t sherlock-exec-c:14 backend/docker/execution
docker build -f backend/docker/execution/cpp.Dockerfile -t sherlock-exec-cpp:14 backend/docker/execution
docker build -f backend/docker/execution/java.Dockerfile -t sherlock-exec-java:21 backend/docker/execution
```

The service accepts only a supported language and source text. It creates a
new container for every invocation, supplies source through standard input,
mounts no host path, disables networking, applies CPU/memory/PID limits, and
uses an in-container tmpfs workspace. Java submissions must define `Main`.

The Flask app does not call this service yet. Keep it behind a worker or
dedicated execution process before exposing it through an HTTP route.