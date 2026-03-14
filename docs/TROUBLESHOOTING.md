# Troubleshooting Guide: CertifyPro

## 🎨 Styles Not Loading
**Problem**: The certificate preview looks unformatted (plain text).
- **Cause**: The `App.css` containing A4 layouts might not be imported in the entry point.
- **Fix**: Ensure `import "./App.css";` is present in `src/index.jsx`.
- **Note**: Check if Tailwind is purging custom certificate classes. Custom classes like `.certificate-table` should be prefixed or added to the safelist.

## 🔑 Authentication / Access Denied
**Problem**: Staff members cannot log in even with correct passwords.
- **Cause**: Geo-fencing or IP restriction is active.
- **Fix**: 
  1. Check if the user is on Office Wi-Fi.
  2. Ensure the Admin has configured an `OfficeLocation` in the Admin Dashboard.
  3. Verify the browser has Location Permissions enabled.

## 🗄 Database Connection Errors
**Problem**: `database is locked` (SQLite).
- **Cause**: Too many concurrent writes or a hung process.
- **Fix**: Run `npm run clean` to kill existing Python/Node processes and restart the app.
- **Production Fix**: Migrate to PostgreSQL for better concurrency handling.

## 🌐 CORS Issues (Cross-Origin Resource Sharing)
**Problem**: Frontend cannot talk to Backend in production.
- **Fix**: Verify `CORS_ORIGINS` in the backend `.env` matches the frontend URL exactly (including `https://` and no trailing slash).

## 🖨 Printing Layout Issues
**Problem**: Headers/Footers don't appear on every page of the PDF.
- **Fix**: The system uses specialized CSS `position: fixed` within a table-based layout for the headers/footers. Ensure you are using a modern Chromium-based browser (Chrome/Edge) for the "Print to PDF" functionality for best results.

## 🚀 Port 8000 Already in Use
**Problem**: Backend fails to start because the port is busy.
- **Fix**: Run `npm run clean` (Windows) or `fuser -k 8000/tcp` (Linux) to free the port.
