import json
import random
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from extensions import db
from models import (
    User,
    RoundConfig,
    Team,
    TeamMembership,
    QuestionR1,
    ProblemR2,
    ProblemR2TestCase,

    TeamRoundTimer,
    TeamQuestionAssignment,
    TeamRound1Attempt,
    TeamRoundSubmission,
    TeamRound2Execution,
)

from utils.scoring import compute_overall_score
from services.docker_execution import DockerExecutionService, ExecutionStatus, SupportedLanguage

team_bp = Blueprint("team", __name__)

ROUND1_COUNT = 20
ROUND2_COUNT = 5
ROUND2_DURATION_MINUTES = 60
execution_service = DockerExecutionService()


def _utcnow():
    return datetime.now(timezone.utc)


def _round_config_map() -> dict:
    return {c.round_number: c for c in RoundConfig.query.all()}


def _get_user_team(user_id):
    membership = TeamMembership.query.filter_by(user_id=int(user_id)).first()
    if membership is None:
        return None
    return Team.query.get(membership.team_id)


def _require_team(user_id):
    """Returns a Team, or a Flask response to return immediately."""
    team = _get_user_team(user_id)
    if team is None:
        # Check if user has an assigned team created by admin
        return jsonify({"error": "Your team has not been assigned yet. Contact the organizer."}), 403
    return team


def _get_or_create_timer(team_id: int, round_number: int, duration_minutes: int) -> TeamRoundTimer:
    timer = TeamRoundTimer.query.filter_by(team_id=team_id, round_number=round_number).first()
    if timer is None:
        timer = TeamRoundTimer(team_id=team_id, round_number=round_number, duration_minutes=duration_minutes)
        db.session.add(timer)
        db.session.commit()
    return timer


def _round_problem_count(round_number: int) -> int:
    return ROUND2_COUNT


def _pool_model(round_number: int):
    return ProblemR2


def _round2_context(team: Team, problem_number: object):
    """Validate Round 2 access and resolve a position to this team's problem."""
    config = _round_config_map().get(2)
    if config is None or not config.is_unlocked:
        return None, (jsonify({"error": "Round 2 is currently locked."}), 403)

    attempt = TeamRound1Attempt.query.filter_by(team_id=team.id).first()
    if not attempt or not attempt.submitted_at or not team.round2_qualified:
        return None, (jsonify({"error": "Round 2 is not enabled for this team."}), 403)

    timer = TeamRoundTimer.query.filter_by(team_id=team.id, round_number=2).first()
    if timer is None:
        return None, (jsonify({"error": "Round 2 has not been started."}), 400)
    if timer.is_expired():
        return None, (jsonify({"error": "Time is up for Round 2."}), 403)

    assignment = TeamQuestionAssignment.query.filter_by(team_id=team.id, round_number=2).first()
    if assignment is None:
        return None, (jsonify({"error": "Round 2 has not been started."}), 400)
    assigned_ids = assignment.assigned_id_list()
    if not isinstance(problem_number, int) or not 1 <= problem_number <= len(assigned_ids):
        return None, (jsonify({"error": "Invalid assigned problem."}), 400)

    problem = ProblemR2.query.get(assigned_ids[problem_number - 1])
    if problem is None:
        return None, (jsonify({"error": "Assigned problem no longer exists."}), 409)
    return (problem, problem_number), None


def _make_execution_record(
    team_id: int,
    problem_id: int,
    problem_number: int,
    language: str,
    source: str,
    mode: str,
    result,
    input_data: str,
    passed: int,
    total: int,
    test_results: list,
) -> TeamRound2Execution:
    return TeamRound2Execution(
        team_id=team_id,
        problem_id=problem_id,
        problem_number=problem_number,
        language=language,
        source_code=source,
        mode=mode,
        status=result.status.value,
        stdout=result.stdout,
        stderr=result.stderr,
        input_data=input_data,
        passed_tests=passed,
        total_tests=total,
        duration_ms=result.duration_ms,
        exit_code=result.exit_code,
        test_results=json.dumps(test_results),
    )


