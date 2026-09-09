import json

from flask import Blueprint, request, jsonify

from extensions import db
from models import (
    QuestionR1,
    ProblemR2,
    ProblemR2TestCase,
    Team,
    TeamMembership,
    User,
    TeamRound1Attempt,
    TeamRoundSubmission,
    TeamRoundTimer,
    TeamQuestionAssignment,
    TeamRound2Execution,
    RoundTimer,
    RoundSubmission,
    Round1Attempt,
    GameProgress,
)
from utils.decorators import admin_required
from utils.scoring import compute_overall_score
from utils.validators import missing_fields

admin_content_bp = Blueprint("admin_content", __name__)


# --- Round 1 question pool ---------------------------------------------------


@admin_content_bp.route("/questions/round1", methods=["GET"])
@admin_required
def list_round1_questions():
    items = QuestionR1.query.order_by(QuestionR1.id).all()
    return jsonify({"questions": [q.to_admin_dict() for q in items]}), 200


@admin_content_bp.route("/questions/round1", methods=["POST"])
@admin_required
def create_round1_question():
    data = request.get_json(silent=True) or {}
    missing = missing_fields(data, ["question", "options", "correct_option_id"])
    if missing:
        return jsonify({"error": f"Missing required field(s): {', '.join(missing)}"}), 400
    if QuestionR1.query.count() >= 60:
        return jsonify({"error": "Round 1 question pool cannot exceed 60 questions."}), 400
    if not isinstance(data["options"], list) or len(data["options"]) < 2:
        return jsonify({"error": "options must be a list of at least 2 {id, label} items."}), 400

    q = QuestionR1(
        question=data["question"],
        options=json.dumps(data["options"]),
        correct_option_id=data["correct_option_id"],
    )
    db.session.add(q)
    db.session.commit()
    return jsonify({"question": q.to_admin_dict()}), 201


@admin_content_bp.route("/questions/round1/<int:question_id>", methods=["PUT"])
@admin_required
def update_round1_question(question_id: int):
    q = QuestionR1.query.get(question_id)
    if q is None:
        return jsonify({"error": "Question not found."}), 404
    data = request.get_json(silent=True) or {}
    if "question" in data:
        q.question = data["question"]
    if "options" in data:
        if not isinstance(data["options"], list) or len(data["options"]) < 2:
            return jsonify({"error": "options must be a list of at least 2 {id, label} items."}), 400
        q.options = json.dumps(data["options"])
    if "correct_option_id" in data:
        q.correct_option_id = data["correct_option_id"]
    db.session.commit()
    return jsonify({"question": q.to_admin_dict()}), 200


@admin_content_bp.route("/questions/round1/<int:question_id>", methods=["DELETE"])
@admin_required
def delete_round1_question(question_id: int):
    q = QuestionR1.query.get(question_id)
    if q is None:
        return jsonify({"error": "Question not found."}), 404
    if QuestionR1.query.count() <= 20:
        return jsonify({"error": "Round 1 pool must keep at least 20 questions."}), 400
    db.session.delete(q)
    db.session.commit()
    return jsonify({"message": "Deleted."}), 200


# --- Round 2 problem pool -----------------------------------------------------


@admin_content_bp.route("/questions/round2", methods=["GET"])
@admin_required
def list_round2_problems():
    items = ProblemR2.query.order_by(ProblemR2.id).all()
    return jsonify({"problems": [p.to_dict() for p in items]}), 200


@admin_content_bp.route("/questions/round2", methods=["POST"])
@admin_required
def create_round2_problem():
    data = request.get_json(silent=True) or {}
    missing = missing_fields(data, ["title", "prompt", "input", "output"])
    if missing:
        return jsonify({"error": f"Missing required field(s): {', '.join(missing)}"}), 400

    p = ProblemR2(
        title=data["title"],
        prompt=data["prompt"],
        input_spec=data["input"],
        output_spec=data["output"],
        constraints=json.dumps(data.get("constraints", [])),
        examples=json.dumps(data.get("examples", [])),
    )
    db.session.add(p)
    db.session.commit()
    return jsonify({"problem": p.to_dict()}), 201


