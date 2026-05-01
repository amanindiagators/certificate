# Private GitHub + Vercel Deployment

## 1. Create the GitHub Repository

Create a new private repository on GitHub:

- Owner: `amanindiagators`
- Repository name: `certificate`
- Visibility: `Private`
- Do not initialize with README, `.gitignore`, or license because this project already has files.

Then run:

```powershell
cd d:\certificate
git remote set-url origin https://github.com/amanindiagators/certificate.git
git add .
git commit -m "Prepare Vercel Turso deployment"
git push -u origin main
```

If Git asks for a password, use a GitHub personal access token, not your GitHub account password.

## 2. Vercel Environment Variables

Add these in Vercel Project Settings > Environment Variables:

```text
ENVIRONMENT=production
DATABASE_URL=sqlite+libsql://<your-turso-host>?secure=true
DATABASE_AUTH_TOKEN=<your-turso-token>
CORS_ORIGINS=https://<your-vercel-domain>
ALLOWED_HOSTS=<your-vercel-host>
ADMIN_EMAIL=<your-admin-email>
ADMIN_PASSWORD=<strong-password>
TOKEN_TTL_HOURS=12
ENABLE_API_DOCS=false
FORCE_HTTPS=true
```

Do not add `VITE_BACKEND_URL` for the single Vercel project setup. The frontend will use `/api`.

Use a manually created Turso database for `DATABASE_URL`. Do not use the Vercel
Turso Marketplace integration variables if they create `dpl-*` databases for
each deployment.

## 3. Password-Only App Access

The app has no public signup flow. Users cannot create accounts themselves.

To keep access limited:

- Use a strong `ADMIN_PASSWORD`.
- Do not share the admin password.
- Do not create temporary/staff users unless needed.
- Revoke temporary users from the admin page when work is complete.

For an extra gate before the login page, enable Vercel Deployment Protection or Password Protection in the Vercel dashboard if your plan supports it.

## 4. Run Turso Migrations

After setting Turso credentials, run:

```powershell
cd d:\certificate\backend
$env:ENVIRONMENT="production"
$env:DATABASE_URL="sqlite+libsql://<your-turso-host>?secure=true"
$env:DATABASE_AUTH_TOKEN="<your-turso-token>"
alembic upgrade head
```

Then deploy from Vercel.