def _assign_questions(team_id: int, round_number: int, pool_model, count: int) -> TeamQuestionAssignment:
    """Randomly (and persistently) assigns `count` distinct pool items to a
    team for a round, on first access only. Best-effort avoids handing two
    teams the exact same combination."""
    existing = TeamQuestionAssignment.query.filter_by(team_id=team_id, round_number=round_number).first()
    if existing:
        return existing

    all_ids = [row.id for row in pool_model.query.all()]
    if len(all_ids) < count:
        raise ValueError(f"Question pool for round {round_number} has fewer than {count} items.")

    other_combos = {
        tuple(sorted(json.loads(a.assigned_ids)))
        for a in TeamQuestionAssignment.query.filter_by(round_number=round_number).all()
    }
    chosen = None
    for _ in range(20):
        candidate = tuple(sorted(random.sample(all_ids, count)))
        if candidate not in other_combos:
            chosen = candidate
            break
    if chosen is None:
        chosen = tuple(sorted(random.sample(all_ids, count)))

    order = list(chosen)
    random.shuffle(order)  # randomize presentation order, not just selection

    option_orders = None
    if round_number == 1:
        option_orders = {}
        for qid in order:
            q = pool_model.query.get(qid)
            opt_ids = [o["id"] for o in json.loads(q.options)]
            random.shuffle(opt_ids)
            option_orders[str(qid)] = opt_ids

    assignment = TeamQuestionAssignment(
        team_id=team_id,
        round_number=round_number,
        assigned_ids=json.dumps(order),
        option_orders=json.dumps(option_orders) if option_orders else None,
    )
    db.session.add(assignment)
    db.session.commit()
    return assignment


@team_bp.route("/team/status", methods=["GET"])
@jwt_required()
def team_status():
    user_id = int(get_jwt_identity())
    team = _get_user_team(user_id)
    if team is None:
        return jsonify({"team": None}), 200

    members = (
        User.query.join(TeamMembership, TeamMembership.user_id == User.id)
        .filter(TeamMembership.team_id == team.id)
        .all()
    )
    attempt = TeamRound1Attempt.query.filter_by(team_id=team.id).first()
    timer1 = TeamRoundTimer.query.filter_by(team_id=team.id, round_number=1).first()
    timer2 = TeamRoundTimer.query.filter_by(team_id=team.id, round_number=2).first()
    timer3 = TeamRoundTimer.query.filter_by(team_id=team.id, round_number=3).first()
    subs2 = TeamRoundSubmission.query.filter_by(team_id=team.id, round_number=2).all()
    sub3 = TeamRoundSubmission.query.filter_by(team_id=team.id, round_number=3, problem_number=1).first()

    configs = _round_config_map()
    round1_completed = bool(attempt and attempt.submitted_at is not None)
    round2_access = bool(configs.get(2) and configs[2].is_unlocked and round1_completed and team.round2_qualified)

    round2_submitted_count = sum(1 for s in subs2 if s.status == "submitted")
    round2_correct_count = sum(1 for s in subs2 if s.result == "correct")
    overall_score = compute_overall_score(attempt.score if attempt else 0, round2_correct_count)
    round2_completed = round2_submitted_count >= ROUND2_COUNT or bool(timer2 and timer2.is_expired())
    round3_config = configs.get(3)
    round2_successfully_completed = round2_submitted_count >= ROUND2_COUNT
    round3_access = bool(
        round3_config and round3_config.is_unlocked and round2_successfully_completed and team.round3_enabled
    )
    round3_completed = bool(sub3 and sub3.status == "submitted")
    round3_success = bool(sub3 and sub3.result == "correct")

    return jsonify(
        {
            "team": team.to_dict(),
            "members": [{"id": u.id, "username": u.username} for u in members],
            "rounds": {str(n): c.to_dict() for n, c in configs.items() if n in (1, 2, 3)},
            "round1": {
                **(attempt.to_dict() if attempt else {"submitted": False, "score": None, "eligible": None}),
                "timer": timer1.to_dict() if timer1 else None,
                "result": {
                    "code_word": configs[1].code_word,
                    "key_update": configs[1].key_update,
                } if attempt and attempt.submitted_at and configs.get(1) else None,
            },
            "round2": {
                "access": round2_access,
                "round1_completed": round1_completed,
                "qualified": team.round2_qualified,
                "timer": timer2.to_dict() if timer2 else None,
                "submissions": [s.to_dict() for s in subs2],
                "result": {
                    "code_word": configs[2].code_word,
                    "key_update": configs[2].key_update,
                } if round2_successfully_completed and configs.get(2) else None,
            },
            "round3": {
                "access": round3_access,
                "round2_completed": round2_successfully_completed,
                "timer": timer3.to_dict() if timer3 else None,
                "timer_expired": bool(timer3 and timer3.is_expired()),
                "submitted": round3_completed,
                "qualified": team.round3_qualified,
                "submission": sub3.to_dict() if sub3 else None,
                "result": {
                    "code_word": round3_config.code_word,
                    "key_update": round3_config.key_update,
                } if round3_success else None,
            },
            "final_result": {
                "round1_score": attempt.score if attempt else 0,
                "round1_completed": round1_completed,
                "round2_qualified": team.round2_qualified,
                "round2_submitted_count": round2_submitted_count,
                "round2_correct_count": round2_correct_count,
                "round2_completed": round2_completed,
                "overall_score": overall_score,
            },
        }
    ), 200


