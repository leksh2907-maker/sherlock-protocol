"""Single source of truth for how a participant's overall score is computed,
so the admin dashboard and the public leaderboard can never disagree."""

ROUND2_POINTS_PER_CORRECT = 10


def compute_overall_score(round1_score: int, round2_correct: int) -> int:
    return (round1_score or 0) + (round2_correct or 0) * ROUND2_POINTS_PER_CORRECT
