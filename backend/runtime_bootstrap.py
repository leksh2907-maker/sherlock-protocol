import os


def ensure_organizer_account(app):
    """Create or promote the organizer account from runtime configuration."""
    if not os.getenv("RENDER_WEB_CONCURRENCY"):
        return

    username = os.getenv("ORGANIZER_USERNAME", "").strip()
    email = os.getenv("ORGANIZER_EMAIL", "").strip().lower()
    password = os.getenv("ORGANIZER_PASSWORD", "")
    if not username or not email or not password:
        return

    from extensions import db
    from models import User

    with app.app_context():
        user = User.query.filter(
            (User.username == username) | (User.email == email)
        ).first()
        if user is None:
            user = User(username=username, email=email)
            db.session.add(user)
        user.is_admin = True
        user.set_password(password)
        db.session.commit()