# --- Round 1: team quiz ------------------------------------------------------


@team_bp.route("/team/round1/start", methods=["POST"])
@jwt_required()
def team_round1_start():
    team = _require_team(get_jwt_identity())
    if not isinstance(team, Team):
        return team

    configs = _round_config_map()
    cfg = configs.get(1)
    if cfg is None or not cfg.is_unlocked:
        return jsonify({"error": "Round 1 is currently closed."}), 403

    attempt = TeamRound1Attempt.query.filter_by(team_id=team.id).first()
    if attempt is None:
        attempt = TeamRound1Attempt(team_id=team.id)
        db.session.add(attempt)
        db.session.commit()
    if attempt.submitted_at is not None:
        return jsonify({"already_submitted": True, "result": attempt.to_dict()}), 200

    assignment = _assign_questions(team.id, 1, QuestionR1, ROUND1_COUNT)
    timer = _get_or_create_timer(team.id, 1, cfg.duration_minutes)

    option_orders = assignment.option_order_map()
    questions = []
    for qid in assignment.assigned_id_list():
        q = QuestionR1.query.get(qid)
        opts_by_id = {o["id"]: o for o in json.loads(q.options)}
        order = option_orders.get(str(qid), list(opts_by_id.keys()))
        questions.append(
            {
                "id": str(qid),
                "question": q.question,
                "options": [opts_by_id[oid] for oid in order if oid in opts_by_id],
            }
        )

    return jsonify({"already_submitted": False, "questions": questions, "timer": timer.to_dict()}), 200


