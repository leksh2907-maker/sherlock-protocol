from datetime import datetime, timezone
import json

from werkzeug.security import generate_password_hash, check_password_hash

from extensions import db


def _utcnow():
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
    """SQLite drops tzinfo on round-trip, so re-attach UTC before using a
    stored datetime in a comparison or sending it to the frontend — without
    this, is_expired() checks and ISO timestamps would be silently wrong."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    def set_password(self, raw_password: str) -> None:
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password: str) -> bool:
        return check_password_hash(self.password_hash, raw_password)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "is_admin": self.is_admin,
            "created_at": self.created_at.isoformat(),
        }


class GameProgress(db.Model):
    """One row per user, holding their synced investigation progress.

    Chapters/evidence/answered-puzzles are stored as JSON text so this
    stays a single upsert-able row per user regardless of how the frontend
    shapes its data.
    """

    __tablename__ = "game_progress"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False, index=True
    )
    investigator_name = db.Column(db.String(80))
    team_name = db.Column(db.String(80))
    score = db.Column(db.Integer, default=0, nullable=False)
    chapters_completed = db.Column(db.Text, default="{}", nullable=False)
    evidence_found = db.Column(db.Text, default="[]", nullable=False)
    answered_puzzles = db.Column(db.Text, default="[]", nullable=False)
    case_solved = db.Column(db.Boolean, default=False, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )

    user = db.relationship("User", backref=db.backref("progress", uselist=False))

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "investigator_name": self.investigator_name or "",
            "team_name": self.team_name or "",
            "score": self.score,
            "chapters_completed": json.loads(self.chapters_completed or "{}"),
            "evidence_found": json.loads(self.evidence_found or "[]"),
            "answered_puzzles": json.loads(self.answered_puzzles or "[]"),
            "case_solved": self.case_solved,
            "updated_at": self.updated_at.isoformat(),
        }


class RoundConfig(db.Model):
    """Global, admin-controlled lock state + timer duration for each round.

    Exactly one row per round_number (1, 2, 3), seeded on app startup.
    """

    __tablename__ = "round_config"

    id = db.Column(db.Integer, primary_key=True)
    round_number = db.Column(db.Integer, unique=True, nullable=False)
    is_unlocked = db.Column(db.Boolean, default=False, nullable=False)
    duration_minutes = db.Column(db.Integer, nullable=False)
    code_word = db.Column(db.String(120), default="", nullable=False)
    key_update = db.Column(db.Text, default="", nullable=False)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    def to_dict(self, include_secret: bool = False) -> dict:
        result = {
            "round_number": self.round_number,
            "is_unlocked": self.is_unlocked,
            "duration_minutes": self.duration_minutes,
            "updated_at": self.updated_at.isoformat(),
        }
        if include_secret:
            result["code_word"] = self.code_word or ""
            result["key_update"] = self.key_update or ""
        return result


class RoundTimer(db.Model):
    """Server-side start time for one user's attempt at one round.

    started_at + duration_minutes (snapshotted at start, so a later admin
    config change doesn't retroactively shrink/extend a running attempt) is
    the source of truth for expiry — never the client's own clock.
    """

    __tablename__ = "round_timers"
    __table_args__ = (db.UniqueConstraint("user_id", "round_number", name="uq_user_round_timer"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    round_number = db.Column(db.Integer, nullable=False)
    started_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    duration_minutes = db.Column(db.Integer, nullable=False)
    completed_at = db.Column(db.DateTime, nullable=True)

    def expires_at(self) -> datetime:
        from datetime import timedelta

        return _as_utc(self.started_at) + timedelta(minutes=self.duration_minutes)

    def is_expired(self) -> bool:
        return _utcnow() > self.expires_at()

    def to_dict(self) -> dict:
        return {
            "round_number": self.round_number,
            "started_at": _as_utc(self.started_at).isoformat(),
            "duration_minutes": self.duration_minutes,
            "expires_at": self.expires_at().isoformat(),
            "completed_at": _as_utc(self.completed_at).isoformat() if self.completed_at else None,
            "is_expired": self.is_expired(),
        }


class Round1Attempt(db.Model):
    """One row per user: their quiz answers, score, and eligibility."""

    __tablename__ = "round1_attempts"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False, index=True
    )
    answers = db.Column(db.Text, default="{}", nullable=False)  # JSON {question_id: option_id}
    score = db.Column(db.Integer, nullable=True)
    eligible = db.Column(db.Boolean, nullable=True)
    submitted_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self) -> dict:
        return {
            "answers": json.loads(self.answers or "{}"),
            "score": self.score,
            "eligible": self.eligible,
            "submitted": self.submitted_at is not None,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
        }


class RoundSubmission(db.Model):
    """One row per user, per round (2 or 3), per problem number.

    Participants set `status`; only an admin sets `result`, since Round 2/3
    are graded externally (no in-browser compiler) by the organizer.
    """

    __tablename__ = "round_submissions"
    __table_args__ = (
        db.UniqueConstraint(
            "user_id", "round_number", "problem_number", name="uq_user_round_problem"
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    round_number = db.Column(db.Integer, nullable=False)
    problem_number = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), default="not_started", nullable=False)
    result = db.Column(db.String(20), default="pending", nullable=False)
    submission_text = db.Column(db.Text, nullable=True)
    submitted_at = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            "round_number": self.round_number,
            "problem_number": self.problem_number,
            "status": self.status,
            "result": self.result,
            "submission_text": self.submission_text,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "updated_at": self.updated_at.isoformat(),
        }


class ContactMessage(db.Model):
    __tablename__ = "contact_messages"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "message": self.message,
            "created_at": self.created_at.isoformat(),
        }


class NewsletterSubscriber(db.Model):
    __tablename__ = "newsletter_subscribers"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    subscribed_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "subscribed_at": self.subscribed_at.isoformat(),
        }


class TokenBlocklist(db.Model):
    """Stores the JTI of any access token that has been logged out / revoked.

    JWTs are stateless by design, so a real server-side logout requires
    keeping a small denylist of token IDs that should no longer be accepted.
    """

    __tablename__ = "token_blocklist"

    id = db.Column(db.Integer, primary_key=True)
    jti = db.Column(db.String(36), nullable=False, unique=True, index=True)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)


# =============================================================================
# TEAM-BASED DETECTIVE MYSTERY SYSTEM
#
# These tables are additive alongside the individual-based Round1Attempt /
# RoundTimer / RoundSubmission above (kept intact, unused by the new team
# flow, so no existing data or code path is removed). RoundConfig above is
# reused as-is for team round locking, since admin unlock state is global.
# =============================================================================


class Team(db.Model):
    __tablename__ = "teams"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    name_key = db.Column(db.String(80), unique=True, nullable=False, index=True)  # normalized
    participant1_name = db.Column(db.String(100), default="", nullable=False)
    participant2_name = db.Column(db.String(100), default="", nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    round2_qualified = db.Column(db.Boolean, default=False, nullable=False)
    round3_enabled = db.Column(db.Boolean, default=False, nullable=False)
    round3_qualified = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "participant1_name": self.participant1_name or "",
            "participant2_name": self.participant2_name or "",
            "user_id": self.user_id,
            "round2_qualified": self.round2_qualified,
            "round3_enabled": self.round3_enabled,
            "round3_qualified": self.round3_qualified,
            "created_at": self.created_at.isoformat(),
        }


class TeamMembership(db.Model):
    __tablename__ = "team_memberships"

    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False, index=True)
    joined_at = db.Column(db.DateTime, default=_utcnow, nullable=False)


class QuestionR1(db.Model):
    """Round 1 quiz pool (admin-managed). Options stored as JSON:
    [{"id": "a", "label": "..."}, ...]. correct_option_id never leaves the
    backend except inside grading logic."""

    __tablename__ = "question_pool_r1"

    id = db.Column(db.Integer, primary_key=True)
    question = db.Column(db.Text, nullable=False)
    options = db.Column(db.Text, nullable=False)  # JSON list
    correct_option_id = db.Column(db.String(10), nullable=False)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    def to_public_dict(self) -> dict:
        return {"id": self.id, "question": self.question, "options": json.loads(self.options)}

    def to_admin_dict(self) -> dict:
        d = self.to_public_dict()
        d["correct_option_id"] = self.correct_option_id
        return d


class ProblemR2(db.Model):
    """Round 2 programming-problem pool (admin-managed)."""

    __tablename__ = "problem_pool_r2"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(120), nullable=False)
    prompt = db.Column(db.Text, nullable=False)
    input_spec = db.Column(db.Text, nullable=False)
    output_spec = db.Column(db.Text, nullable=False)
    constraints = db.Column(db.Text, default="[]", nullable=False)  # JSON list[str]
    examples = db.Column(db.Text, default="[]", nullable=False)  # JSON list[{input,output}]
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "prompt": self.prompt,
            "input": self.input_spec,
            "output": self.output_spec,
            "constraints": json.loads(self.constraints or "[]"),
            "examples": json.loads(self.examples or "[]"),
        }


class ProblemR2TestCase(db.Model):
    """Input/output case used by the isolated Round 2 evaluator."""

    __tablename__ = "problem_r2_test_cases"

    id = db.Column(db.Integer, primary_key=True)
    problem_id = db.Column(db.Integer, db.ForeignKey("problem_pool_r2.id"), nullable=False, index=True)
    input_data = db.Column(db.Text, default="", nullable=False)
    expected_output = db.Column(db.Text, nullable=False)
    is_hidden = db.Column(db.Boolean, default=True, nullable=False)
    order_index = db.Column(db.Integer, default=0, nullable=False)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)


class TeamRound2Execution(db.Model):
    """Immutable record of a participant run or automatic submission."""

    __tablename__ = "team_round2_executions"

    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=False, index=True)
    problem_id = db.Column(db.Integer, db.ForeignKey("problem_pool_r2.id"), nullable=False, index=True)
    problem_number = db.Column(db.Integer, nullable=False)
    language = db.Column(db.String(20), nullable=False)
    source_code = db.Column(db.Text, nullable=False)
    mode = db.Column(db.String(20), nullable=False)  # run or submit
    status = db.Column(db.String(30), nullable=False)
    stdout = db.Column(db.Text, default="", nullable=False)
    stderr = db.Column(db.Text, default="", nullable=False)
    input_data = db.Column(db.Text, default="", nullable=False)
    passed_tests = db.Column(db.Integer, default=0, nullable=False)
    total_tests = db.Column(db.Integer, default=0, nullable=False)
    duration_ms = db.Column(db.Integer, default=0, nullable=False)
    exit_code = db.Column(db.Integer, nullable=True)
    test_results = db.Column(db.Text, default="[]", nullable=False)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)


class TeamRoundTimer(db.Model):
    """Same shape/semantics as RoundTimer above, but keyed by team."""

    __tablename__ = "team_round_timers"
    __table_args__ = (db.UniqueConstraint("team_id", "round_number", name="uq_team_round_timer"),)

    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=False, index=True)
    round_number = db.Column(db.Integer, nullable=False)
    started_at = db.Column(db.DateTime, default=_utcnow, nullable=False)
    duration_minutes = db.Column(db.Integer, nullable=False)
    completed_at = db.Column(db.DateTime, nullable=True)

    def expires_at(self) -> datetime:
        from datetime import timedelta

        return _as_utc(self.started_at) + timedelta(minutes=self.duration_minutes)

    def is_expired(self) -> bool:
        return _utcnow() > self.expires_at()

    def to_dict(self) -> dict:
        return {
            "round_number": self.round_number,
            "started_at": _as_utc(self.started_at).isoformat(),
            "duration_minutes": self.duration_minutes,
            "expires_at": self.expires_at().isoformat(),
            "completed_at": _as_utc(self.completed_at).isoformat() if self.completed_at else None,
            "is_expired": self.is_expired(),
        }


class TeamQuestionAssignment(db.Model):
    """The specific pool items randomly assigned to a team for a round,
    persisted on first assignment so a refresh never reshuffles them."""

    __tablename__ = "team_question_assignments"
    __table_args__ = (
        db.UniqueConstraint("team_id", "round_number", name="uq_team_round_assignment"),
    )

    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=False, index=True)
    round_number = db.Column(db.Integer, nullable=False)
    assigned_ids = db.Column(db.Text, nullable=False)  # JSON list[int], in assigned order
    option_orders = db.Column(db.Text, nullable=True)  # JSON {question_id: [option_id,...]} (R1 only)
    created_at = db.Column(db.DateTime, default=_utcnow, nullable=False)

    def assigned_id_list(self) -> list:
        return json.loads(self.assigned_ids)

    def option_order_map(self) -> dict:
        return json.loads(self.option_orders or "{}")


class TeamRound1Attempt(db.Model):
    __tablename__ = "team_round1_attempts"

    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), unique=True, nullable=False, index=True)
    answers = db.Column(db.Text, default="{}", nullable=False)  # JSON {question_id: option_id}
    score = db.Column(db.Integer, nullable=True)
    eligible = db.Column(db.Boolean, nullable=True)
    submitted_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self) -> dict:
        return {
            "answers": json.loads(self.answers or "{}"),
            "score": self.score,
            "eligible": self.eligible,
            "submitted": self.submitted_at is not None,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
        }


class TeamRoundSubmission(db.Model):
    """problem_number is the team's 1-based position within their assigned
    set for that round (not the global pool id) — matches the existing
    per-problem grading UI pattern from the individual-based flow."""

    __tablename__ = "team_round_submissions"
    __table_args__ = (
        db.UniqueConstraint(
            "team_id", "round_number", "problem_number", name="uq_team_round_problem"
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=False, index=True)
    round_number = db.Column(db.Integer, nullable=False)
    problem_number = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), default="not_started", nullable=False)
    result = db.Column(db.String(20), default="pending", nullable=False)
    submission_text = db.Column(db.Text, nullable=True)
    submitted_at = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(db.DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            "round_number": self.round_number,
            "problem_number": self.problem_number,
            "status": self.status,
            "result": self.result,
            "submission_text": self.submission_text,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "updated_at": self.updated_at.isoformat(),
        }


