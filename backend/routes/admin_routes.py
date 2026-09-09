from flask import Blueprint, jsonify, request
from sqlalchemy import or_

from extensions import db
from models import (
    User,
    ContactMessage,
    NewsletterSubscriber,
    GameProgress,
    RoundConfig,
    RoundTimer,
    Round1Attempt,
    RoundSubmission,
    Team,
    TeamRound1Attempt,
    TeamRoundSubmission,
)
from utils.decorators import admin_required
from utils.scoring import compute_overall_score

admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/users", methods=["GET"])
@admin_required
def list_users():
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify({"count": len(users), "users": [u.to_dict() for u in users]}), 200


@admin_bp.route("/contacts", methods=["GET"])
@admin_required
def list_contact_messages():
    messages = ContactMessage.query.order_by(ContactMessage.created_at.desc()).all()
    return (
        jsonify({"count": len(messages), "messages": [m.to_dict() for m in messages]}),
        200,
    )


@admin_bp.route("/newsletter", methods=["GET"])
@admin_required
def list_newsletter_subscribers():
    subscribers = NewsletterSubscriber.query.order_by(
        NewsletterSubscriber.subscribed_at.desc()
    ).all()
    return (
        jsonify(
            {
                "count": len(subscribers),
                "subscribers": [s.to_dict() for s in subscribers],
            }
        ),
        200,
    )


def _current_round_status(attempt, timer2) -> str:
    if timer2 is not None:
        return "round2"
    if attempt is not None and attempt.submitted_at is not None:
        return "eligible_waiting" if attempt.eligible else "eliminated"
    return "round1"


@admin_bp.route("/participants", methods=["GET"])
@admin_required
def list_participants():
    """Every registered user, joined with their game progress and
    competition round results (if any).

    Supports ?search= matching username, email, investigator name, or team
    name — used by the dashboard's search/filter box.
    """
    search = request.args.get("search", "").strip()

    query = db.session.query(User, GameProgress).outerjoin(
        GameProgress, GameProgress.user_id == User.id
    )
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                User.username.ilike(like),
                User.email.ilike(like),
                GameProgress.investigator_name.ilike(like),
                GameProgress.team_name.ilike(like),
            )
        )

    rows = query.order_by(User.created_at.desc()).limit(500).all()

    participants = []
    for user, progress in rows:
        attempt = Round1Attempt.query.filter_by(user_id=user.id).first()
        timer2 = RoundTimer.query.filter_by(user_id=user.id, round_number=2).first()
        submissions2 = RoundSubmission.query.filter_by(user_id=user.id, round_number=2).all()

        round2_correct = sum(1 for s in submissions2 if s.result == "correct")
        overall_score = compute_overall_score(attempt.score if attempt else 0, round2_correct)

        entry = user.to_dict()  # never includes password_hash
        entry["progress"] = progress.to_dict() if progress else None
        entry["round1"] = attempt.to_dict() if attempt else None
        entry["round2_submissions"] = [s.to_dict() for s in submissions2]
        entry["overall_score"] = overall_score
        entry["current_round"] = _current_round_status(attempt, timer2)
        entry["last_updated"] = (
            max(
                [d.isoformat() for d in [attempt.submitted_at if attempt else None] if d]
                + [s.updated_at.isoformat() for s in submissions2]
                + ([user.created_at.isoformat()])
            )
        )
        participants.append(entry)

    return jsonify({"count": len(participants), "participants": participants}), 200


@admin_bp.route("/stats", methods=["GET"])
@admin_required
def get_stats():
    total_participants = User.query.filter_by(is_admin=False).count()
    total_teams = Team.query.count()
    round1_submitted = TeamRound1Attempt.query.filter(TeamRound1Attempt.submitted_at.isnot(None)).count()
    round1_eligible = TeamRound1Attempt.query.filter_by(eligible=True).count()
    round1_eliminated = TeamRound1Attempt.query.filter_by(eligible=False).filter(
        TeamRound1Attempt.submitted_at.isnot(None)
    ).count()
    recent_registrations = User.query.order_by(User.created_at.desc()).limit(5).all()

    return (
        jsonify(
            {
                "total_participants": total_participants,
                "total_teams": total_teams,
                "round1_submitted": round1_submitted,
                "round1_eligible": round1_eligible,
                "round1_eliminated": round1_eliminated,
                "recent_registrations": [u.to_dict() for u in recent_registrations],
            }
        ),
        200,
    )


