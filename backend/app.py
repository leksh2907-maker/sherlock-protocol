import json

import click
from flask import Flask, jsonify
from sqlalchemy import inspect

from config import Config
from extensions import db, jwt, cors
from models import (
    GameProgress,
    ProblemR2,
    ProblemR2TestCase,
    QuestionR1,
    Round1Attempt,
    RoundConfig,
    RoundSubmission,
    RoundTimer,
    Team,
    TeamMembership,
    TeamQuestionAssignment,
    TeamRound1Attempt,
    TeamRound2Execution,
    TeamRoundSubmission,
    TeamRoundTimer,
    TokenBlocklist,
    User,
)
from data.seed_content import ROUND1_POOL, ROUND2_POOL
from data.round2_test_cases import ROUND2_HIDDEN_TESTS

from routes.auth_routes import auth_bp
from routes.contact_routes import contact_bp
from routes.newsletter_routes import newsletter_bp
from routes.admin_routes import admin_bp
from routes.progress_routes import progress_bp
from routes.leaderboard_routes import leaderboard_bp
from routes.team_routes import team_bp
from routes.admin_content_routes import admin_content_bp


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # --- Extensions -----------------------------------------------------
    db.init_app(app)
    jwt.init_app(app)
    allowed_origins = [
        origin.strip()
        for origin in app.config["FRONTEND_ORIGIN"].split(",")
        if origin.strip()
    ]
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": allowed_origins}},
    )

    # --- Blueprints -------------------------------------------------------
    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(contact_bp, url_prefix="/api")
    app.register_blueprint(newsletter_bp, url_prefix="/api")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(progress_bp, url_prefix="/api")
    app.register_blueprint(leaderboard_bp, url_prefix="/api")
    app.register_blueprint(team_bp, url_prefix="/api")
    app.register_blueprint(admin_content_bp, url_prefix="/api/admin")

    # --- Health check -------------------------------------------------------
    @app.route("/api/health", methods=["GET"])
    def health_check():
        return jsonify({"status": "ok", "service": "sherlock-protocol-backend"}), 200

    # --- JWT: blocklist check (powers real server-side logout) ------------
    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        jti = jwt_payload["jti"]
        return (
            db.session.query(TokenBlocklist.id).filter_by(jti=jti).scalar() is not None
        )

    # --- JWT: clean JSON error responses instead of default HTML ----------
    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Your session has expired. Please log in again."}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(reason):
        return jsonify({"error": "Invalid authentication token."}), 401

    @jwt.unauthorized_loader
    def missing_token_callback(reason):
        return jsonify({"error": "Authentication token is required."}), 401

    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "This session has been logged out."}), 401

    # --- Generic error handlers --------------------------------------------
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": "Bad request."}), 400

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Resource not found."}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed."}), 405

    @app.errorhandler(500)
    def internal_error(e):
        db.session.rollback()
        return jsonify({"error": "Internal server error."}), 500

    # --- CLI: promote/create an admin user ---------------------------------
    @app.cli.command("create-admin")
    @click.argument("username")
    @click.argument("email")
    @click.argument("password")
    def create_admin(username, email, password):
        """Create (or promote) an admin user: flask create-admin <username> <email> <password>"""
        email = email.strip().lower()

        user = User.query.filter_by(email=email).first()
        if user is None:
            user = User(username=username.strip(), email=email)
            user.set_password(password)
            db.session.add(user)
        user.is_admin = True
        db.session.commit()
        click.echo(f"'{email}' is now an admin.")

    @app.cli.command("reset-users")
    @click.option("--yes", is_flag=True, help="Skip the confirmation prompt.")
    def reset_users(yes):
        """Delete all users and account-linked competition data."""
        if not yes:
            click.confirm(
                "Delete all users, teams, progress, submissions, and sessions?",
                abort=True,
            )

        account_data = (
            TeamRound2Execution,
            TeamRoundSubmission,
            TeamRound1Attempt,
            TeamQuestionAssignment,
            TeamRoundTimer,
            TeamMembership,
            Team,
            RoundSubmission,
            Round1Attempt,
            RoundTimer,
            GameProgress,
            TokenBlocklist,
            User,
        )
        deleted = {}
        for model in account_data:
            deleted[model.__tablename__] = model.query.delete(synchronize_session=False)

        db.session.commit()
        click.echo("Deleted account-linked data:")
        for table_name, count in deleted.items():
            click.echo(f"  {table_name}: {count}")

    # --- Production safety check ------------------------------------------
    insecure_defaults = {
        "dev-secret-change-me",
        "dev-jwt-secret-change-me",
        "change-this-secret-key",
        "change-this-jwt-secret-key",
    }
    if not app.config.get("TESTING") and not app.config["DEBUG"] and (
        app.config["SECRET_KEY"] in insecure_defaults
        or app.config["JWT_SECRET_KEY"] in insecure_defaults
        or len(app.config["SECRET_KEY"]) < 32
        or len(app.config["JWT_SECRET_KEY"]) < 32
    ):
        raise RuntimeError(
            "Set random SECRET_KEY and JWT_SECRET_KEY values of at least 32 "
            "characters before running with FLASK_DEBUG=False."
        )

    # --- Create tables on first run, then seed round configuration ---------
    with app.app_context():
        db.create_all()

        # Additive upgrades for installations created before Round 3 existed.
        # db.create_all() does not alter an existing SQLite table.
        existing_columns = {
            table: {column["name"] for column in inspect(db.engine).get_columns(table)}
            for table in ("round_config", "teams")
        }
        migrations = {
            "round_config": {
                "code_word": "VARCHAR(120) NOT NULL DEFAULT ''",
                "key_update": "TEXT NOT NULL DEFAULT ''",
            },
            "teams": {
                "round3_enabled": "BOOLEAN NOT NULL DEFAULT 0",
                "round3_qualified": "BOOLEAN NOT NULL DEFAULT 0",
            },
        }
        for table, columns in migrations.items():
            for column, definition in columns.items():
                if column not in existing_columns[table]:
                    db.session.execute(db.text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
        db.session.commit()

        defaults = {1: (True, 30), 2: (True, 60), 3: (False, 1)}
        existing_configs = {c.round_number: c for c in RoundConfig.query.all()}
        for round_number, (is_unlocked, duration_minutes) in defaults.items():
            if round_number not in existing_configs:
                db.session.add(
                    RoundConfig(
                        round_number=round_number,
                        is_unlocked=is_unlocked,
                        duration_minutes=duration_minutes,
                    )
                )
            else:
                cfg = existing_configs[round_number]
                if round_number == 1 and cfg.duration_minutes == 10:
                    cfg.duration_minutes = 30
                elif round_number == 2 and cfg.duration_minutes in (20, 15):
                    cfg.duration_minutes = 60
        db.session.commit()

        # Seed question pools only if empty, so admin edits are preserved.
        if QuestionR1.query.count() == 0:
            for item in ROUND1_POOL:
                db.session.add(
                    QuestionR1(
                        question=item["question"],
                        options=json.dumps(item["options"]),
                        correct_option_id=item["correct_option_id"],
                    )
                )

        if ProblemR2.query.count() == 0:
            for item in ROUND2_POOL:
                db.session.add(
                    ProblemR2(
                        title=item["title"],
                        prompt=item["prompt"],
                        input_spec=item["input_spec"],
                        output_spec=item["output_spec"],
                        constraints=json.dumps(item["constraints"]),
                        examples=json.dumps(item["examples"]),
                    )
                )

        db.session.commit()

        if ProblemR2TestCase.query.count() == 0:
            problems_by_title = {problem.title: problem for problem in ProblemR2.query.all()}
            for title, cases in ROUND2_HIDDEN_TESTS.items():
                problem = problems_by_title.get(title)
                if problem is None:
                    continue
                db.session.add_all(
                    ProblemR2TestCase(
                        problem_id=problem.id,
                        input_data=case["input"],
                        expected_output=case["output"],
                        is_hidden=True,
                        order_index=index,
                    )
                    for index, case in enumerate(cases)
                )

        db.session.commit()

    return app


app = create_app()

# Render Free does not provide a shell, so provision the organizer account
# automatically from private Render environment variables at startup.
from runtime_bootstrap import ensure_organizer_account
ensure_organizer_account(app)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=app.config["PORT"], debug=app.config["DEBUG"])
