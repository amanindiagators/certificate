# Project Overview: CertifyPro

CertifyPro is a professional, high-end Certificate Management System specifically designed for Chartered Accountants (CAs) and corporate entities. It streamlines the creation, validation, and storage of various statutory certificates while ensuring rigorous access control and professional presentation.

## Core Capabilities
- **Statutory Certificate Generation**: Automated generation of Net Worth, Turnover, RERA (Form 3 & 7), NBFC, and GST certificates.
- **Professional Presentation**: Certificates are formatted for A4 printing, including support for custom letterheads and standard statutory layouts.
- **Advanced Access Control**: Implements IP-based and Geo-fencing security for staff members, ensuring sensitive operations only occur within authorized locations.
- **Audit Logging**: Comprehensive history tracking for all certificate creations and user logins.

## Technology Stack
- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons, Radix UI.
- **Backend**: FastAPI (Python 3.10+), SQLAlchemy.
- **Database**: 
  - **Development**: SQLite for rapid iteration.
  - **Production**: PostgreSQL (supported via `psycopg2-binary`).
- **DevOps**: GitHub handles source control; optimized for deployment on Render, Railway, or standard Nginx/Uvicorn setups.

## User Roles & Permissions

| Role | Permissions | Access Control |
| :--- | :--- | :--- |
| **Admin** | Full system access, Manage Users, Delete Records, Configure Office Locations. | Global (Anywhere) |
| **Staff** | Create and View Certificates, View History. | Office-restricted (IP or Geo-radius) |
| **Temporary** | Restricted View/Create access for a specific duration. | Defined per credential |

## Key Features
- **A4 Print System**: Custom CSS engine ensures web previews exactly match physical printouts.
- **Dynamic Forms**: Smart validation ensuring all statutory fields are captured accurately based on certificate type.
- **Real-time Search**: Quick discovery of historical certificates via the History dashboard.
- **Branding Engine**: Global logo and branding management (as seen in the CertifyPro update).