# --- Competition Control: round locking, timers, grading -------------------


@admin_bp.route("/rounds", methods=["GET"])
@admin_required
def list_rounds():
    configs = {c.round_number: c for c in RoundConfig.query.all()}

    round1_participants = TeamRound1Attempt.query.count()
    round1_submitted = TeamRound1Attempt.query.filter(TeamRound1Attempt.submitted_at.isnot(None)).count()
    round2_qualified = Team.query.filter_by(round2_qualified=True).count()
    round3_submitted = db.session.query(TeamRoundSubmission.team_id).filter_by(
        round_number=3, status="submitted"
    ).distinct().count()
    round3_qualified = Team.query.filter_by(round3_qualified=True).count()

    round2_participants = (
        db.session.query(TeamRoundSubmission.team_id).filter_by(round_number=2).distinct().count()
    )
    round2_completed = (
        db.session.query(TeamRoundSubmission.team_id)
        .filter_by(round_number=2, status="submitted")
        .distinct()
        .count()
    )

    round1_eligible = TeamRound1Attempt.query.filter_by(eligible=True).count()
    round1_eliminated = TeamRound1Attempt.query.filter(
        TeamRound1Attempt.submitted_at.isnot(None),
        TeamRound1Attempt.eligible == False,
    ).count()

    return jsonify(
        {
            "round1": {
                "config": configs[1].to_dict(include_secret=True) if 1 in configs else None,
                "participants": round1_participants,
                "submitted": round1_submitted,
                "qualified": round2_qualified,
                "eligible": round1_eligible,
                "eliminated": round1_eliminated,
            },
            "round2": {
                "config": configs[2].to_dict(include_secret=True) if 2 in configs else None,
                "participants": round2_participants,
                "completed": round2_completed,
            },
            "round3": {
                "config": configs[3].to_dict(include_secret=True) if 3 in configs else None,
                "participants": round3_submitted,
                "qualified": round3_qualified,
            },
        }
    ), 200


@admin_bp.route("/rounds/<int:round_number>", methods=["PUT"])
@admin_required
def update_round(round_number: int):
    if round_number not in (1, 2, 3):
        return jsonify({"error": "Invalid round number."}), 400

    data = request.get_json(silent=True) or {}
    config = RoundConfig.query.filter_by(round_number=round_number).first()
    if config is None:
        return jsonify({"error": "Round configuration not found."}), 404

    if "is_unlocked" in data:
        if not isinstance(data["is_unlocked"], bool):
            return jsonify({"error": "is_unlocked must be true or false."}), 400
        config.is_unlocked = data["is_unlocked"]

    if "duration_minutes" in data:
        duration = data["duration_minutes"]
        if not isinstance(duration, int) or duration <= 0:
            return jsonify({"error": "duration_minutes must be a positive integer."}), 400
        config.duration_minutes = duration

    if "code_word" in data:
        code_word = data["code_word"]
        if not isinstance(code_word, str) or len(code_word.strip()) > 120:
            return jsonify({"error": "code_word must be a string of at most 120 characters."}), 400
        config.code_word = code_word.strip()

    if "key_update" in data:
        key_update = data["key_update"]
        if not isinstance(key_update, str) or len(key_update) > 2000:
            return jsonify({"error": "key_update must be a string of at most 2000 characters."}), 400
        config.key_update = key_update.strip()

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not update round configuration."}), 500

    return jsonify({"round": config.to_dict(include_secret=True)}), 200


@admin_bp.route(
    "/submissions/<int:user_id>/<int:round_number>/<int:problem_number>", methods=["PUT"]
)
@admin_required
def grade_submission(user_id: int, round_number: int, problem_number: int):
    data = request.get_json(silent=True) or {}
    result = data.get("result")
    if result not in ("correct", "incorrect", "pending"):
        return jsonify({"error": "result must be 'correct', 'incorrect', or 'pending'."}), 400

    submission = RoundSubmission.query.filter_by(
        user_id=user_id, round_number=round_number, problem_number=problem_number
    ).first()
    if submission is None:
        return jsonify({"error": "Submission not found."}), 404

    submission.result = result

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not update the result."}), 500

    return jsonify({"submission": submission.to_dict()}), 200
