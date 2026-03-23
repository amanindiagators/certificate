from fastapi import FastAPI, APIRouter, HTTPException, Query, Body, Request, File, UploadFile
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from dotenv import load_dotenv
import os, json, logging
import ipaddress, openlocationcode
import math
import asyncio
from collections import defaultdict, deque
from contextlib import contextmanager
from pathlib import Path
from datetime import datetime, timezone, timedelta
from threading import Lock
from time import perf_counter
import base64
import hashlib
import hmac
import secrets
from uuid import uuid4
from typing import Any, Dict, List, Optional, Literal, Callable, Union, Tuple
from pydantic import BaseModel, Field, ConfigDict
from fastapi.responses import Response
from fastapi import BackgroundTasks
from sqlalchemy.orm import Session as DBSession
from database import engine, SessionLocal, get_db
from models import User, Certificate, History, Session as SessionModel, TemporaryAccess, OfficeLocation
from sqlalchemy import text, inspect
from models import User, Certificate, History, Session as SessionModel, TemporaryAccess, OfficeLocation
from sqlalchemy import text, inspect
from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from io import BytesIO

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# -----------------------------
# Env + storage
# -----------------------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env", override=False)

PURPOSE_TEXT_FV = {
    "allotment": (
        "allotment of shares under Section 56(2)(x) of the Income Tax Act, 1961 read with "
        "Rule 11UA of the Income Tax Rules, 1962, and as required under applicable provisions "
        "of the Companies Act, 2013"
    ),
    "buyback": (
        "buy-back of shares under Section 68 of the Companies Act, 2013 and the Companies "
        "(Share Capital and Debentures) Rules, 2014"
    ),
    "merger": (
        "Merger / De-merger under Sections 230-232 of the Companies Act, 2013 and as may be "
        "required by the National Company Law Tribunal (NCLT)"
    ),
    "rtor": (
        "transfer of shares from a Resident to a Non-Resident under the Foreign Exchange "
        "Management Act, 1999 (FEMA) and the Foreign Exchange Management (Non-Debt Instruments) "
        "Rules, 2019, as per the pricing guidelines of the Reserve Bank of India"
    ),
    "form3ceb": (
        "reporting of international transactions at Arm's Length Price under Section 92 of the "
        "Income Tax Act, 1961, as required to be certified in Form 3CEB"
    ),
}

def generate_lod_docx(data: dict) -> bytes:
    doc = Document()
    section = doc.sections[0]
    section.top_margin = Inches(1.0)
    section.bottom_margin = Inches(1.0)
    section.left_margin = Inches(1.0)
    section.right_margin = Inches(1.0)

    def add_para(text="", bold=False, size=11, align=WD_ALIGN_PARAGRAPH.LEFT,
                 underline=False, space_before=0, space_after=6):
        p = doc.add_paragraph()
        p.alignment = align
        p.paragraph_format.space_before = Pt(space_before)
        p.paragraph_format.space_after  = Pt(space_after)
        if text:
            run = p.add_run(text)
            run.bold      = bold
            run.underline = underline
            run.font.size = Pt(size)
        return p

    # --- Header ---
    add_para("TO WHOM SO EVER IT MAY CONCERN", bold=True, underline=True,
             align=WD_ALIGN_PARAGRAPH.CENTER, size=12, space_before=18, space_after=18)

    # Para 1
    company_name = data.get("company_name", "")
    cin = data.get("cin", "")
    address = data.get("registered_address", "")
    
    p1 = doc.add_paragraph()
    p1.paragraph_format.space_after = Pt(12)
    p1.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    r = p1.add_run("This is to certify that the company M/s ")
    r.font.size = Pt(11)
    r_name = p1.add_run(company_name)
    r_name.font.size = Pt(11)
    r_name.bold = True
    r2 = p1.add_run(" (CIN-")
    r2.font.size = Pt(11)
    r_cin = p1.add_run(cin)
    r_cin.font.size = Pt(11)
    r_cin.bold = True
    r3 = p1.add_run(f"), registered at {address}.")
    r3.font.size = Pt(11)

    # Para 2
    as_on_date = data.get("as_on_date", "")
    p2 = doc.add_paragraph()
    p2.paragraph_format.space_after = Pt(12)
    p2.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    r_p2a = p2.add_run("As per the records and information available on the website of the Ministry of Corporate Affairs (MCA) and based on the Annual Filing status of the Company, the ")
    r_p2a.font.size = Pt(11)
    r_p2b = p2.add_run("List of Director")
    r_p2b.bold = True
    r_p2b.font.size = Pt(11)
    r_p2c = p2.add_run(" of the Company as on ")
    r_p2c.font.size = Pt(11)
    r_p2d = p2.add_run(as_on_date)
    r_p2d.bold = True
    r_p2d.font.size = Pt(11)
    r_p2e = p2.add_run(" is as under:")
    r_p2e.font.size = Pt(11)

    # Table
    directors = data.get("directors", [])
    if directors:
        table = doc.add_table(rows=1, cols=5)
        table.style = 'Table Grid'
        table.autofit = False
        widths = (Inches(0.6), Inches(2.2), Inches(1.2), Inches(1.5), Inches(1.0))
        for i, width in enumerate(widths):
            table.columns[i].width = width
        
        hdr_cells = table.rows[0].cells
        headers = ["Sr.\nNo", "Name of Directors", "DIN", "Designation", "Date of\nAppointment"]
        for i, h in enumerate(headers):
            p = hdr_cells[i].paragraphs[0]
            p.text = h
            p.runs[0].bold = True
            p.runs[0].font.size = Pt(11)
        
        for d in directors:
            row = table.add_row().cells
            row[0].text = str(d.get("sr_no", ""))
            row[1].text = d.get("name", "")
            row[2].text = d.get("din", "")
            row[3].text = d.get("designation", "")
            row[4].text = d.get("date_of_appointment", "")
            
        doc.add_paragraph() # spacing

    # Para 3
    add_para("This certificate is issued on the basis of the records and documents produced before us and information available on the MCA portal.", size=11, space_after=12)

    # Para 4
    add_para("This certificate is issued at the specific request of the Company for submission to the Bank loan purpose only and shall not be used for any other purpose without our prior written consent.", size=11, space_after=36)

    # Footer
    add_para(f"For {data.get('caFirm', '')}", bold=True, size=11, space_after=2)
    add_para("(Chartered Accountants)", bold=True, size=11, space_after=2)
    add_para(f"F. R. No. {data.get('frn', '')}", bold=True, size=11, space_after=64)
    add_para(f"(CA {data.get('caName', '')})", bold=True, size=11, space_after=2)
    add_para("(Partner)", bold=True, size=11, space_after=2)
    add_para(f"Membership No: {data.get('membershipNo', '')}", bold=True, size=11, space_after=2)
    add_para(f"UDIN: {data.get('udin', '')}", bold=True, size=11, space_after=0)

    buf = BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.read()