@admin_content_bp.route("/questions/round2/<int:problem_id>", methods=["PUT"])
@admin_required
def update_round2_problem(problem_id: int):
    p = ProblemR2.query.get(problem_id)
    if p is None:
        return jsonify({"error": "Problem not found."}), 404
    data = request.get_json(silent=True) or {}
    for field, attr in [("title", "title"), ("prompt", "prompt"), ("input", "input_spec"), ("output", "output_spec")]:
        if field in data:
            setattr(p, attr, data[field])
    if "constraints" in data:
        p.constraints = json.dumps(data["constraints"])
    if "examples" in data:
        p.examples = json.dumps(data["examples"])
    db.session.commit()
    return jsonify({"problem": p.to_dict()}), 200


@admin_content_bp.route("/questions/round2/<int:problem_id>", methods=["DELETE"])
@admin_required
def delete_round2_problem(problem_id: int):
    p = ProblemR2.query.get(problem_id)
    if p is None:
        return jsonify({"error": "Problem not found."}), 404
    if ProblemR2.query.count() <= 9:
        return jsonify({"error": "Round 2 pool must keep at least 9 problems."}), 400
    db.session.delete(p)
    db.session.commit()
    return jsonify({"message": "Deleted."}), 200


@admin_content_bp.route("/questions/round2/<int:problem_id>/test-cases", methods=["GET"])
@admin_required
def list_round2_test_cases(problem_id: int):
    if ProblemR2.query.get(problem_id) is None:
        return jsonify({"error": "Problem not found."}), 404
    cases = ProblemR2TestCase.query.filter_by(problem_id=problem_id).order_by(
        ProblemR2TestCase.order_index, ProblemR2TestCase.id
    ).all()
    return jsonify(
        {
            "test_cases": [
                {
                    "id": case.id,
                    "input": case.input_data,
                    "expected_output": case.expected_output,
                    "is_hidden": case.is_hidden,
                    "order_index": case.order_index,
                }
                for case in cases
            ]
        }
    ), 200


@admin_content_bp.route("/questions/round2/<int:problem_id>/test-cases", methods=["POST"])
@admin_required
def create_round2_test_case(problem_id: int):
    if ProblemR2.query.get(problem_id) is None:
        return jsonify({"error": "Problem not found."}), 404
    data = request.get_json(silent=True) or {}
    input_data = data.get("input", "")
    expected_output = data.get("expected_output")
    if not isinstance(input_data, str) or not isinstance(expected_output, str):
        return jsonify({"error": "input and expected_output must be strings."}), 400
    case = ProblemR2TestCase(
        problem_id=problem_id,
        input_data=input_data[:65536],
        expected_output=expected_output[:65536],
        is_hidden=bool(data.get("is_hidden", True)),
        order_index=int(data.get("order_index", 0)),
    )
    db.session.add(case)
    db.session.commit()
    return jsonify({"test_case": {"id": case.id}}), 201


@admin_content_bp.route("/questions/round2/test-cases/<int:test_case_id>", methods=["DELETE"])
@admin_required
def delete_round2_test_case(test_case_id: int):
    case = ProblemR2TestCase.query.get(test_case_id)
    if case is None:
        return jsonify({"error": "Test case not found."}), 404
    db.session.delete(case)
    db.session.commit()
    return jsonify({"message": "Deleted."}), 200


# --- Teams overview & management ----------------------------------------------


