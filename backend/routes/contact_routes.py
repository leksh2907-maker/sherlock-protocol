from flask import Blueprint, request, jsonify

from extensions import db
from models import ContactMessage
from utils.validators import is_valid_email, missing_fields

contact_bp = Blueprint("contact", __name__)


@contact_bp.route("/contact", methods=["POST"])
def submit_contact_message():
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "Request body must be valid JSON."}), 400

    required = ["name", "email", "message"]
    missing = missing_fields(data, required)
    if missing:
        return jsonify({"error": f"Missing required field(s): {', '.join(missing)}"}), 400

    name = data["name"].strip()
    email = data["email"].strip().lower()
    message = data["message"].strip()

    if not is_valid_email(email):
        return jsonify({"error": "Please provide a valid email address."}), 400

    if len(name) > 120:
        return jsonify({"error": "Name is too long (120 characters max)."}), 400

    if len(message) < 5:
        return jsonify({"error": "Message is too short."}), 400

    if len(message) > 5000:
        return jsonify({"error": "Message is too long (5000 characters max)."}), 400

    entry = ContactMessage(name=name, email=email, message=message)

    try:
        db.session.add(entry)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not save your message. Please try again."}), 500

    return jsonify({"message": "Message received. Thanks for reaching out!"}), 201
