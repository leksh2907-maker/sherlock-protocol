from flask import Blueprint, jsonify

from models import Team, TeamRound1Attempt, TeamRoundSubmission
from utils.scoring import compute_overall_score

leaderboard_bp = Blueprint("leaderboard", __name__)


@leaderboard_bp.route("/leaderboard", methods=["GET"])
def get_leaderboard():
    attempts = TeamRound1Attempt.query.filter(TeamRound1Attempt.submitted_at.isnot(None)).all()

    entries = []
    for attempt in attempts:
        team = Team.query.get(attempt.team_id)
        if team is None:
            continue

        round2_correct = TeamRoundSubmission.query.filter_by(
            team_id=attempt.team_id, round_number=2, result="correct"
        ).count()

        entries.append(
            {
                "team_name": team.name,
                "participant1_name": team.participant1_name,
                "participant2_name": team.participant2_name,
                "round1_score": attempt.score or 0,
                "round2_qualified": bool(team.round2_qualified),
                "round2_correct": round2_correct,
                "score": compute_overall_score(attempt.score or 0, round2_correct),
                "updated_at": attempt.submitted_at.isoformat(),
            }
        )

    entries.sort(key=lambda e: (-e["score"], e["updated_at"]))
    top = entries[:50]
    for rank, entry in enumerate(top, start=1):
        entry["rank"] = rank

    return jsonify({"leaderboard": top}), 200
