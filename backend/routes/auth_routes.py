from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token,
    jwt_required,
    get_jwt_identity,
    get_jwt,
)

from extensions import db
from models import User, TokenBlocklist
from utils.validators import (
    is_valid_email,
    is_valid_username,
    validate_password,
    missing_fields,
)

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/register", methods=["POST"])
def register():
    return jsonify({"error": "Public participant registration is disabled. Accounts are created by organizers."}), 403


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "Request body must be valid JSON."}), 400

    identifier = str(data.get("user_id") or data.get("username") or data.get("email") or "").strip()
    password = data.get("password")

    if not identifier or not password:
        return jsonify({"error": "User ID and password are required."}), 400

    user = User.query.filter(
        (User.username == identifier) | (User.email == identifier.lower())
    ).first()

    if user is None or not user.check_password(password):
        return jsonify({"error": "Invalid User ID or password."}), 401

    access_token = create_access_token(
        identity=str(user.id), additional_claims={"is_admin": user.is_admin}
    )

    return jsonify(
        {
            "message": "Login successful.",
            "user": user.to_dict(),
            "access_token": access_token,
        }
    ), 200


@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    jti = get_jwt()["jti"]

    try:
        db.session.add(TokenBlocklist(jti=jti))
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({"error": "Could not log out. Please try again."}), 500

    return jsonify({"message": "Logged out successfully."}), 200


@auth_bp.route("/profile", methods=["GET"])
@jwt_required()
def profile():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if user is None:
        return jsonify({"error": "User not found."}), 404

    return jsonify({"user": user.to_dict()}), 200