ENVIRONMENT = (os.getenv("ENVIRONMENT") or "development").strip().lower()
IS_PRODUCTION = ENVIRONMENT in {"prod", "production"}

DATA_DIR = Path(os.getenv("STORAGE_DIR", str(ROOT_DIR / "data")))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Office access control managed via environment and database
BACKEND_DIR = Path(__file__).parent

WEAK_DEFAULT_ADMIN_PASSWORDS = {
    "admin",
    "admin123",
    "admin@123",
    "password",
    "password123",
    "123456",
}

EntityType = Literal[
    "PERSONAL",
    "PROPRIETORSHIP",
    "PRIVATE_LIMITED",
    "PUBLIC_LIMITED",
    "TRUST",
    "NGO",
    "SOCIETY",
    "GOVERNMENT",
    "COLLEGE",
]

CertCategory = Literal[
    "NET_WORTH",
    "TURNOVER",
    "UTILISATION",
    "RERA",
    "NBFC",
    "GST",
    "LIST_OF_DIRECTORS",
]

def _now() -> datetime:
    return datetime.now(timezone.utc)

def _env_int(name: str, default: int, minimum: int = 1) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
        if value < minimum:
            return default
        return value
    except ValueError:
        return default

def _env_bool(name: str, default: bool = False) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}

