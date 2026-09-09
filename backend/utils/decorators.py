from functools import wraps

from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt


def admin_required(fn):
    """Route decorator: requires a valid JWT whose claims mark the user as admin."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        claims = get_jwt()
        if not claims.get("is_admin", False):
            return jsonify({"error": "Admin privileges required."}), 403
        return fn(*args, **kwargs)

    return wrapper