@team_bp.route("/team/round1/submit", methods=["POST"])
@jwt_required()
def team_round1_submit():
    team = _require_team(get_jwt_identity())
    if not isinstance(team, Team):
        return team

    data = request.get_json(silent=True) or {}
    answers = data.get("answers", {})
    if not isinstance(answers, dict):
        return jsonify({"error": "answers must be an object of {questionId: optionId}."}), 400

    attempt = TeamRound1Attempt.query.filter_by(team_id=team.id).first()
    if attempt is None or attempt.submitted_at is not None:
        return jsonify({"error": "Round 1 has already been submitted for this team."}), 409

    assignment = TeamQuestionAssignment.query.filter_by(team_id=team.id, round_number=1).first()
    if assignment is None:
        return jsonify({"error": "Round 1 has not been started."}), 400

    timer = TeamRoundTimer.query.filter_by(team_id=team.id, round_number=1).first()
    if timer is None:
        return jsonify({"error": "Round 1 has not been started."}), 400
    if timer.is_expired():
        return jsonify({"error": "Time is up for Round 1."}), 403

    score = 0
    results = []
    for qid in assignment.assigned_id_list():
        q = QuestionR1.query.get(qid)
        given = answers.get(str(qid))
        is_correct = given == q.correct_option_id
        if is_correct:
            score += 1
        results.append(
            {
                "id": str(qid),
                "question": q.question,
                "your_answer": given,
                "correct_answer": q.correct_option_id,
                "is_correct": is_correct,
            }
        )

    eligible = bool(team.round2_qualified)

    attempt.answers = json.dumps(answers)
    attempt.score = score
    attempt.eligible = eligible
    attempt.submitted_at = _utcnow()
    if timer:
        timer.completed_at = _utcnow()

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not save your submission. Please try again."}), 500

    return jsonify({"score": score, "total": len(results), "eligible": eligible, "results": results}), 200


@team_bp.route("/team/round1/result", methods=["GET"])
@jwt_required()
def team_round1_result():
    team = _require_team(int(get_jwt_identity()))
    if not isinstance(team, Team):
        return team

    attempt = TeamRound1Attempt.query.filter_by(team_id=team.id).first()
    if attempt is None or attempt.submitted_at is None:
        return jsonify({"submitted": False}), 200

    assignment = TeamQuestionAssignment.query.filter_by(team_id=team.id, round_number=1).first()
    answers = json.loads(attempt.answers or "{}")
    results = []
    for qid in assignment.assigned_id_list():
        q = QuestionR1.query.get(qid)
        given = answers.get(str(qid))
        results.append(
            {
                "id": str(qid),
                "question": q.question,
                "your_answer": given,
                "correct_answer": q.correct_option_id,
                "is_correct": given == q.correct_option_id,
            }
        )

    return jsonify(
        {"submitted": True, "score": attempt.score, "total": len(results), "eligible": team.round2_qualified, "results": results}
    ), 200


# --- Round 2: team programming problems --------------------------------------


@team_bp.route("/team/round2/start", methods=["POST"])
@jwt_required()
def team_round2_start():
    return _start_team_round(2)


@team_bp.route("/team/round3/submit", methods=["POST"])
@jwt_required()
def team_round3_submit():
    team = _require_team(int(get_jwt_identity()))
    if not isinstance(team, Team):
        return team

    config = _round_config_map().get(3)
    subs2 = TeamRoundSubmission.query.filter_by(team_id=team.id, round_number=2).all()
    if config is None or not config.is_unlocked or not team.round3_enabled:
        return jsonify({"error": "Round 3 is currently locked."}), 403
    if sum(1 for submission in subs2 if submission.status == "submitted") < ROUND2_COUNT:
        return jsonify({"error": "Complete Round 2 before accessing Round 3."}), 403
    if not (config.code_word or "").strip():
        return jsonify({"error": "Round 3 is not configured yet."}), 409

    timer = TeamRoundTimer.query.filter_by(team_id=team.id, round_number=3).first()
    if timer is None:
        return jsonify({"error": "Round 3 has not been started."}), 400
    if timer.is_expired():
        return jsonify({"error": "Time is up for Round 3."}), 403

    data = request.get_json(silent=True) or {}
    answer = data.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        return jsonify({"error": "answer is required."}), 400
    if len(answer.strip().split()) > 50:
        return jsonify({"error": "Your answer must be 50 words or fewer."}), 400

    submission = TeamRoundSubmission.query.filter_by(
        team_id=team.id, round_number=3, problem_number=1
    ).first()
    if submission is None:
        submission = TeamRoundSubmission(team_id=team.id, round_number=3, problem_number=1)
        db.session.add(submission)
    submission.status = "submitted"
    submission.result = "correct" if config.code_word.casefold() in answer.casefold() else "incorrect"
    submission.submission_text = answer.strip()
    submission.submitted_at = _utcnow()
    team.round3_qualified = submission.result == "correct"
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not save your Round 3 answer."}), 500

    return jsonify({
        "submission": submission.to_dict(),
        "qualified": team.round3_qualified,
        "result": {
            "code_word": config.code_word,
            "key_update": config.key_update,
        } if team.round3_qualified else None,
    }), 200


