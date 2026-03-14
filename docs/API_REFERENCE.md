# API Reference: CertifyPro

The backend provides a RESTful JSON API secured via Bearer Token (Session-based).

## Authentication
Every request (except login) must include:
`Authorization: Bearer <your_token>`

---

## 🔒 Authentication Endpoints

### Login
`POST /api/auth/login`
- **Body**: `{ "email": "...", "password": "..." }`
- **Response**: `{ "token": "...", "user": { ... } }`

### Create Temporary Credential (Admin Only)
`POST /api/auth/temp-credentials`
- **Body**: `{ "email": "...", "expires_in_hours": 12, "role": "staff" }`
- **Response**: Credentials and temporary password.

---

## 📝 Certificate Endpoints

### List Certificates
`GET /api/certificates`
- **Query Params**: `page`, `limit`
- **Visibility**: Admins see all; users see only their own.

### Create Certificate
`POST /api/certificates`
- **Body**: `UniversalCertificateCreate` object.
- **Validation**: Performs statutory checks based on category.

### Delete Certificate
`DELETE /api/certificates/{id}`
- **Requirement**: `can_delete_certificates` permission.

---

## 🏢 Location & Access Endpoints

### Access Status
`GET /api/access/status`
- **Purpose**: Checks if the user is on an authorized IP or within geo-radius.
- **Output**: `allowed: boolean`, `method: "ip" | "geo" | "admin"`

### Verify Geo-Location
`POST /api/access/geo-check`
- **Body**: `{ "lat": 25.5, "lng": 85.1 }`
- **Response**: Grants a `geo_grant` if within office radius.

---

## 📊 Administration Endpoints

### List History
`GET /api/history`
- **Query Params**: `email`, `start`, `end`
- **Response**: Audit log of all actions.

### Manage Offices
`GET | POST | PUT | DELETE /api/admin/offices`
- **Purpose**: Manage the authorized physical spaces for staff login.

---

## Error Codes
| Code | Description |
| :--- | :--- |
| **401** | Unauthorized (Invalid or expired token) |
| **403** | Forbidden (IP/Geo restriction triggered) |
| **404** | Resource not found |
| **429** | Too many login attempts (Rate limited) |
| **500** | Internal Server Error |
