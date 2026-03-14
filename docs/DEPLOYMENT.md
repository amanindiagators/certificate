# Deployment Guide: CertifyPro

This guide outlines how to deploy CertifyPro to a production Linux environment (Ubuntu 22.04+).

## 1. Build Process
Before deploying, generate the production build of the frontend.

### Unified Build Command (Root)
```bash
npm run build
```
This generates the `frontend-app/build` directory which contains static assets.

---

## 2. Server Configuration

### Backend Systemd Service
Create `/etc/systemd/system/certifypro-backend.service`:

```ini
[Unit]
Description=CertifyPro Backend Gunicorn Service
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/certifypro/backend
Environment="PATH=/var/www/certifypro/backend/venv/bin"
ExecStart=/var/www/certifypro/backend/venv/bin/gunicorn -w 4 -k uvicorn.workers.UvicornWorker server:app --bind 0.0.0.0:8000

[Install]
WantedBy=multi-user.target
```

---

## 3. Nginx Configuration
Configure Nginx to serve the frontend and proxy the backend API.

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend Static Files
    location / {
        root /var/www/certifypro/frontend-app/build;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API Proxy
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 4. SSL Setup (Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## 5. Security Checklist
- Set `ENVIRONMENT=production` in backend `.env`.
- Ensure `CORS_ORIGINS` in `.env` matches your public domain.
- Use a managed PostgreSQL database (like Render DB, AWS RDS, or local Postgres).
- Disable `ENABLE_API_DOCS` in production `.env`.

---

## 6. Backup Procedures
### Database Backup (Postgres)
```bash
pg_dump -U username -h localhost dbname > backup_$(date +%F).sql
```
### Configuration Backup
Keep a copy of your `.env` and `letterhead.png` files securely off-site.
