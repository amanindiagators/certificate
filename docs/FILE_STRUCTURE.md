# File Structure: CertifyPro

The project is organized into a monorepo-style structure with distinct boundaries between the backend API and the frontend client.

## Directory Tree

```text
certificate/
├── backend/                # FastAPI Backend
│   ├── alembic/            # Database migrations
│   ├── data/               # Local SQLite storage (dev)
│   ├── tests/              # Pytest suite
│   ├── database.py         # SQLAlchemy connection setup
│   ├── models.py           # Database Schema (User, Cert, etc.)
│   ├── requirements.txt    # Python dependencies
│   ├── server.py           # Main API logic & Routes
│   └── pytest.ini          # Test configuration
├── frontend-app/           # React Frontend (Vite)
│   ├── public/             # Static assets (Letterheads, robots.txt)
│   ├── src/
│   │   ├── assets/         # Brand assets (logo.png)
│   │   ├── components/     # Reusable UI components (ui/, Layout.jsx)
│   │   ├── hooks/          # Custom React hooks (useAuth.jsx)
│   │   ├── lib/            # Utilities (api.js, config.py)
│   │   ├── pages/          # Individual route pages (Login.jsx, etc.)
│   │   ├── App.jsx         # Root router
│   │   ├── App.css         # Certificate-specific print styles
│   │   ├── index.css       # Tailwind & Global styles
│   │   └── main.jsx        # React entry point
│   ├── package.json        # Frontend dependencies
│   ├── tailwind.config.js  # Style configuration
│   └── vite.config.js      # Build configuration
├── docs/                   # System documentation
├── package.json            # Root configuration for unified dev commands
├── start_all.ps1           # Windows startup script
└── README.md               # Repository landing page
```

## Key Folders Purpose

### `/backend`
Contains all business logic. The `server.py` file is the primary entry point, handling authentication, geo-validation, and certificate CRUD operations. The system uses SQLAlchemy models defined in `models.py` to ensure data consistency across SQLite and PostgreSQL.

### `/frontend-app/src/pages`
Contains the core views of the application. 
- `CertificatePreview.jsx` is the most significant file, containing the visual logic for rendering multiple certificate types (Turnover, RERA, etc.).
- `Login.jsx` handles initial authentication and geo-permission requests for staff.

### `/frontend-app/public`
Stores the high-resolution `letterhead.png` (header) and `letterhead2.png` (footer) used in the A4 certificate generation engine.

### `/docs`
Centralized repository for technical and user documentation.
