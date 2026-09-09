import json

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from extensions import db
from models import GameProgress

progress_bp = Blueprint("progress", __name__)


@progress_bp.route("/progress", methods=["GET"])
@jwt_required()
def get_progress():
    user_id = get_jwt_identity()
    progress = GameProgress.query.filter_by(user_id=user_id).first()
    if progress is None:
        return jsonify({"progress": None}), 200
    return jsonify({"progress": progress.to_dict()}), 200


@progress_bp.route("/progress", methods=["PUT"])
@jwt_required()
def save_progress():
    user_id = get_jwt_identity()
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "Request body must be valid JSON."}), 400

    chapters_completed = data.get("chapters_completed", {})
    if not isinstance(chapters_completed, dict):
        return jsonify({"error": "chapters_completed must be an object."}), 400

    evidence_found = data.get("evidence_found", [])
    if not isinstance(evidence_found, list):
        return jsonify({"error": "evidence_found must be a list."}), 400

    answered_puzzles = data.get("answered_puzzles", [])
    if not isinstance(answered_puzzles, list):
        return jsonify({"error": "answered_puzzles must be a list."}), 400

    score = data.get("score", 0)
    if not isinstance(score, int):
        return jsonify({"error": "score must be an integer."}), 400

    # user_id always comes from the verified JWT, never from the request body,
    # so a user can only ever read or write their own progress row.
    progress = GameProgress.query.filter_by(user_id=user_id).first()
    if progress is None:
        progress = GameProgress(user_id=user_id)
        db.session.add(progress)

    progress.investigator_name = str(data.get("investigator_name") or "")[:80]
    progress.team_name = str(data.get("team_name") or "")[:80]
    progress.score = score
    progress.chapters_completed = json.dumps(chapters_completed)
    progress.evidence_found = json.dumps(evidence_found)
    progress.answered_puzzles = json.dumps(answered_puzzles)
    progress.case_solved = bool(data.get("case_solved", False))

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not save progress. Please try again."}), 500

    return jsonify({"message": "Progress saved.", "progress": progress.to_dict()}), 200