@team_bp.route("/team/round3/start", methods=["POST"])
@jwt_required()
def team_round3_start():
    team = _require_team(int(get_jwt_identity()))
    if not isinstance(team, Team):
        return team

    config = _round_config_map().get(3)
    submitted_count = TeamRoundSubmission.query.filter_by(
        team_id=team.id, round_number=2, status="submitted"
    ).count()
    if config is None or not config.is_unlocked or not team.round3_enabled:
        return jsonify({"error": "Round 3 is currently locked."}), 403
    if submitted_count < ROUND2_COUNT:
        return jsonify({"error": "Complete Round 2 before accessing Round 3."}), 403

    timer = _get_or_create_timer(team.id, 3, config.duration_minutes)
    submission = TeamRoundSubmission.query.filter_by(
        team_id=team.id, round_number=3, problem_number=1
    ).first()
    return jsonify({
        "timer": timer.to_dict(),
        "submission": submission.to_dict() if submission else None,
    }), 200


@team_bp.route("/team/round2/run", methods=["POST"])
@jwt_required()
def team_round2_run():
    team = _require_team(int(get_jwt_identity()))
    if not isinstance(team, Team):
        return team

    data = request.get_json(silent=True) or {}
    context, error = _round2_context(team, data.get("problem_number"))
    if error:
        return error
    problem, problem_number = context

    language = data.get("language")
    source = data.get("source_code")
    input_data = data.get("input_data", "")
    if not isinstance(language, str) or language not in {item.value for item in SupportedLanguage}:
        return jsonify({"error": "language must be one of: python, c, cpp, java."}), 400
    if not isinstance(source, str) or not source.strip():
        return jsonify({"error": "source_code is required."}), 400
    if not isinstance(input_data, str):
        return jsonify({"error": "input_data must be a string."}), 400

    visible_cases = []
    if not input_data:
        visible_cases = ProblemR2TestCase.query.filter_by(problem_id=problem.id, is_hidden=False).order_by(
            ProblemR2TestCase.order_index, ProblemR2TestCase.id
        ).all()
    cases = visible_cases or [None]
    execution_results = []
    outputs = []
    errors = []
    total_duration = 0
    last_result = None
    for test_case in cases:
        case_input = test_case.input_data if test_case is not None else input_data
        result = execution_service.run(language, source, case_input)
        if result.status == ExecutionStatus.INTERNAL_ERROR:
            return jsonify({"error": result.stderr or "Code execution service unavailable."}), 503
        last_result = result
        total_duration += result.duration_ms
        outputs.append(result.stdout)
        errors.append(result.stderr)
        passed_case = None
        if test_case is not None:
            passed_case = result.status == ExecutionStatus.SUCCESS and _same_output(
                result.stdout, test_case.expected_output
            )
        execution_results.append(
            {
                "test_case": len(execution_results) + 1,
                "passed": passed_case,
                "execution_status": result.status.value,
                "duration_ms": result.duration_ms,
            }
        )

    result = last_result
    assert result is not None

    db.session.add(
        _make_execution_record(
            team.id,
            problem.id,
            problem_number,
            language,
            source,
            "run",
            result,
            "\n".join(test_case.input_data for test_case in visible_cases) if visible_cases else input_data,
            sum(1 for item in execution_results if item["passed"] is True),
            len(visible_cases),
            execution_results,
        )
    )
    db.session.commit()
    return jsonify(
        {
            "problem_number": problem_number,
            "status": result.status.value if all(
                item["execution_status"] == result.status.value for item in execution_results
            ) else "mixed",
            "stdout": "\n".join(outputs),
            "stderr": "\n".join(errors),
            "exit_code": result.exit_code,
            "duration_ms": total_duration,
            "tests_passed": sum(1 for item in execution_results if item["passed"] is True),
            "tests_total": len(visible_cases),
            "test_results": execution_results,
        }
    ), 200


