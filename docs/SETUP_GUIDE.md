# Setup Guide: CertifyPro

Follow these steps to set up the CertifyPro environment on your local machine.

## Prerequisites
- **Node.js**: v18.0 or higher
- **Python**: v3.10 or higher
- **Database**: 
  - SQLite (Default for development)
  - PostgreSQL v14+ (Recommended for Production)

---

## 1. Backend Setup
Navigate to the root directory of the project.

### Windows (PowerShell)
```powershell
# Create virtual environment
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install -r backend/requirements.txt
```

### Linux / macOS
```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt
```

---

## 2. Frontend Setup

### Install Dependencies
```bash
cd frontend-app
npm install
```

---

## 3. Environment Configuration
Create a `.env` file in the `backend/` directory.

```ini
ENVIRONMENT=development
JWT_SECRET=your_super_secret_key
DATABASE_URL=sqlite:///./data/app.db
PORT=8000

# Initial Admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=StrongPassword123!

# Storage
STORAGE_DIR=./data
```

---

## 4. Running the Application

### The Unified Command (Root Folder)
The easiest way to run both backend and frontend simultaneously:
```bash
npm run start
```
*Note: This will clean existing port processes (3000, 8000) and start the dev servers.*

### Manual Startup
**Backend**:
```bash
cd backend
python -m uvicorn server:app --reload --port 8000
```
**Frontend**:
```bash
cd frontend-app
npm run dev
```

---

## 5. Verification
- **Web App**: [http://localhost:3000](http://localhost:3000)
- **API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check**: [http://localhost:8000/api/health](http://localhost:8000/api/health)
