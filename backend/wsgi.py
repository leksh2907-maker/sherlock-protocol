from app import app

from runtime_bootstrap import ensure_organizer_account

ensure_organizer_account(app)

# Gunicorn entry point for Render.
application = app