@team_bp.route("/team/round2/submit", methods=["POST"])
@jwt_required()
def team_round2_submit_code():
    team = _require_team(int(get_jwt_identity()))
    if not isinstance(team, Team):
        return team

    data = request.get_json(silent=True) or {}
    context, error = _round2_context(team, data.get("problem_number"))
    if error:
        return error
    problem, problem_number = context

    language = data.get("language")
    source = data.get("source_code")
    if not isinstance(language, str) or language not in {item.value for item in SupportedLanguage}:
        return jsonify({"error": "language must be one of: python, c, cpp, java."}), 400
    if not isinstance(source, str) or not source.strip():
        return jsonify({"error": "source_code is required."}), 400

    test_cases = ProblemR2TestCase.query.filter_by(problem_id=problem.id, is_hidden=False).order_by(
        ProblemR2TestCase.order_index, ProblemR2TestCase.id
    ).all()
    if not test_cases:
        test_cases = [None]

    passed = 0
    test_results = []
    outputs = []
    errors = []
    total_duration = 0
    last_exit_code = None
    evaluation_status = "accepted"
    for test_case in test_cases:
        result = execution_service.run(language, source, test_case.input_data if test_case else "")
        if result.status == ExecutionStatus.INTERNAL_ERROR:
            return jsonify({"error": result.stderr or "Code execution service unavailable."}), 503
        total_duration += result.duration_ms
        last_exit_code = result.exit_code
        outputs.append(result.stdout)
        errors.append(result.stderr)
        passed_case = result.status == ExecutionStatus.SUCCESS and (
            test_case is None or _same_output(result.stdout, test_case.expected_output)
        )
        if passed_case:
            passed += 1
        elif evaluation_status == "accepted":
            evaluation_status = {
                ExecutionStatus.COMPILE_ERROR: "compile_error",
                ExecutionStatus.RUNTIME_ERROR: "runtime_error",
                ExecutionStatus.TIMEOUT: "timeout",
            }.get(result.status, "wrong_answer")
            if result.status == ExecutionStatus.SUCCESS:
                evaluation_status = "wrong_answer"
        test_results.append(
            {
                "test_case": len(test_results) + 1,
                "passed": passed_case,
                "execution_status": result.status.value,
                "duration_ms": result.duration_ms,
            }
        )

    accepted = passed == len(test_cases)
    if accepted:
        evaluation_status = "accepted"
    submission = TeamRoundSubmission.query.filter_by(
        team_id=team.id, round_number=2, problem_number=problem_number
    ).first()
    if submission is None:
        submission = TeamRoundSubmission(
            team_id=team.id, round_number=2, problem_number=problem_number
        )
        db.session.add(submission)
    submission.status = "submitted"
    submission.result = "correct" if accepted else "incorrect"
    submission.submission_text = source
    submission.submitted_at = _utcnow()
    db.session.add(
        TeamRound2Execution(
            team_id=team.id,
            problem_id=problem.id,
            problem_number=problem_number,
            language=language,
            source_code=source,
            mode="submit",
            status=evaluation_status,
            stdout="\n".join(outputs),
            stderr="\n".join(errors),
            input_data="",
            passed_tests=passed,
            total_tests=len(test_cases),
            duration_ms=total_duration,
            exit_code=last_exit_code,
            test_results=json.dumps(test_results),
        )
    )
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not save your code submission."}), 500

    return jsonify(
        {
            "problem_number": problem_number,
            "status": evaluation_status,
            "accepted": accepted,
            "tests_passed": passed,
            "tests_total": len(test_cases),
            "submission": submission.to_dict(),
        }
    ), 200