@admin_content_bp.route("/teams", methods=["POST"])
@admin_required
def create_team():
    data = request.get_json(silent=True) or {}
    required = [
        "team_name",
        "participant1_name",
        "participant2_name",
        "participant1_user_id",
        "participant1_password",
        "participant2_user_id",
        "participant2_password",
    ]
    missing = [f for f in required if not data.get(f) or not str(data.get(f)).strip()]
    if missing:
        return jsonify({"error": f"Missing required field(s): {', '.join(missing)}"}), 400

    team_name = str(data["team_name"]).strip()
    participant1_name = str(data["participant1_name"]).strip()
    participant2_name = str(data["participant2_name"]).strip()
    participant1_user_id = str(data["participant1_user_id"]).strip()
    participant1_password = str(data["participant1_password"])
    participant2_user_id = str(data["participant2_user_id"]).strip()
    participant2_password = str(data["participant2_password"])

    if len(participant1_password) < 8 or len(participant2_password) < 8:
        return jsonify({"error": "Both participant passwords must be at least 8 characters."}), 400

    name_key = team_name.lower()

    if participant1_user_id == participant2_user_id:
        return jsonify({"error": "Each participant must have a unique User ID."}), 400
    if User.query.filter(User.username.in_([participant1_user_id, participant2_user_id])).first() is not None:
        return jsonify({"error": "One of those User IDs is already in use."}), 409

    if Team.query.filter_by(name_key=name_key).first() is not None:
        return jsonify({"error": f"Team name '{team_name}' already exists."}), 409

    users = []
    for participant_user_id, participant_password in (
        (participant1_user_id, participant1_password),
        (participant2_user_id, participant2_password),
    ):
        user = User(
            username=participant_user_id,
            email=f"{participant_user_id.lower()}@sherlock.local",
            is_admin=False,
        )
        user.set_password(participant_password)
        users.append(user)

    try:
        db.session.add_all(users)
        db.session.flush()

        team = Team(
            name=team_name,
            name_key=name_key,
            participant1_name=participant1_name,
            participant2_name=participant2_name,
            user_id=users[0].id,
            round2_qualified=False,
        )
        db.session.add(team)
        db.session.flush()

        db.session.add_all(
            TeamMembership(team_id=team.id, user_id=user.id) for user in users
        )
        db.session.add_all(
            GameProgress(
                user_id=user.id,
                team_name=team.name,
                investigator_name=participant_name,
            )
            for user, participant_name in zip(
                users, (participant1_name, participant2_name)
            )
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Failed to create team. Please try again."}), 500

    return jsonify({"team": team.to_dict(), "users": [u.to_dict() for u in users]}), 201


@admin_content_bp.route("/teams/<int:team_id>/qualify-round2", methods=["PUT"])
@admin_required
def qualify_team_round2(team_id: int):
    team = Team.query.get(team_id)
    if team is None:
        return jsonify({"error": "Team not found."}), 404

    data = request.get_json(silent=True) or {}
    qualified = bool(data.get("qualified", False))
    team.round2_qualified = qualified

    attempt = TeamRound1Attempt.query.filter_by(team_id=team.id).first()
    if attempt:
        attempt.eligible = qualified

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not update Round 2 qualification."}), 500

    return jsonify({"team": team.to_dict(), "round2_qualified": team.round2_qualified}), 200


@admin_content_bp.route("/teams/<int:team_id>/enable-round3", methods=["PUT"])
@admin_required
def enable_team_round3(team_id: int):
    team = Team.query.get(team_id)
    if team is None:
        return jsonify({"error": "Team not found."}), 404
    data = request.get_json(silent=True) or {}
    team.round3_enabled = bool(data.get("enabled", False))
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not update Round 3 access."}), 500
    return jsonify({"team": team.to_dict(), "round3_enabled": team.round3_enabled}), 200


@admin_content_bp.route("/teams/<int:team_id>/retry-round/<int:round_number>", methods=["POST"])
@admin_required
def retry_team_round(team_id: int, round_number: int):
    team = Team.query.get(team_id)
    if team is None:
        return jsonify({"error": "Team not found."}), 404
    if round_number not in (1, 2, 3):
        return jsonify({"error": "Only rounds 1, 2, and 3 can be retried."}), 400

    if round_number == 1:
        TeamRound1Attempt.query.filter_by(team_id=team.id).delete()
        TeamRoundTimer.query.filter_by(team_id=team.id, round_number=1).delete()
        TeamQuestionAssignment.query.filter_by(team_id=team.id, round_number=1).delete()
        team.round2_qualified = False
        team.round3_enabled = False
        team.round3_qualified = False
        TeamRoundSubmission.query.filter_by(team_id=team.id, round_number=2).delete()
        TeamRoundSubmission.query.filter_by(team_id=team.id, round_number=3).delete()
        TeamRoundTimer.query.filter_by(team_id=team.id, round_number=2).delete()
        TeamRoundTimer.query.filter_by(team_id=team.id, round_number=3).delete()
        TeamQuestionAssignment.query.filter_by(team_id=team.id, round_number=2).delete()
        TeamRound2Execution.query.filter_by(team_id=team.id).delete()
    elif round_number == 2:
        TeamRoundSubmission.query.filter_by(team_id=team.id, round_number=2).delete()
        TeamRoundTimer.query.filter_by(team_id=team.id, round_number=2).delete()
        TeamRound2Execution.query.filter_by(team_id=team.id).delete()
        TeamRoundSubmission.query.filter_by(team_id=team.id, round_number=3).delete()
        TeamRoundTimer.query.filter_by(team_id=team.id, round_number=3).delete()
        team.round3_enabled = False
        team.round3_qualified = False
    else:
        TeamRoundSubmission.query.filter_by(team_id=team.id, round_number=3).delete()
        TeamRoundTimer.query.filter_by(team_id=team.id, round_number=3).delete()
        team.round3_qualified = False

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not reset the round for retry."}), 500
    return jsonify({"message": f"Round {round_number} reset. The team can retry it."}), 200


@admin_content_bp.route(
    "/team-submissions/<int:team_id>/<int:round_number>/<int:problem_number>", methods=["PUT"]
)
@admin_required
def grade_team_submission(team_id: int, round_number: int, problem_number: int):
    data = request.get_json(silent=True) or {}
    result = data.get("result")
    if result not in ("correct", "incorrect", "pending"):
        return jsonify({"error": "result must be 'correct', 'incorrect', or 'pending'."}), 400

    submission = TeamRoundSubmission.query.filter_by(
        team_id=team_id, round_number=round_number, problem_number=problem_number
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


@admin_content_bp.route("/teams", methods=["GET"])
@admin_required
def list_teams():
    teams = Team.query.order_by(Team.created_at.desc()).all()
    result = []
    for team in teams:
        members = (
            User.query.join(TeamMembership, TeamMembership.user_id == User.id)
            .filter(TeamMembership.team_id == team.id)
            .all()
        )
        attempt = TeamRound1Attempt.query.filter_by(team_id=team.id).first()
        subs2 = TeamRoundSubmission.query.filter_by(team_id=team.id, round_number=2).all()
        sub3 = TeamRoundSubmission.query.filter_by(team_id=team.id, round_number=3, problem_number=1).first()
        round2_correct = sum(1 for s in subs2 if s.result == "correct")

        # Find team user login (either creator user_id or first member)
        team_user = None
        if team.user_id:
            team_user = User.query.get(team.user_id)
        elif members:
            team_user = members[0]

        result.append(
            {
                "team": team.to_dict(),
                "members": [
                    {"id": u.id, "username": u.username, "email": u.email} for u in members
                ],
                "login_user_id": team_user.username if team_user else "",
                "participant1_name": team.participant1_name,
                "participant2_name": team.participant2_name,
                "round1": attempt.to_dict() if attempt else None,
                "round2_qualified": team.round2_qualified,
                "round2_submissions": [s.to_dict() for s in subs2],
                "round3_submission": sub3.to_dict() if sub3 else None,
                "round3_enabled": team.round3_enabled,
                "round3_qualified": team.round3_qualified,
                "overall_score": compute_overall_score(attempt.score if attempt else 0, round2_correct),
            }
        )
    return jsonify({"count": len(result), "teams": result}), 200
