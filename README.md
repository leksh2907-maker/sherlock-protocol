# Sherlock Protocol — Full Stack

A team-based detective mystery competition: React + Vite frontend, Flask +
SQLite backend, in one place.

```
sherlock-protocol-fullstack/
├── frontend/    React + Vite + TypeScript + Tailwind
└── backend/     Flask + SQLite API
```

## How it works

Organizers create teams and two participant accounts from the admin dashboard.
Both participants log in with their assigned credentials and share the team's
progress:

1. **Round 1 — Quiz.** 20 questions randomly drawn from a 20+ question pool,
   assigned once per team and persisted (a refresh never reshuffles them).
   The organizer reviews and qualifies teams for Round 2.
2. **Round 2 — Programming.** 5 problems randomly drawn from a 9+ problem
   pool. The backend runs Python, C, C++, and Java programs in short-lived
   Docker containers, including hidden test cases.

Round locking, timers, qualification, question assignment, and scores are
enforced and stored server-side. Public participant registration is disabled.

Admins control round locking/timers, teams, grading, and question pools from
`/admin`.

## How the two halves connect

The frontend talks to the backend through `frontend/src/lib/api.ts`, using
`VITE_API_URL` from `frontend/.env` (defaults to `http://localhost:5000/api`).
The backend allows requests from `FRONTEND_ORIGIN` in `backend/.env`
(defaults to `http://localhost:5173`). Both defaults match, so no
configuration changes are needed to run them together locally.

## Quick start (two terminals)

**Terminal 1 — backend:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python app.py
```
Runs at `http://localhost:5000`. On first run this also seeds the default
20 quiz questions and 9 programming problems — safe to re-run any time since
seeding only happens on
empty tables.

**Terminal 2 — frontend:**
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```
Runs at `http://localhost:5173`.

## Becoming an admin

```bash
cd backend
flask --app app create-admin <username> <email> <password>
```
If `<email>` matches an existing account, this just flips `is_admin` to
true for it (password argument is ignored). Log out and back in afterward —
your login token needs to be reissued to pick up the new admin claim.

See `frontend/README.md` and `backend/README.md` for full details on each
half, including the complete API reference.

## Enable the Round 2 compiler

Round 2 execution requires Docker Desktop (Linux containers) to be running.
From the repository root, build the four fixed compiler images once:

```powershell
cd backend
docker build -f docker/execution/python.Dockerfile -t sherlock-exec-python:3.12 .
docker build -f docker/execution/c.Dockerfile -t sherlock-exec-c:14 .
docker build -f docker/execution/cpp.Dockerfile -t sherlock-exec-cpp:14 .
docker build -f docker/execution/java.Dockerfile -t sherlock-exec-java:21 .
```

Keep Docker Desktop running while the backend is serving requests. Verify the
compiler path with:

```powershell
python -m unittest tests.test_docker_execution
```

Run that command from the `backend` directory. If Docker is stopped or an
image is missing, the Round 2 API returns `503` instead of executing code.
