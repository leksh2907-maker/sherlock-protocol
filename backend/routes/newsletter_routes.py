from flask import Blueprint, request, jsonify

from extensions import db
from models import NewsletterSubscriber
from utils.validators import is_valid_email, missing_fields

newsletter_bp = Blueprint("newsletter", __name__)


@newsletter_bp.route("/newsletter", methods=["POST"])
def subscribe_to_newsletter():
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "Request body must be valid JSON."}), 400

    missing = missing_fields(data, ["email"])
    if missing:
        return jsonify({"error": "Email is required."}), 400

    email = data["email"].strip().lower()

    if not is_valid_email(email):
        return jsonify({"error": "Please provide a valid email address."}), 400

    if NewsletterSubscriber.query.filter_by(email=email).first() is not None:
        return jsonify({"error": "This email is already subscribed."}), 409

    subscriber = NewsletterSubscriber(email=email)

    try:
        db.session.add(subscriber)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not subscribe. Please try again."}), 500

    return jsonify({"message": "Subscribed successfully."}), 201
