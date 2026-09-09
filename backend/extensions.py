"""
Shared Flask extension instances.

Kept in their own module (instead of being created inside app.py) so that
models.py and the route blueprints can import `db` without causing circular
imports with app.py.
"""

from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS

db = SQLAlchemy()
jwt = JWTManager()
cors = CORS()