def _parse_cors_origins() -> List[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if not raw:
        if IS_PRODUCTION:
            raise RuntimeError("CORS_ORIGINS is required in production.")
        return ["http://localhost:3000", "http://127.0.0.1:3000"]

    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    if not origins:
        if IS_PRODUCTION:
            raise RuntimeError("CORS_ORIGINS is required in production.")
        return ["http://localhost:3000", "http://127.0.0.1:3000"]
    return origins

def _parse_allowed_hosts() -> List[str]:
    raw = os.getenv("ALLOWED_HOSTS", "").strip()
    if not raw:
        if IS_PRODUCTION:
            raise RuntimeError("ALLOWED_HOSTS is required in production.")
        return ["localhost", "127.0.0.1", "[::1]"]
    hosts = [host.strip() for host in raw.split(",") if host.strip()]
    if not hosts:
        if IS_PRODUCTION:
            raise RuntimeError("ALLOWED_HOSTS is required in production.")
        return ["localhost", "127.0.0.1", "[::1]"]
    return hosts

def _validate_password_strength(password: str) -> Optional[str]:
    if len(password) < 12:
        return "Password must be at least 12 characters."
    if not any(ch.isupper() for ch in password):
        return "Password must contain at least one uppercase letter."
    if not any(ch.islower() for ch in password):
        return "Password must contain at least one lowercase letter."
    if not any(ch.isdigit() for ch in password):
        return "Password must contain at least one number."
    if not any(not ch.isalnum() for ch in password):
        return "Password must contain at least one special character."
    return None

LOGIN_RATE_LIMIT_ATTEMPTS = _env_int("LOGIN_RATE_LIMIT_ATTEMPTS", 5, 1)
LOGIN_RATE_LIMIT_WINDOW_SEC = _env_int("LOGIN_RATE_LIMIT_WINDOW_SEC", 300, 1)
LOGIN_RATE_LIMIT_LOCKOUT_SEC = _env_int("LOGIN_RATE_LIMIT_LOCKOUT_SEC", 900, 1)
FORCE_HTTPS = _env_bool("FORCE_HTTPS", IS_PRODUCTION)
ENABLE_API_DOCS = _env_bool("ENABLE_API_DOCS", not IS_PRODUCTION)
_login_attempts: Dict[str, deque] = defaultdict(deque)
_login_lockouts: Dict[str, datetime] = {}
_login_rate_limit_lock = Lock()
CORS_ALLOW_ORIGINS = _parse_cors_origins()
TRUSTED_ALLOWED_HOSTS = _parse_allowed_hosts()

# ------------------------------------------------------------------
# In-memory caches to reduce Neon round-trips
# ------------------------------------------------------------------
# Session token cache: token -> (user_dict, session_dict, cached_at)
_SESSION_CACHE_TTL_SEC = 60
_session_cache: Dict[str, Tuple[Dict[str, Any], Dict[str, Any], datetime]] = {}
_session_cache_lock = Lock()

# Office location cache: (locations_list, cached_at)
_OFFICE_CACHE_TTL_SEC = 60
_office_cache: Optional[Tuple[List[Dict[str, Any]], datetime]] = None
_office_cache_lock = Lock()

def _get_cached_session(token: str) -> Optional[Tuple[Dict[str, Any], Dict[str, Any]]]:
    \"\"\"Return (user, session) from cache if still valid.\"\"\"
    with _session_cache_lock:
        entry = _session_cache.get(token)
        if not entry:
            return None
        user, session, cached_at = entry
        if (_now() - cached_at).total_seconds() > _SESSION_CACHE_TTL_SEC:
            _session_cache.pop(token, None)
            return None
        return user, session

def _put_cached_session(token: str, user: Dict[str, Any], session: Dict[str, Any]) -> None:
    with _session_cache_lock:
        if len(_session_cache) > 500:
            oldest = sorted(_session_cache.items(), key=lambda x: x[1][2])[:100]
            for k, _ in oldest:
                _session_cache.pop(k, None)
        _session_cache[token] = (user, session, _now())

def _invalidate_cached_session(token: str) -> None:
    with _session_cache_lock:
        _session_cache.pop(token, None)

def _invalidate_cached_sessions_for_user(user_id: str) -> None:
    with _session_cache_lock:
        to_remove = [k for k, v in _session_cache.items() if v[1].get("user_id") == user_id]
        for k in to_remove:
            _session_cache.pop(k, None)

def _get_office_locations_cached() -> List[Dict[str, Any]]:
    \"\"\"Return office locations from in-memory cache (max 60s stale).\"\"\"
    global _office_cache
    with _office_cache_lock:
        if _office_cache is not None:
            locations, cached_at = _office_cache
            if (_now() - cached_at).total_seconds() <= _OFFICE_CACHE_TTL_SEC:
                return locations
        locations = _get_office_locations()
        _office_cache = (locations, _now())
        return locations

def _invalidate_office_cache() -> None:
    global _office_cache
    with _office_cache_lock:
        _office_cache = None


def _get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    with _db() as db:
        user = db.query(User).filter(User.email == email).first()
        return _to_dict(user) if user else None

def _get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    with _db() as db:
        user = db.query(User).filter(User.id == user_id).first()
        return _to_dict(user) if user else None

def _to_dict(model_instance) -> Dict[str, Any]:
    """Helper to convert SA model to dict for compatibility with existing code"""
    if not model_instance:
        return {}
    d = {}
    for column in model_instance.__table__.columns:
        d[column.name] = getattr(model_instance, column.name)
    return d

def _create_user_if_missing(
    email: str,
    role: str,
    can_manage_certificates: bool = False,
) -> Dict[str, Any]:
    existing = _get_user_by_email(email)
    if existing:
        return existing
    
    user_obj = User(
        id=str(uuid4()),
        email=email,
        full_name=None,
        role=role,
        can_edit_certificates=1 if can_manage_certificates else 0,
        can_delete_certificates=1 if can_manage_certificates else 0,
        password_hash=None,
        created_at=_now().isoformat()
    )
    with _db() as db:
        db.add(user_obj)
        db.commit()
        return _to_dict(user_obj)
    return {}  # unreachable but satisfies type checker

def _update_user_full_name(user_id: str, full_name: str) -> None:
    with _db() as db:
        db.query(User).filter(User.id == user_id).update({"full_name": full_name})

def _update_user_certificate_permissions(user_id: str, can_manage: bool) -> None:
    with _db() as db:
        db.query(User).filter(User.id == user_id).update({
            "can_edit_certificates": 1 if can_manage else 0,
            "can_delete_certificates": 1 if can_manage else 0
        })

def _can_user_manage_certificates(user: Dict[str, Any]) -> bool:
    if (user.get("role") or "").lower() == "admin":
        return True
    return bool(
        int(user.get("can_edit_certificates") or 0)
        or int(user.get("can_delete_certificates") or 0)
    )

def _find_temp_access_for_login(user_id: str, password: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    with _db() as db:
        access_list = db.query(TemporaryAccess).filter(TemporaryAccess.user_id == user_id).order_by(TemporaryAccess.created_at.desc()).all()
        if not access_list:
            return None, "no_access"
        for access in access_list:
            if _verify_password(password, access.password_hash):
                if access.is_revoked:
                    return None, "revoked"
                if _is_expired(access.expires_at):
                    return None, "expired"
                return _to_dict(access), None
    return None, "invalid"

def _create_temp_access(user_id: str, password_hash: str, expires_at: str, admin_id: str) -> Dict[str, Any]:
    access = TemporaryAccess(
        id=str(uuid4()),
        user_id=user_id,
        password_hash=password_hash,
        expires_at=expires_at,
        is_revoked=0,
        created_by_admin_id=admin_id,
        created_at=_now().isoformat()
    )
    with _db() as db:
        db.add(access)
        db.commit()
        return _to_dict(access)
    return {}  # unreachable

def _create_session(user_id: str, temp_access_id: Optional[str], expires_at: datetime) -> Dict[str, Any]:
    sess_obj = SessionModel(
        id=str(uuid4()),
        user_id=user_id,
        temp_access_id=temp_access_id,
        token=_new_token(),
        expires_at=expires_at.isoformat(),
        is_revoked=0,
        geo_granted_until=None,
        created_at=_now().isoformat()
    )
    with _db() as db:
        db.add(sess_obj)
        db.commit()
        return _to_dict(sess_obj)
    return {}  # unreachable

def _get_session_by_token(token: str) -> Optional[Dict[str, Any]]:
    with _db() as db:
        sess = db.query(SessionModel).filter(SessionModel.token == token).first()
        return _to_dict(sess) if sess else None

def _get_temp_access_by_id(access_id: str) -> Optional[Dict[str, Any]]:
    with _db() as db:
        access = db.query(TemporaryAccess).filter(TemporaryAccess.id == access_id).first()
        return _to_dict(access) if access else None

def _revoke_sessions_for_user(user_id: str) -> None:
    _invalidate_cached_sessions_for_user(user_id)
    with _db() as db:
        db.query(SessionModel).filter(SessionModel.user_id == user_id).update({"is_revoked": 1})

def _revoke_sessions_for_access(access_id: str) -> None:
    with _db() as db:
        db.query(SessionModel).filter(SessionModel.temp_access_id == access_id).update({"is_revoked": 1})

def _prune_expired_sessions() -> None:
    with _db() as db:
        db.query(SessionModel).filter(SessionModel.expires_at <= _now().isoformat()).delete()

def _get_client_ip(request: Request) -> Optional[str]:
    # Prefer proxy headers commonly set on shared hosting/reverse proxies
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip
    if request.client:
        return request.client.host
    return None

def _login_rate_limit_key(email: str, request: Request) -> str:
    ip = _get_client_ip(request) or "unknown"
    return f"{email}|{ip}"

def _trim_login_attempts(attempts: deque, now: datetime) -> None:
    window_start = now - timedelta(seconds=LOGIN_RATE_LIMIT_WINDOW_SEC)
    while attempts and attempts[0] < window_start:
        attempts.popleft()

def _enforce_login_rate_limit(key: str) -> None:
    now = _now()
    with _login_rate_limit_lock:
        lock_until = _login_lockouts.get(key)
        if lock_until and lock_until > now:
            retry_after = max(1, int((lock_until - now).total_seconds()))
            raise HTTPException(
                status_code=429,
                detail=f"Too many login attempts. Try again in {retry_after} seconds.",
            )
        if lock_until and lock_until <= now:
            _login_lockouts.pop(key, None)

        attempts = _login_attempts.get(key, deque())
        _login_attempts[key] = attempts # Ensure deque exists for key
        _trim_login_attempts(attempts, now)
        if len(attempts) >= LOGIN_RATE_LIMIT_ATTEMPTS:
            lock_until = now + timedelta(seconds=LOGIN_RATE_LIMIT_LOCKOUT_SEC)
            _login_lockouts[key] = lock_until
            attempts.clear()
            raise HTTPException(
                status_code=429,
                detail="Too many login attempts. Please try again later.",
            )

def _record_failed_login(key: str) -> None:
    now = _now()
    with _login_rate_limit_lock:
        attempts = _login_attempts.get(key, deque())
        _login_attempts[key] = attempts # Ensure deque exists for key
        _trim_login_attempts(attempts, now)
        attempts.append(now)
        if len(attempts) >= LOGIN_RATE_LIMIT_ATTEMPTS:
            _login_lockouts[key] = now + timedelta(seconds=LOGIN_RATE_LIMIT_LOCKOUT_SEC)
            attempts.clear()

def _clear_login_rate_limit(key: str) -> None:
    with _login_rate_limit_lock:
        _login_attempts.pop(key, None)
        _login_lockouts.pop(key, None)

def _parse_ip_list(values: Optional[List[str]]) -> List[ipaddress._BaseNetwork]:
    if not values:
        return []
    networks: List[ipaddress._BaseNetwork] = []
    for item in values:
        if not item:
            continue
        try:
            networks.append(ipaddress.ip_network(item.strip(), strict=False))
        except ValueError:
            continue
    return networks

def _parse_ips_from_csv(value: Optional[str]) -> List[str]:
    if not value:
        return []
    return [v.strip() for v in value.split(",") if v.strip()]

def _extract_plus_code(value: Optional[str]) -> str:
    """
    Accept values like:
    - 'J47V+HC Patna, Bihar'
    - '7J4VJ47V+HC'
    and return the code token.
    """
    raw = " ".join(str(value or "").strip().upper().split())
    if not raw:
        return ""
    token = raw.split(" ", 1)[0]
    return token.strip(",;")

def _parse_lat_lng_pair(lat_raw: Optional[Any], lng_raw: Optional[Any]) -> Optional[Tuple[float, float]]:
    if not lat_raw or not lng_raw:
        return None
    try:
        return float(str(lat_raw)), float(str(lng_raw))
    except (ValueError, TypeError):
        return None

def _default_plus_code_reference() -> Optional[Tuple[float, float]]:
    # First fallback: configured env office coordinates (if present)
    env_pair = _parse_lat_lng_pair(os.getenv("OFFICE_LAT"), os.getenv("OFFICE_LNG"))
    if env_pair:
        return env_pair

    # Second fallback: first saved office with geo
    for _, lat, lng, _ in _get_office_geos():
        return lat, lng

def _decode_plus_code_to_lat_lng(
    plus_code_input: str,
    ref_lat: Optional[float] = None,
    ref_lng: Optional[float] = None,
) -> Tuple[float, float]:
    try:
        from openlocationcode import openlocationcode as olc
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Plus Code decoding is unavailable. Install dependency: openlocationcode.",
        )

    code = _extract_plus_code(plus_code_input)
    if not code or "+" not in code:
        raise HTTPException(status_code=400, detail="Invalid Plus Code format.")

    if olc.isFull(code):
        full_code = code
    elif olc.isShort(code):
        if ref_lat is None or ref_lng is None:
            ref = _default_plus_code_reference()
            if not ref:
                raise HTTPException(
                    status_code=400,
                    detail="Short Plus Code needs a nearby reference. Provide lat/lng once or set OFFICE_LAT/OFFICE_LNG.",
                )
            ref_lat, ref_lng = ref
        if ref_lat is not None and ref_lng is not None:
            full_code = olc.recoverNearest(code, float(ref_lat), float(ref_lng))
        else:
            # Fallback path if somehow None reached here
            full_code = code
    else:
        raise HTTPException(status_code=400, detail="Invalid Plus Code.")

    area = olc.decode(full_code)
    lat = (area.latitudeLo + area.latitudeHi) / 2.0
    lng = (area.longitudeLo + area.longitudeHi) / 2.0
    return lat, lng

def _get_office_locations() -> List[Dict[str, Any]]:
    with _db() as db:
        offices = db.query(OfficeLocation).order_by(OfficeLocation.created_at.asc()).all()
        items = [_to_dict(o) for o in offices]
    for item in items:
        item["ips"] = _parse_ips_from_csv(item.get("ips"))
    return items

def _get_office_networks() -> List[ipaddress._BaseNetwork]:
    locations = _get_office_locations_cached()
    if locations:
        ips = []
        for loc in locations:
            ips.extend(loc.get("ips") or [])
        return _parse_ip_list(ips)

    # Fallback to env if no DB locations exist
    raw = (os.getenv("OFFICE_IPS") or "").strip()
    return _parse_ip_list(_parse_ips_from_csv(raw))

def _is_office_ip(ip_value: Optional[str]) -> bool:
    if not ip_value:
        return False
    try:
        ip = ipaddress.ip_address(ip_value)
    except ValueError:
        return False
    for net in _get_office_networks():
        if ip in net:
            return True
    return False

def _get_office_geos() -> List[Tuple[str, float, float, float]]:
    locations = _get_office_locations_cached()
    geos: List[Tuple[str, float, float, float]] = []
    for loc in locations:
        if loc.get("lat") is None or loc.get("lng") is None:
            continue
        radius = loc.get("radius_m")
        if radius is None:
            continue
        geos.append((loc.get("name") or "Office", float(loc.get("lat") or 0), float(loc.get("lng") or 0), float(radius)))
    if geos:
        return geos

    lat_raw = os.getenv("OFFICE_LAT")
    lng_raw = os.getenv("OFFICE_LNG")
    radius_raw = os.getenv("OFFICE_RADIUS_M", "300")
    if not lat_raw or not lng_raw:
        return []
    try:
        lat = float(str(lat_raw))
        lng = float(str(lng_raw))
        radius = float(str(radius_raw))
    except (ValueError, TypeError):
        return []
    return [("Office", lat, lng, radius)]

def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    # Great-circle distance between two points in meters
    r = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def _is_within_office_geo(lat: float, lng: float) -> Tuple[bool, Optional[float], Optional[str]]:
    offices = _get_office_geos()
    if not offices:
        return (False, None, None)
    closest_distance: float = float('inf')
    closest_name: Optional[str] = None
    for name, office_lat, office_lng, radius in offices:
        distance = _haversine_meters(lat, lng, office_lat, office_lng)
        if distance <= radius:
            return (True, distance, name)
        if distance < closest_distance:
            closest_distance = distance
            closest_name = name
    return (False, None if math.isinf(closest_distance) else closest_distance, closest_name)

def _is_staff_role(role: Optional[str]) -> bool:
    return (role or "").lower() in ("temporary", "staff", "temp")

def _session_geo_granted(session: Dict[str, Any]) -> bool:
    value = session.get("geo_granted_until")
    if not value:
        return False
    return not _is_expired(value)

def _grant_geo_for_session(session_id: str) -> Dict[str, Any]:
    minutes = int(os.getenv("GEO_GRANT_MINUTES", "30"))
    expires_at = _now() + timedelta(minutes=minutes)
    with _db() as db:
        db.query(SessionModel).filter(SessionModel.id == session_id).update({
            "geo_granted_until": expires_at.isoformat()
        })
    return {"geo_granted_until": expires_at.isoformat(), "minutes": minutes}

async def _auth_from_request(request: Request) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return (None, None)
    token = auth.split(" ", 1)[1].strip()
    if not token:
        return (None, None)

    # --- Fast path: check in-memory cache first (avoids 3 DB round-trips) ---
    cached = _get_cached_session(token)
    if cached is not None:
        cached_user, cached_session = cached
        if not cached_session.get("is_revoked") and not _is_expired(cached_session.get("expires_at")):
            return (cached_user, cached_session)
        _invalidate_cached_session(token)

    # --- Slow path: DB lookup ---
    session = _get_session_by_token(token)
    if not session:
        return (None, None)
    if session.get("is_revoked") or _is_expired(session.get("expires_at")):
        return (None, None)

    user_id = session.get("user_id")
    if not user_id or not isinstance(user_id, str):
        return (None, None)

    user = _get_user_by_id(user_id)
    if not user:
        return (None, None)

    temp_access_id = session.get("temp_access_id")
    if temp_access_id:
        access = _get_temp_access_by_id(temp_access_id)
        if not access or access.get("is_revoked") or _is_expired(access.get("expires_at")):
            return (None, None)

    # Store in cache for subsequent requests
    _put_cached_session(token, user, session)
    return (user, session)

async def require_user_raw(request: Request) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    user, session = await _auth_from_request(request)
    if user is not None and session is not None:
        return user, session
    raise HTTPException(status_code=401, detail="Unauthorized or expired credentials.")

async def require_user(request: Request) -> Dict[str, Any]:
    user, session = await require_user_raw(request)
    # Admin bypasses all access checks
    if user.get("role") == "admin":
        return user

    if _is_staff_role(user.get("role")):
        client_ip = _get_client_ip(request)
        if _is_office_ip(client_ip) or _session_geo_granted(session):
            return user
        raise HTTPException(
            status_code=403,
            detail="Access denied. You must be on office Wi-Fi or within the allowed geo-radius.",
        )

    # Unknown roles default to denied
    raise HTTPException(status_code=403, detail="Access denied for this role.")

async def require_admin(request: Request) -> Dict[str, Any]:
    user = await require_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user

# -----------------------------
# App + Router
# -----------------------------
app = FastAPI(
    docs_url="/docs" if ENABLE_API_DOCS else None,
    redoc_url="/redoc" if ENABLE_API_DOCS else None,
    openapi_url="/openapi.json" if ENABLE_API_DOCS else None,
    redirect_slashes=False,
)
api_router = APIRouter(prefix="/api")

@app.on_event("startup")
async def startup_event():
    _init_db()
    await _ensure_admin_user()
    # Warmup caches and prune sessions in background, not blocking startup
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _get_office_locations_cached)
    loop.run_in_executor(None, _prune_expired_sessions)
    # Warmup caches and prune sessions in background, not blocking startup
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _get_office_locations_cached)
    loop.run_in_executor(None, _prune_expired_sessions)

