from sqlalchemy import Column, String, Integer, Float, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
try:
    from .database import Base
except ImportError:
    from database import Base
from datetime import datetime, timezone

def _now_iso():
    return datetime.now(timezone.utc).isoformat()

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String)
    role = Column(String, nullable=False, index=True)
    can_edit_certificates = Column(Integer, default=0, nullable=False)
    can_delete_certificates = Column(Integer, default=0, nullable=False)
    password_hash = Column(String)
    created_at = Column(String, default=_now_iso, nullable=False)

    temporary_accesses = relationship("TemporaryAccess", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    history = relationship("History", back_populates="user")
    certificates = relationship("Certificate", back_populates="user")

class TemporaryAccess(Base):
    __tablename__ = "temporary_access"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    expires_at = Column(String, nullable=False)
    is_revoked = Column(Integer, default=0, nullable=False)
    created_by_admin_id = Column(String)
    created_at = Column(String, default=_now_iso, nullable=False)

    user = relationship("User", back_populates="temporary_accesses")
    sessions = relationship("Session", back_populates="temporary_access")

class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    temp_access_id = Column(String, ForeignKey("temporary_access.id", ondelete="SET NULL"), index=True)
    token = Column(String, unique=True, nullable=False, index=True)
    expires_at = Column(String, nullable=False)
    is_revoked = Column(Integer, default=0, nullable=False)
    geo_granted_until = Column(String)
    created_at = Column(String, default=_now_iso, nullable=False)

    user = relationship("User", back_populates="sessions")
    temporary_access = relationship("TemporaryAccess", back_populates="sessions")

class History(Base):
    __tablename__ = "history"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    user_email = Column(String, index=True) # Snapshot for audit trail if user is deleted
    action_type = Column(String, nullable=False, index=True)
    action_data = Column(Text)
    timestamp = Column(String, default=_now_iso, nullable=False, index=True)

    user = relationship("User", back_populates="history")

class Certificate(Base):
    __tablename__ = "certificates"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_info = Column(String) # Snapshot (e.g. 'admin@example.com') for audit if user is deleted
    category = Column(String, nullable=False, index=True)
    certificate_type = Column(String, nullable=False, index=True)
    entity_type = Column(String, nullable=False)
    payload_json = Column(Text, nullable=False)
    created_at = Column(String, default=_now_iso, nullable=False, index=True)
    updated_at = Column(String, default=_now_iso, nullable=False)

    user = relationship("User", back_populates="certificates")

class Client(Base):
    __tablename__ = "clients"

    id = Column(String, primary_key=True)
    entity_type = Column(String, nullable=False, index=True)
    display_name = Column(String, nullable=False, index=True)
    person_name = Column(String)
    company_name = Column(String)
    pan = Column(String, index=True)
    cin = Column(String, index=True)
    gstin = Column(String, index=True)
    address = Column(Text)
    created_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    updated_by = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    is_deleted = Column(Integer, default=0, nullable=False, index=True)
    created_at = Column(String, default=_now_iso, nullable=False, index=True)
    updated_at = Column(String, default=_now_iso, nullable=False)

class OfficeLocation(Base):
    __tablename__ = "office_locations"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    ips = Column(String)
    lat = Column(Float)
    lng = Column(Float)
    radius_m = Column(Float)
    created_at = Column(String, default=_now_iso, nullable=False)
    updated_at = Column(String, default=_now_iso, nullable=False)
