# Linux Deployment Guide - CA Certificate Management

This guide covers the deployment of the CA Certificate Management System on a Linux server (Ubuntu/Debian) using Nginx and systemd.

## Prerequisites

- Domain names (e.g., `example.com` and `api.example.com`)
- Target Linux Server (VPS/Dedicated) with SSH access
- PostgreSQL installed and running on the target server

---

## 1. Directory Structure

On your server, create the following structure:
```bash
sudo mkdir -p /var/www/ca-certificates/frontend
sudo mkdir -p /var/www/ca-certificates/backend
sudo mkdir -p /var/www/ca-certificates/scripts
sudo mkdir -p /var/log/ca-certificates
sudo mkdir -p /var/backups/ca-certificates

# Set ownership
sudo chown -R www-data:www-data /var/www/ca-certificates
sudo chown -R www-data:www-data /var/log/ca-certificates
```

## 2. Setting Up Backend

1. Copy the contents of `backend/` from your local machine to `/var/www/ca-certificates/backend/`.
2. Create a virtual environment and install dependencies:
   ```bash
   cd /var/www/ca-certificates/backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
3. Set up the environment file:
   Copy `backend/.env.production` to your server as `.env.production` in the backend folder.
4. Copy the systemd service file:
   ```bash
   # From your local deploy/ca-certificates-backend.service
   sudo cp deploy/ca-certificates-backend.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable ca-certificates-backend
   sudo systemctl start ca-certificates-backend
   ```

## 3. Setting Up Frontend

1. Build the frontend locally:
   ```bash
   cd frontend-app
   npm run build
   ```
2. Upload the contents of the `build/` (or `dist/`) folder to your server at `/var/www/ca-certificates/frontend/`.

## 4. Setting Up Nginx

1. Copy the Nginx config:
   ```bash
   # From your local deploy/nginx_config
   sudo cp deploy/nginx_config /etc/nginx/sites-available/ca-certificates
   ```
2. Edit the file to replace `YOUR_DOMAIN.com` with your actual domain.
3. Enable the site and restart Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/ca-certificates /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```
4. Install SSL via Certbot:
   ```bash
   sudo certbot --nginx -d YOUR_DOMAIN.com -d www.YOUR_DOMAIN.com
   sudo certbot --nginx -d api.YOUR_DOMAIN.com
   ```

## 5. Automated Backups

1. Copy the backup script:
   ```bash
   sudo cp deploy/backup-db.sh /var/www/ca-certificates/scripts/
   sudo chmod +x /var/www/ca-certificates/scripts/backup-db.sh
   ```
2. Schedule a daily cron job:
   ```bash
   sudo crontab -e
   # Add this line to run daily at 2:00 AM:
   0 2 * * * /var/www/ca-certificates/scripts/backup-db.sh >> /var/log/ca-certificates/backup.log 2>&1
   ```
