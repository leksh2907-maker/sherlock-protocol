import unittest
from datetime import datetime, timedelta, timezone

from app import create_app
from extensions import db
from models import (
    ProblemR2TestCase,
    ProblemR2,
    QuestionR1,
    RoundConfig,
    Team,
    TeamMembership,
    TeamQuestionAssignment,
    TeamRound1Attempt,
    TeamRound2Execution,
    TeamRoundTimer,
    User,
)
from routes import team_routes
from services.docker_execution import ExecutionResult, ExecutionStatus


class TestConfig:
    TESTING = True
    SECRET_KEY = "test-secret"
    JWT_SECRET_KEY = "test-jwt-secret"
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    FRONTEND_ORIGIN = "http://localhost:5173"


class FakeExecutor:
    def run(self, language, source, stdin_data=""):
        return ExecutionResult(ExecutionStatus.SUCCESS, "OK\n", "", 0, 1)


class Round2ExecutionApiTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(TestConfig)
        self.client = self.app.test_client()
        self.app_context = self.app.app_context()
        self.app_context.push()
        db.drop_all()
        db.create_all()
        db.session.add(RoundConfig(round_number=1, is_unlocked=True, duration_minutes=30))
        db.session.add(RoundConfig(round_number=2, is_unlocked=True, duration_minutes=60))
        db.session.add_all(
            ProblemR2(
                title=f"Problem {index}",
                prompt="Read stdin and write the expected result.",
                input_spec="Test input",
                output_spec="Test output",
            )
            for index in range(5)
        )
        db.session.add_all(
            QuestionR1(
                question=f"Question {index}",
                options='[{"id":"a","label":"A"},{"id":"b","label":"B"}]',
                correct_option_id="a",
            )
            for index in range(20)
        )
        db.session.flush()
        user = User(username="participant", email="participant@example.com")
        user.set_password("password123")
        team = Team(name="Test Team", name_key="test team", user_id=None, round2_qualified=True)
        db.session.add_all([user, team])
        db.session.flush()
        team.user_id = user.id
        db.session.add(TeamMembership(team_id=team.id, user_id=user.id))
        db.session.add(
            TeamRound1Attempt(
                team_id=team.id,
                score=20,
                eligible=True,
                submitted_at=datetime.now(timezone.utc),
            )
        )
        db.session.commit()
        self.user = user
        self.team = team
        self.token = self.client.post(
            "/api/login", json={"user_id": "participant", "password": "password123"}
        ).get_json()["access_token"]
        self.auth = {"Authorization": f"Bearer {self.token}"}
        self.original_executor = team_routes.execution_service
        team_routes.execution_service = FakeExecutor()

    def tearDown(self):
        team_routes.execution_service = self.original_executor
        db.session.remove()
        self.app_context.pop()

    def test_run_submit_persist_and_score(self):
        start = self.client.post("/api/team/round2/start", headers=self.auth)
        self.assertEqual(start.status_code, 200)
        assignment = TeamQuestionAssignment.query.filter_by(team_id=self.team.id, round_number=2).first()
        problem_id = assignment.assigned_id_list()[0]
        db.session.add(
            ProblemR2TestCase(
                problem_id=problem_id,
                input_data="ignored\n",
                expected_output="OK\n",
                is_hidden=True,
            )
        )
        db.session.commit()

        payload = {"problem_number": 1, "language": "python", "source_code": "print('OK')"}
        run = self.client.post("/api/team/round2/run", headers=self.auth, json=payload)
        self.assertEqual(run.status_code, 200)
        self.assertEqual(run.get_json()["status"], "success")

        submit = self.client.post("/api/team/round2/submit", headers=self.auth, json=payload)
        self.assertEqual(submit.status_code, 200)
        self.assertTrue(submit.get_json()["accepted"])
        self.assertEqual(submit.get_json()["tests_passed"], 1)
        self.assertEqual(submit.get_json()["submission"]["result"], "correct")
        self.assertEqual(TeamRound2Execution.query.filter_by(team_id=self.team.id).count(), 2)

        leaderboard = self.client.get("/api/leaderboard")
        self.assertEqual(leaderboard.status_code, 200)
        self.assertEqual(leaderboard.get_json()["leaderboard"][0]["score"], 30)

    def test_rejects_unauthenticated_and_expired_requests(self):
        self.assertEqual(
            self.client.post("/api/team/round2/run", json={}).status_code,
            401,
        )
        self.client.post("/api/team/round2/start", headers=self.auth)
        timer = TeamRoundTimer.query.filter_by(team_id=self.team.id, round_number=2).first()
        timer.started_at = datetime.now(timezone.utc) - timedelta(hours=2)
        db.session.commit()
        response = self.client.post(
            "/api/team/round2/run",
            headers=self.auth,
            json={"problem_number": 1, "language": "python", "source_code": "print(1)"},
        )
        self.assertEqual(response.status_code, 403)

    def test_round1_rejects_expired_submission(self):
        attempt = TeamRound1Attempt.query.filter_by(team_id=self.team.id).first()
        attempt.submitted_at = None
        db.session.commit()
        start = self.client.post("/api/team/round1/start", headers=self.auth)
        self.assertEqual(start.status_code, 200)
        timer = TeamRoundTimer.query.filter_by(team_id=self.team.id, round_number=1).first()
        timer.started_at = datetime.now(timezone.utc) - timedelta(hours=2)
        db.session.commit()

        response = self.client.post(
            "/api/team/round1/submit",
            headers=self.auth,
            json={"answers": {}},
        )
        self.assertEqual(response.status_code, 403)

    def test_round2_uses_configured_duration(self):
        config = RoundConfig.query.filter_by(round_number=2).first()
        config.duration_minutes = 17
        db.session.commit()

        response = self.client.post("/api/team/round2/start", headers=self.auth)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["timer"]["duration_minutes"], 17)

    def test_run_returns_visible_results_without_hidden_expectations(self):
        self.client.post("/api/team/round2/start", headers=self.auth)
        assignment = TeamQuestionAssignment.query.filter_by(team_id=self.team.id, round_number=2).first()
        problem_id = assignment.assigned_id_list()[0]
        db.session.add_all(
            [
                ProblemR2TestCase(
                    problem_id=problem_id,
                    input_data="visible\n",
                    expected_output="OK\n",
                    is_hidden=False,
                ),
                ProblemR2TestCase(
                    problem_id=problem_id,
                    input_data="hidden\n",
                    expected_output="SECRET\n",
                    is_hidden=True,
                ),
            ]
        )
        db.session.commit()

        response = self.client.post(
            "/api/team/round2/run",
            headers=self.auth,
            json={"problem_number": 1, "language": "python", "source_code": "print('OK')"},
        )

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["tests_total"], 1)
        self.assertEqual(body["tests_passed"], 1)
        self.assertEqual(len(body["test_results"]), 1)
        self.assertNotIn("SECRET", response.get_data(as_text=True))

    def test_submit_ignores_hidden_case_when_visible_output_matches(self):
        self.client.post("/api/team/round2/start", headers=self.auth)
        assignment = TeamQuestionAssignment.query.filter_by(team_id=self.team.id, round_number=2).first()
        problem_id = assignment.assigned_id_list()[0]
        db.session.add_all(
            [
                ProblemR2TestCase(
                    problem_id=problem_id,
                    input_data="visible\n",
                    expected_output="OK\n",
                    is_hidden=False,
                ),
                ProblemR2TestCase(
                    problem_id=problem_id,
                    input_data="hidden\n",
                    expected_output="DIFFERENT\n",
                    is_hidden=True,
                ),
            ]
        )
        db.session.commit()

        response = self.client.post(
            "/api/team/round2/submit",
            headers=self.auth,
            json={"problem_number": 1, "language": "python", "source_code": "print('OK')"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["accepted"])
        self.assertEqual(response.get_json()["tests_total"], 1)

    def test_docker_unavailable_is_controlled(self):
        unavailable = team_routes.DockerExecutionService(docker_binary="docker-does-not-exist")
        result = unavailable.run("python", "print(1)")
        self.assertEqual(result.status, ExecutionStatus.INTERNAL_ERROR)


if __name__ == "__main__":
    unittest.main()