import re

EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def is_valid_email(email: str) -> bool:
    if not isinstance(email, str):
        return False
    return bool(EMAIL_PATTERN.match(email.strip()))


def is_valid_username(username: str) -> bool:
    if not isinstance(username, str):
        return False
    username = username.strip()
    return 3 <= len(username) <= 40 and re.match(r"^[A-Za-z0-9_ .\-]+$", username) is not None


def validate_password(password: str):
    """Returns (is_valid, error_message)."""
    if not isinstance(password, str):
        return False, "Password is required."
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not re.search(r"[A-Za-z]", password) or not re.search(r"[0-9]", password):
        return False, "Password must contain both letters and numbers."
    return True, None


def missing_fields(data: dict, required: list) -> list:
    """Returns a list of required field names that are missing or empty."""
    if not isinstance(data, dict):
        return list(required)
    missing = []
    for field in required:
        value = data.get(field)
        if value is None or (isinstance(value, str) and not value.strip()):
            missing.append(field)
    return missing