@app.middleware("http")
async def auth_expiry_middleware(request: Request, call_next):
    request_id = getattr(request.state, "request_id", None) or request.headers.get("x-request-id") or str(uuid4())
    request.state.request_id = request_id
    auth = request.headers.get("authorization", "")
    try:
        if auth.lower().startswith("bearer "):
            user, session = await _auth_from_request(request)
            if not user or not session:
                return Response(
                    content=json.dumps({"detail": "Unauthorized or expired credentials."}),
                    status_code=401,
                    media_type="application/json",
                )
            if user is not None and session is not None:
                request.state.user_id = user.get("id")
                request.state.session_id = session.get("id")
        return await call_next(request)
    except Exception:
        logger.exception(
            "Unhandled exception in auth middleware: method=%s path=%s req_id=%s",
            request.method,
            request.url.path,
            request_id,
        )
        return Response(
            content=json.dumps({"detail": "Internal server error.", "request_id": request_id}),
            status_code=500,
            media_type="application/json",
        )

@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    request_id = getattr(request.state, "request_id", None) or request.headers.get("x-request-id") or str(uuid4())
    request.state.request_id = request_id
    started = perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception(
            "Unhandled exception while processing request: method=%s path=%s req_id=%s",
            request.method,
            request.url.path,
            request_id,
        )
        response = Response(
            content=json.dumps({"detail": "Internal server error.", "request_id": request_id}),
            status_code=500,
            media_type="application/json",
        )

    duration_ms = (perf_counter() - started) * 1000.0
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(self)"
    response.headers["Cross-Origin-Resource-Policy"] = "same-site"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cache-Control"] = "no-store"
    if IS_PRODUCTION:
        forwarded_proto = (request.headers.get("x-forwarded-proto") or "").lower()
        is_https = request.url.scheme == "https" or forwarded_proto == "https"
        if is_https:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time-Ms"] = f"{duration_ms:.2f}"
    logger.info(
        "request method=%s path=%s status=%s duration_ms=%.2f req_id=%s",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        request_id,
    )
    return response

