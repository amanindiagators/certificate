from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from reportlab.lib import colors
from io import BytesIO

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Models
class FinancialYear(BaseModel):
    year: str
    total_assets: float
    total_liabilities: float
    net_worth: float

class TurnoverYear(BaseModel):
    year: str
    turnover: float

class CADetails(BaseModel):
    ca_name: str
    membership_no: str
    udin: str
    firm_name: str = "P. Jyoti & Co."
    frn: str = "010237C"
    place: str
    date: str

class NetWorthCertificate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(datetime.now(timezone.utc).timestamp()))
    company_name: str
    cin: str
    registered_address: str
    financial_years: List[FinancialYear]
    ca_details: CADetails
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    certificate_type: str = "networth"

class TurnoverCertificate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(datetime.now(timezone.utc).timestamp()))
    company_name: str
    cin: str
    registered_address: str
    turnover_years: List[TurnoverYear]
    ca_details: CADetails
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    certificate_type: str = "turnover"

class NetWorthCreate(BaseModel):
    company_name: str
    cin: str
    registered_address: str
    financial_years: List[FinancialYear]
    ca_details: CADetails

class TurnoverCreate(BaseModel):
    company_name: str
    cin: str
    registered_address: str
    turnover_years: List[TurnoverYear]
    ca_details: CADetails

class CASettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = "default"
    ca_name: str
    membership_no: str
    udin: str
    firm_name: str = "P. Jyoti & Co."
    frn: str = "010237C"
    place: str

class CASettingsUpdate(BaseModel):
    ca_name: str
    membership_no: str
    udin: str
    firm_name: str
    frn: str
    place: str

# Helper function to format Indian currency
def format_indian_currency(amount: float) -> str:
    s = f"{amount:.2f}"
    parts = s.split('.')
    integer_part = parts[0]
    decimal_part = parts[1]
    
    if len(integer_part) <= 3:
        return f"{integer_part}.{decimal_part}"
    
    last_three = integer_part[-3:]
    remaining = integer_part[:-3]
    
    result = ""
    while len(remaining) > 2:
        result = "," + remaining[-2:] + result
        remaining = remaining[:-2]
    
    if remaining:
        result = remaining + result
    
    return f"{result},{last_three}.{decimal_part}"

# API Endpoints
@api_router.get("/")
async def root():
    return {"message": "Certificate Generator API"}

@api_router.post("/networth", response_model=NetWorthCertificate)
async def create_networth_certificate(data: NetWorthCreate):
    cert = NetWorthCertificate(**data.model_dump())
    doc = cert.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.certificates.insert_one(doc)
    return cert

@api_router.post("/turnover", response_model=TurnoverCertificate)
async def create_turnover_certificate(data: TurnoverCreate):
    cert = TurnoverCertificate(**data.model_dump())
    doc = cert.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.certificates.insert_one(doc)
    return cert

@api_router.get("/certificates")
async def get_certificates():
    certs = await db.certificates.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for cert in certs:
        if isinstance(cert.get('created_at'), str):
            cert['created_at'] = datetime.fromisoformat(cert['created_at'])
    return certs

@api_router.get("/certificates/{cert_id}")
async def get_certificate(cert_id: str):
    cert = await db.certificates.find_one({"id": cert_id}, {"_id": 0})
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    if isinstance(cert.get('created_at'), str):
        cert['created_at'] = datetime.fromisoformat(cert['created_at'])
    return cert

@api_router.get("/ca-settings", response_model=CASettings)
async def get_ca_settings():
    settings = await db.ca_settings.find_one({"id": "default"}, {"_id": 0})
    if not settings:
        default_settings = CASettings(
            ca_name="CA Pankaj Jyoti",
            membership_no="400084",
            udin="25400084ZCNDSV2443",
            place="Patna"
        )
        return default_settings
    return CASettings(**settings)

@api_router.put("/ca-settings", response_model=CASettings)
async def update_ca_settings(data: CASettingsUpdate):
    settings = CASettings(id="default", **data.model_dump())
    await db.ca_settings.update_one(
        {"id": "default"},
        {"$set": settings.model_dump()},
        upsert=True
    )
    return settings

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()