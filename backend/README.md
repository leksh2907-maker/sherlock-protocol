# Sherlock Protocol — Backend

A Flask backend for a team-based programming competition with JWT
authentication, organizer-created teams, randomized/persisted question
assignment, server-enforced round timers, Round 1 grading, Round 2 Docker
execution, a leaderboard, and an admin API.

## Tech
Flask, Flask-SQLAlchemy, Flask-CORS, Flask-JWT-Extended, python-dotenv.

## Setup

```bash
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # then set your own SECRET_KEY / JWT_SECRET_KEY
python app.py
```

Live at `http://localhost:5000`. On first run this creates `instance/sherlock.db`,
all tables, and seeds default content (20 Round 1 questions and 9 Round 2
problems) — seeding only happens on empty tables, so it never overwrites
content an admin has edited.

## Production deployment

Set `FLASK_DEBUG=False`, use random `SECRET_KEY` and `JWT_SECRET_KEY` values of
at least 32 characters, set `DATABASE_URL` to a production database, and set
`FRONTEND_ORIGIN` to the exact HTTPS origin serving the frontend. Do not expose
the Flask development server publicly. Run the application with Gunicorn from
the `backend` directory:

```bash
gunicorn --bind 0.0.0.0:5000 --workers 2 app:app
```

The host running the backend must also have Docker with the four execution
images built and available. Back up the database before the event.

## Creating an admin user

```bash
flask --app app create-admin <username> <email> <password>
```
If the email already belongs to a registered user, this just flips
`is_admin` to `True` (password argument ignored in that case). **Log out
and back in afterward** — the admin flag is baked into the JWT at login
time, so an already-issued token won't reflect a promotion that happened
after it was issued.

## Reset registered users

To delete all user accounts and account-linked competition data while
preserving question pools, clues, suspects, and round configuration, run
from the `backend` directory:

```powershell
python -m flask --app app reset-users
```

The command asks for confirmation. For an intentional non-interactive reset:

```powershell
python -m flask --app app reset-users --yes
```

## How teams work

A user isn't a "team" by itself. After registering, a participant sets an
investigator + team name (`PUT /api/progress`, reusing the existing
game-progress table) and then calls `POST /api/team/join`, which finds or
creates a `Team` row by exact (case-insensitive) name match and links the
user to it — up to 3 members per team. All round state, timers, question
assignments, and clue progress live on the **team**, not the individual
user, so any of the up to 3 members sees the same thing.

## Question pools & random assignment

`QuestionR1` and `ProblemR2` are the admin-editable pools. The first time a
team starts a round, the backend randomly picks the required count (20 Round 1
questions or 5 Round 2 problems) and persists the choice in
`TeamQuestionAssignment`. Every subsequent call for that team and round
returns the same assignment. Round 1 also gets a per-team randomized option
order without changing which option is correct.

## Note on legacy tables

The older individual-participant tables remain for data compatibility. The
current frontend uses the team-based tables and routes in `team_routes.py`.

## Environment variables (`.env`)

| Variable | Purpose |
|---|---|
| `SECRET_KEY` | Flask session/signing secret |
| `JWT_SECRET_KEY` | Secret used to sign JWTs |
| `JWT_ACCESS_TOKEN_EXPIRES_MINUTES` | Access token lifetime |
| `DATABASE_URL` | SQLAlchemy database URI (defaults to local SQLite) |
| `FRONTEND_ORIGIN` | Origin allowed by CORS (your Vite dev server, etc.) |
| `FLASK_DEBUG` | `True`/`False` |
| `PORT` | Port to run on (default `5000`) |

## API Reference

All request/response bodies are JSON. Protected routes require
`Authorization: Bearer <access_token>`.

### Auth
- `POST /api/register` — `{ username, email, password }` → `201 { user, access_token }`
- `POST /api/login` — `{ email, password }` → `200 { user, access_token }`
- `POST /api/logout` *(auth)* — revokes the current token server-side
- `GET /api/profile` *(auth)* → `{ user }`