def _same_output(actual: str, expected: str) -> bool:
    return actual.replace("\r\n", "\n").strip() == expected.replace("\r\n", "\n").strip()


def _start_team_round(round_number: int):
    if round_number != 2:
        return jsonify({"error": "Only Round 2 uses timed problems."}), 400

    team = _require_team(int(get_jwt_identity()))
    if not isinstance(team, Team):
        return team

    configs = _round_config_map()
    cfg = configs.get(round_number)
    if cfg is None or not cfg.is_unlocked:
        return jsonify({"error": "Round 2 is currently locked."}), 403

    attempt = TeamRound1Attempt.query.filter_by(team_id=team.id).first()
    if not attempt or not attempt.submitted_at:
        return jsonify({"error": "Round 1 must be completed before accessing Round 2."}), 403

    if not team.round2_qualified:
        return jsonify({"error": "Round 2 is locked. Please wait for the administrator to qualify your team."}), 403

    count = ROUND2_COUNT
    try:
        assignment = _assign_questions(team.id, round_number, ProblemR2, count)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 500

    timer = _get_or_create_timer(team.id, round_number, cfg.duration_minutes)

    problems = [ProblemR2.query.get(pid).to_dict() for pid in assignment.assigned_id_list()]
    submissions = TeamRoundSubmission.query.filter_by(team_id=team.id, round_number=round_number).all()

    return jsonify(
        {"timer": timer.to_dict(), "problems": problems, "submissions": [s.to_dict() for s in submissions]}
    ), 200


@team_bp.route("/team/rounds/<int:round_number>/submissions", methods=["POST"])
@jwt_required()
def team_submit_problem(round_number: int):
    if round_number != 2:
        return jsonify({"error": "Only Round 2 submissions are supported."}), 400

    team = _require_team(int(get_jwt_identity()))
    if not isinstance(team, Team):
        return team

    if not team.round2_qualified:
        return jsonify({"error": "Round 2 is locked. Please wait for the administrator to qualify your team."}), 403

    data = request.get_json(silent=True) or {}
    problem_number = data.get("problem_number")
    status = data.get("status")
    submission_text = data.get("submission_text")

    max_problem = _round_problem_count(round_number)
    if not isinstance(problem_number, int) or not (1 <= problem_number <= max_problem):
        return jsonify({"error": f"problem_number must be between 1 and {max_problem}."}), 400
    if status not in ("attempted", "submitted"):
        return jsonify({"error": "status must be 'attempted' or 'submitted'."}), 400

    timer = TeamRoundTimer.query.filter_by(team_id=team.id, round_number=round_number).first()
    if timer is None:
        return jsonify({"error": f"Round {round_number} has not been started."}), 400
    if timer.is_expired():
        return jsonify({"error": f"Time is up for Round {round_number}."}), 403

    submission = TeamRoundSubmission.query.filter_by(
        team_id=team.id, round_number=round_number, problem_number=problem_number
    ).first()
    if submission is None:
        submission = TeamRoundSubmission(team_id=team.id, round_number=round_number, problem_number=problem_number)
        db.session.add(submission)

    submission.status = status
    if submission_text is not None:
        submission.submission_text = str(submission_text)[:5000]
    if status == "submitted":
        submission.submitted_at = _utcnow()

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not save your submission. Please try again."}), 500

    return jsonify({"submission": submission.to_dict()}), 200