@api_router.get("/")
async def root():
    return {"message": "Universal Certificate API"}

@api_router.get("/health")
async def health_check():
    health = {"status": "healthy", "timestamp": _now().isoformat()}
    try:
        with _db() as db:
            db.execute(text("SELECT 1"))
        health["database"] = "connected"
    except Exception as e:
        health["status"] = "unhealthy"
        health["database"] = f"error: {str(e)}"
    
    if health["status"] == "unhealthy":
        raise HTTPException(status_code=503, detail=health)
    return health



@api_router.get("/certificates/generate-docx/{cert_id}")
async def generate_cert_docx(cert_id: str, request: Request):
    user = await require_user(request)
    with _db() as db:
        cert_row = db.query(Certificate).filter(Certificate.id == cert_id).first()
        if not cert_row:
            raise HTTPException(status_code=404, detail="Certificate not found")
        
        if user.get("role") != "admin" and cert_row.user_id != user["id"]:
            raise HTTPException(status_code=403, detail="Forbidden")
        
        cert_data = _safe_json_loads(
            cert_row.payload_json,
            {},
            f"certificate:{cert_row.id}",
        )
        if not cert_data:
            raise HTTPException(status_code=500, detail="Stored certificate payload is invalid JSON.")
        category = cert_data.get("category")
        
        if category in ("FAIR_VALUE_SHARES", "LIST_OF_DIRECTORS"):
            # Flatten data for generator
            gen_data = {
                **cert_data.get("identity", {}),
                **cert_data.get("meta", {}),
                **cert_data.get("ca", {}),
                **cert_data.get("data", {}).get("extras", {}),
                "directors": cert_data.get("data", {}).get("extras", {}).get("directors", []),
                "certificate_date": cert_data.get("meta", {}).get("date"),
                "certificate_place": cert_data.get("meta", {}).get("place"),
                "firm_name": cert_data.get("ca", {}).get("firm"),
                "firm_frn": cert_data.get("ca", {}).get("frn"),
                "ca_name": cert_data.get("ca", {}).get("name"),
                "ca_membership_no": cert_data.get("ca", {}).get("membership_no"),
            }
            docx_bytes = generate_lod_docx(gen_data)
            
            filename = f"LOD_Certificate_{cert_id}.docx"
            return Response(
                content=docx_bytes,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
        else:
            raise HTTPException(status_code=400, detail="DOCX generation not implemented for this category yet.")

@api_router.get("/ca-settings")
async def get_ca_settings(request: Request):
    await require_user(request)
    return {
        "place": os.getenv("CA_PLACE", ""),
        "firm_name": os.getenv("CA_FIRM_NAME", ""),
        "frn": os.getenv("CA_FRN", ""),
        "ca_name": os.getenv("CA_NAME", ""),
        "membership_no": os.getenv("CA_MEMBERSHIP_NO", ""),
        "udin": os.getenv("CA_UDIN", ""),
        "cas": [],
        "default_ca_id": "",
    }

# -----------------------------
# Auth endpoints
# -----------------------------
@api_router.post("/auth/login", response_model=AuthLoginResponse)
@api_router.post("/auth/login/", response_model=AuthLoginResponse)
async def auth_login(payload: AuthLoginRequest, request: Request):
    email = (payload.email or payload.username or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required.")

    rate_limit_key = _login_rate_limit_key(email, request)
    _enforce_login_rate_limit(rate_limit_key)

    try:
        user = _get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        if user.get("role") == "admin":
            loop = asyncio.get_event_loop()
            if not await loop.run_in_executor(None, _verify_password, payload.password, user.get("password_hash") or ""):
                raise HTTPException(status_code=401, detail="Invalid email or password.")

            token_hours = int(os.getenv("TOKEN_TTL_HOURS", "12"))
            token_expires = _now() + timedelta(hours=token_hours)
            session = _create_session(user["id"], None, token_expires)
            _clear_login_rate_limit(rate_limit_key)
            _log_history(user["id"], "LOGIN", {"email": email, "role": "admin"})
            resp_dict = {"token": str(session.get("token") or ""), "user": _sanitize_user(user)}
            return AuthLoginResponse.model_validate(resp_dict)

        # Temporary user login: must match an active temp access entry
        loop = asyncio.get_event_loop()
        access, reason = await loop.run_in_executor(None, _find_temp_access_for_login, user["id"], payload.password)
        if not access:
            if reason == "revoked":
                raise HTTPException(status_code=401, detail="Credentials have been revoked.")
            if reason == "expired":
                raise HTTPException(status_code=401, detail="Credentials have expired.")
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        # If full name is still missing but provided during login, store it (optional)
        full_name_provided = payload.full_name
        if not user.get("full_name") and full_name_provided and not _is_blank(full_name_provided):
            _update_user_full_name(user["id"], full_name_provided.strip())
            refreshed = _get_user_by_id(user["id"])
            if refreshed:
                user = refreshed

        token_hours = int(os.getenv("TOKEN_TTL_HOURS", "12"))
        token_expires = _now() + timedelta(hours=token_hours)
        access_expires = _parse_dt(access.get("expires_at"))
        if access_expires and access_expires < token_expires:
            token_expires = access_expires

        session = _create_session(user["id"], access["id"], token_expires)
        _clear_login_rate_limit(rate_limit_key)
        _log_history(user["id"], "LOGIN", {"email": email, "role": "temporary"})
        resp_dict = {"token": str(session.get("token") or ""), "user": _sanitize_user(user)}
        return AuthLoginResponse.model_validate(resp_dict)
    except HTTPException as exc:
        if exc.status_code == 401:
            _record_failed_login(rate_limit_key)
        raise

@api_router.post("/auth/temp-credentials")
async def create_temp_credential(payload: TempCredentialCreate, request: Request):
    admin = await require_admin(request)

    email = (payload.email or payload.username or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email is required.")

    hours_val = 12
    p_hours = payload.expires_in_hours
    if p_hours is not None:
        hours_val = p_hours
    if hours_val != 0 and (hours_val < 1 or hours_val > 168):
        raise HTTPException(status_code=400, detail="expires_in_hours must be 0 (permanent) or between 1 and 168.")

    existing = _get_user_by_email(email)
    if existing and existing.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Cannot create temporary access for admin email.")

    requested_role = payload.role or "temporary"
    if requested_role not in ("temporary", "staff"):
        raise HTTPException(status_code=400, detail="role must be temporary or staff.")

    if payload.can_manage_certificates is None:
        can_manage_certificates = bool(payload.can_edit_certificates) or bool(
            payload.can_delete_certificates
        )
    else:
        can_manage_certificates = bool(payload.can_manage_certificates)

    if existing:
        user = existing
        if (user.get("role") or "").lower() == "admin":
            raise HTTPException(status_code=400, detail="Cannot modify admin permissions here.")
        _update_user_certificate_permissions(user["id"], can_manage_certificates)
        user = _get_user_by_id(user["id"])
    else:
        user = _create_user_if_missing(
            email,
            requested_role,
            can_manage_certificates=can_manage_certificates,
        )
    if user is not None:
        full_name = payload.full_name
        if full_name and not _is_blank(full_name) and not user.get("full_name"):
            _update_user_full_name(user["id"], full_name.strip())
            user = _get_user_by_id(user["id"])

    if payload.password is not None and _is_blank(payload.password):
        raise HTTPException(status_code=400, detail="password cannot be blank.")
    payload_password = payload.password
    if payload_password:
        password_error = _validate_password_strength(str(payload_password))
        if password_error:
            raise HTTPException(status_code=400, detail=password_error)

    password = payload_password or _random_password()
    if hours_val == 0:
        expires_at = (_now() + timedelta(days=3650)).isoformat()
    else:
        expires_at = (_now() + timedelta(hours=hours_val)).isoformat()

    if user is None:
        raise HTTPException(status_code=500, detail="User could not be resolved.")
    
    admin_id = str(admin.get("id") or "")
    loop = asyncio.get_event_loop()
    hashed = await loop.run_in_executor(None, _hash_password, password)
    access = _create_temp_access(user["id"], hashed, expires_at, admin_id)
    _log_history(user["id"], "TEMP_ACCESS_CREATED", {"email": email, "expires_at": expires_at})
    _log_history(admin["id"], "ADMIN_CREATED_TEMP_ACCESS", {"email": email, "access_id": access["id"]})

    assert user is not None
    return {
        "user": _sanitize_user(user),
        "temporary_password": password,
        "expires_at": access["expires_at"],
    }

@api_router.post("/auth/revoke")
async def revoke_credential(payload: RevokeCredentialRequest, request: Request):
    admin = await require_admin(request)
    tid = payload.temp_access_id
    if tid:
        access = _get_temp_access_by_id(tid)
        if not access:
            raise HTTPException(status_code=404, detail="Temporary access not found.")
        target_uid = str(access.get("user_id") or "")
        if not target_uid:
             raise HTTPException(status_code=404, detail="Temporary access linked user not found.")
             
        with _db() as db:
            db.query(TemporaryAccess).filter(TemporaryAccess.user_id == target_uid).update({"is_revoked": 1})
            db.commit()
        _revoke_sessions_for_user(target_uid)
        _log_history(target_uid, "TEMP_ACCESS_REVOKED", {"access_id": tid})
        _log_history(admin["id"], "ADMIN_REVOKED_TEMP_ACCESS", {"access_id": tid})
        return {"ok": True, "temp_access_id": tid}

    uid = payload.user_id
    if uid:
        user = _get_user_by_id(uid)
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")
        if user.get("role") == "admin":
            raise HTTPException(status_code=400, detail="Cannot revoke admin account.")
        with _db() as db:
            db.query(TemporaryAccess).filter(TemporaryAccess.user_id == uid).update({"is_revoked": 1})
            db.commit()
        _revoke_sessions_for_user(uid)
        _log_history(uid, "TEMP_ACCESS_REVOKED", {"user_id": uid})
        _log_history(admin["id"], "ADMIN_REVOKED_TEMP_ACCESS", {"user_id": uid})
        return {"ok": True, "user_id": uid}

    raise HTTPException(status_code=400, detail="user_id or temp_access_id is required.")

@api_router.get("/admin/offices")
async def list_offices(request: Request):
    await require_admin(request)
    return {"items": _get_office_locations()}

@api_router.post("/admin/offices")
async def create_office(payload: OfficeLocationCreate, request: Request):
    await require_admin(request)
    if _is_blank(payload.name):
        raise HTTPException(status_code=400, detail="name is required.")

    lat = payload.lat
    lng = payload.lng
    if not _is_blank(payload.plus_code):
        lat, lng = _decode_plus_code_to_lat_lng(payload.plus_code or "", payload.lat, payload.lng)

    now = _now().isoformat()
    office_id = str(uuid4())
    ips_csv = ",".join([i.strip() for i in (payload.ips or []) if i and i.strip()])
    
    office = OfficeLocation(
        id=office_id,
        name=payload.name.strip(),
        ips=ips_csv,
        lat=lat,
        lng=lng,
        radius_m=payload.radius_m,
        created_at=now,
        updated_at=now
    )
    with _db() as db:
        db.add(office)
        db.commit()
    _invalidate_office_cache()
    return {"id": office_id}

@api_router.put("/admin/offices/{office_id}")
async def update_office(office_id: str, payload: OfficeLocationUpdate, request: Request):
    await require_admin(request)
    with _db() as db:
        office = db.query(OfficeLocation).filter(OfficeLocation.id == office_id).first()
        if not office:
            raise HTTPException(status_code=404, detail="Office location not found.")

        if payload.name is not None:
            name_val = str(payload.name).strip()
            if _is_blank(name_val):
                raise HTTPException(status_code=400, detail="name is required.")
            office.name = name_val
            
        if payload.ips is not None:
            ips_list = payload.ips or []
            office.ips = ",".join([str(i).strip() for i in ips_list if i and str(i).strip()])

        lat = payload.lat if payload.lat is not None else office.lat
        lng = payload.lng if payload.lng is not None else office.lng
        if not _is_blank(payload.plus_code):
            lat, lng = _decode_plus_code_to_lat_lng(payload.plus_code or "", lat, lng)
        
        office.lat = lat
        office.lng = lng

        if payload.radius_m is not None:
            office.radius_m = payload.radius_m
            
        office.updated_at = _now().isoformat()
        db.commit()
    _invalidate_office_cache()
    return {"ok": True, "id": office_id}

@api_router.delete("/admin/offices/{office_id}")
async def delete_office(office_id: str, request: Request):
    await require_admin(request)
    with _db() as db:
        office = db.query(OfficeLocation).filter(OfficeLocation.id == office_id).first()
        if not office:
            raise HTTPException(status_code=404, detail="Office location not found.")
        db.delete(office)
        db.commit()
    _invalidate_office_cache()
    return {"ok": True, "id": office_id}

@api_router.get("/access/status")
async def access_status(request: Request):
    user, session = await require_user_raw(request)
    role = (user.get("role") or "").lower()

    if role == "admin":
        return {"allowed": True, "role": role, "method": "admin"}

    if _is_staff_role(role):
        client_ip = _get_client_ip(request)
        if _is_office_ip(client_ip):
            return {"allowed": True, "role": role, "method": "ip"}
        if _session_geo_granted(session):
            return {"allowed": True, "role": role, "method": "geo_grant"}
        if not _get_office_geos():
            return {
                "allowed": False,
                "role": role,
                "geo_required": False,
                "message": "No office locations are configured. Please contact admin.",
            }
        return {
            "allowed": False,
            "role": role,
            "geo_required": True,
            "message": "Office Wi-Fi not detected. Please allow location to continue.",
        }

    return {"allowed": False, "role": role, "message": "Access denied for this role."}

@api_router.post("/access/geo-check")
async def access_geo_check(payload: GeoCheckRequest, request: Request):
    user, session = await require_user_raw(request)
    role = (user.get("role") or "").lower()
    if role == "admin":
        return {"allowed": True, "role": role, "method": "admin"}
    if not _is_staff_role(role):
        raise HTTPException(status_code=403, detail="Access denied for this role.")

    office_list = _get_office_geos()
    if not office_list:
        raise HTTPException(status_code=500, detail="Office geo configuration is missing.")

    within, distance, office_name = _is_within_office_geo(payload.lat, payload.lng)
    if not within:
        msg = "Access denied. You are outside the allowed geo-radius."
        if distance is not None:
            msg = f"{msg} Distance: {int(distance)} meters."
        raise HTTPException(status_code=403, detail=msg)

    grant = _grant_geo_for_session(session["id"])
    return {
        "allowed": True,
        "role": role,
        "method": "geo",
        "office": office_name,
        "geo_granted_until": grant["geo_granted_until"],
    }

@api_router.get("/auth/temp-credentials")
async def list_temp_credentials(
    request: Request,
    status: Optional[str] = Query(default="all"),
):
    await require_admin(request)
    items = []
    with _db() as db:
        results = db.query(TemporaryAccess, User.email).join(User, User.id == TemporaryAccess.user_id).order_by(TemporaryAccess.created_at.desc()).all()
        for ta_obj, email in results:
            ta_dict = _to_dict(ta_obj)
            is_expired = _is_expired(ta_dict["expires_at"])
            item = {
                "id": ta_dict["id"],
                "user_id": ta_dict["user_id"],
                "username": email,
                "email": email,
                "expires_at": ta_dict["expires_at"],
                "is_revoked": bool(ta_dict["is_revoked"]),
                "is_expired": is_expired,
                "is_active": (not ta_dict["is_revoked"]) and (not is_expired),
                "created_at": ta_dict["created_at"],
            }
            items.append(item)

    if status == "active":
        items = [i for i in items if i["is_active"]]
    elif status == "expired":
        items = [i for i in items if i["is_expired"]]

    return {"items": items, "status": status}

@api_router.get("/auth/users")
async def list_users(request: Request):
    await require_admin(request)
    with _db() as db:
        users = db.query(User).order_by(User.created_at.desc()).all()
        items = [_sanitize_user(_to_dict(u)) for u in users]
    for item in items:
        item["username"] = item.get("email")
    return {"items": items}

@api_router.get("/history")
async def list_history(
    request: Request,
    email: Optional[str] = Query(default=None),
    start: Optional[str] = Query(default=None),
    end: Optional[str] = Query(default=None),
):
    user = await require_user(request)

    items = []
    with _db() as db:
        query = db.query(History, User.email).join(User, User.id == History.user_id)
        
        if user.get("role") != "admin":
            query = query.filter(History.user_id == user["id"])
        elif email:
            target = db.query(User).filter(User.email == email.strip().lower()).first()
            if target:
                query = query.filter(History.user_id == target.id)
            else:
                return {"items": []}

        if start:
            query = query.filter(History.timestamp >= start)
        if end:
            query = query.filter(History.timestamp <= end)

        for h_obj, u_email in query.order_by(History.timestamp.desc()).all():
            item = _to_dict(h_obj)
            item["email"] = u_email
            item["action_data"] = _safe_json_loads(
                item.get("action_data"),
                {},
                f"history:{item.get('id')}",
            )
            items.append(item)

    return {"items": items}

# -----------------------------
# Create universal certificate
# -----------------------------
@api_router.post("/certificates", response_model=UniversalCertificateStored)
async def create_certificate(payload: UniversalCertificateCreate, request: Request, background_tasks: BackgroundTasks):
    # Enforce ownership: temp users only create under their own account
    user = await require_user(request)
    err = validate_common(payload)
    if err:
        raise HTTPException(status_code=400, detail=err)

    v = CATEGORY_VALIDATORS.get(payload.category)
    if v:
        err2 = v(payload)
        if err2:
            raise HTTPException(status_code=400, detail=err2)

    doc_data = {
        "category": payload.category,
        "certificate_type": payload.certificate_type,
        "entityType": payload.entityType,
        "identity": payload.identity.model_dump(),
        "meta": payload.meta.model_dump(),
        "ca": payload.ca.model_dump(),
        "data": payload.data.model_dump(),
    }
    doc = UniversalCertificateStored(**doc_data)

    stored = _serialize(doc.model_dump())
    cert_obj = Certificate(
        id=stored["id"],
        user_id=user["id"],
        created_by_info=user.get("email") or "system",
        category=stored["category"],
        certificate_type=stored["certificate_type"],
        entity_type=stored["entityType"],
        payload_json=json.dumps(stored, ensure_ascii=False, default=str),
        created_at=stored["created_at"],
        updated_at=stored["updated_at"]
    )
    with _db() as db:
        db.add(cert_obj)
        db.commit()
    background_tasks.add_task(_log_history, user["id"], "CERT_CREATE", {"cert_id": stored["id"], "category": stored["category"]})
    return doc

# -----------------------------
# List certificates (history)
# -----------------------------
@api_router.get("/certificates")
async def list_certificates(
    request: Request,
    page: Optional[int] = Query(default=None, ge=1),
    limit: Optional[int] = Query(default=None, ge=1, le=200),
):
    # Admin sees all, temporary users see only their own certificates
    user = await require_user(request)
    with _db() as db:
        query = db.query(Certificate.payload_json)
        if user.get("role") != "admin":
            query = query.filter(Certificate.user_id == user["id"])
        
        query = query.order_by(Certificate.created_at.desc())
        
        if page is not None and limit is not None:
            total = query.count()
            offset = (page - 1) * limit
            rows = query.offset(offset).limit(limit).all()
            certs: List[Dict[str, Any]] = []
            for row in rows:
                cert = _safe_json_loads(row[0], {}, "certificates:list")
                if cert:
                    certs.append(cert)
            return {"page": page, "limit": limit, "total": total, "items": certs}
        else:
            rows = query.all()
            certs = []
            for row in rows:
                cert = _safe_json_loads(row[0], {}, "certificates:list")
                if cert:
                    certs.append(cert)
            return certs

# -----------------------------
# Get one certificate
# -----------------------------
@api_router.get("/certificates/{cert_id}")
async def get_certificate(cert_id: str, request: Request):
    user = await require_user(request)
    with _db() as db:
        row = db.query(Certificate.user_id, Certificate.payload_json).filter(Certificate.id == cert_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Certificate not found")
    if user.get("role") != "admin" and row.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    cert = _safe_json_loads(row.payload_json, {}, f"certificate:{cert_id}")
    if not cert:
        raise HTTPException(status_code=500, detail="Stored certificate payload is invalid JSON.")
    return cert

# -----------------------------
# Update certificate (merge-safe)
# -----------------------------
@api_router.put("/certificates/{cert_id}")
async def update_certificate(cert_id: str, request: Request, background_tasks: BackgroundTasks, payload: dict = Body(...)):
    user = await require_user(request)
    with _db() as db:
        cert = db.query(Certificate).filter(Certificate.id == cert_id).first()
        if not cert:
            raise HTTPException(status_code=404, detail="Certificate not found")
        
        is_admin = (user.get("role") or "").lower() == "admin"
        if not is_admin:
            if cert.user_id != user["id"]:
                raise HTTPException(status_code=403, detail="Forbidden")
            if not _can_user_manage_certificates(user):
                raise HTTPException(status_code=403, detail="Certificate manage permission denied.")

        existing = _safe_json_loads(cert.payload_json, {}, f"certificate:{cert_id}")
        if not existing:
            raise HTTPException(status_code=500, detail="Stored certificate payload is invalid JSON.")
        updated = {**existing, **payload}
        updated["id"] = cert_id
        updated["created_at"] = existing.get("created_at", updated.get("created_at"))
        updated["certificate_type"] = updated.get("certificate_type") or existing.get("certificate_type")
        updated["updated_at"] = _now().isoformat()

        cert.payload_json = json.dumps(updated, ensure_ascii=False, default=str)
        cert.updated_at = updated["updated_at"]
        db.commit()

    background_tasks.add_task(_log_history, user["id"], "CERT_UPDATE", {"cert_id": cert_id})
    return updated

# -----------------------------
# Delete certificate
# -----------------------------
@api_router.delete("/certificates/{cert_id}")
async def delete_certificate(cert_id: str, request: Request, background_tasks: BackgroundTasks):
    user = await require_user(request)
    with _db() as db:
        cert = db.query(Certificate).filter(Certificate.id == cert_id).first()
        if not cert:
            raise HTTPException(status_code=404, detail="Certificate not found")
        
        is_admin = (user.get("role") or "").lower() == "admin"
        if not is_admin:
            if cert.user_id != user["id"]:
                raise HTTPException(status_code=403, detail="Forbidden")
            if not _can_user_manage_certificates(user):
                raise HTTPException(status_code=403, detail="Certificate manage permission denied.")
        
        db.delete(cert)
        db.commit()
        
    background_tasks.add_task(_log_history, user["id"], "CERT_DELETE", {"cert_id": cert_id})
    return {"ok": True, "id": cert_id}

cors_uses_wildcard = "*" in CORS_ALLOW_ORIGINS
if IS_PRODUCTION and cors_uses_wildcard:
    raise RuntimeError("CORS_ORIGINS cannot contain '*' in production.")
trusted_hosts_use_wildcard = "*" in TRUSTED_ALLOWED_HOSTS
if IS_PRODUCTION and trusted_hosts_use_wildcard:
    raise RuntimeError("ALLOWED_HOSTS cannot contain '*' in production.")

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=TRUSTED_ALLOWED_HOSTS,
)

if FORCE_HTTPS:
    app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=not cors_uses_wildcard,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Wire router
# -----------------------------
app.include_router(api_router)