### Team
- `POST /api/team/join` *(auth)* — joins/creates a team by the user's saved `team_name`. `409` if the team already has 3 members.
- `GET /api/team/status` *(auth)* — full dashboard: team, members, round1/2/3 state, clue unlock flags, accusation result.

### Round 1 (team quiz)
- `POST /api/team/round1/start` *(auth)* → `{ questions (no answers), timer }`, idempotent
- `POST /api/team/round1/submit` *(auth)* — `{ answers }` → `{ score, total, eligible, results }`. One-shot per team.
- `GET /api/team/round1/result` *(auth)* — re-fetch the graded result after the fact

### Round 2
- `POST /api/team/round2/start` *(auth)* → `{ timer, problems, submissions }`, idempotent
- `POST /api/team/rounds/2/submissions` *(auth)* — `{ problem_number, status: "attempted"|"submitted", submission_text? }`. Rejected once the round's timer has expired.

Round 2 also provides compiler-backed execution endpoints used by the frontend:

- `POST /api/team/round2/run` *(auth)* — `{ problem_number, language, source_code, input_data? }` → runs the program in an isolated Docker container
- `POST /api/team/round2/submit` *(auth)* — `{ problem_number, language, source_code }` → runs the configured visible cases and records the result; hidden cases remain private

### Round 2 Docker images

Docker Desktop must be running with Linux containers enabled. Build the images
from this directory before starting Round 2:

```powershell
docker build -f docker/execution/python.Dockerfile -t sherlock-exec-python:3.12 .
docker build -f docker/execution/c.Dockerfile -t sherlock-exec-c:14 .
docker build -f docker/execution/cpp.Dockerfile -t sherlock-exec-cpp:14 .
docker build -f docker/execution/java.Dockerfile -t sherlock-exec-java:21 .
```

The runner applies the language compiler, a five-second timeout, CPU and
memory limits, no network, a read-only root filesystem, dropped Linux
capabilities, and a non-root user. Participant code is never mounted from the
host. From `backend`, run `python -m unittest tests.test_docker_execution` to
verify all supported languages and compile, runtime, and timeout outcomes.

### Public
- `GET /api/leaderboard` — top 50 teams by score (`round1_score + round2_correct×10`, see `utils/scoring.py`)
- `POST /api/contact`, `POST /api/newsletter`
- `GET /api/health`

### Admin — competition control
- `GET /api/admin/rounds`, `PUT /api/admin/rounds/<1|2>` — `{ is_unlocked?, duration_minutes? }`
- `GET /api/admin/teams` — every team with members, Round 1/2 results, and overall score
- `PUT /api/admin/team-submissions/<team_id>/2/<problem>` — `{ result: "correct"|"incorrect"|"pending" }`

### Admin — content management
- `GET/POST /api/admin/questions/round1`, `PUT/DELETE /api/admin/questions/round1/<id>` (min 20 kept)
- `GET/POST /api/admin/questions/round2`, `PUT/DELETE /api/admin/questions/round2/<id>` (min 9 kept)
- `GET /api/admin/questions/round2/<problem_id>/test-cases`
- `POST/DELETE /api/admin/questions/round2/<problem_id>/test-cases`

### Admin — accounts & dashboard extras
- `GET /api/admin/users`, `GET /api/admin/stats`, `GET /api/admin/contacts`, `GET /api/admin/newsletter`

## Notes
- Errors always come back as `{ "error": "..." }` with an appropriate HTTP
  status code — never a stack trace or HTML page.
- Passwords are hashed with Werkzeug's `generate_password_hash` (PBKDF2) —
  never stored or returned in plain text. `is_correct` on suspects and the
  Round 1 answer key never reach a participant before they're allowed to see them.
- This is a development server (`app.run(...)`). For production, run it
  behind a real WSGI server such as `gunicorn app:app`.
