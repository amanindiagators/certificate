# Database Schema: CertifyPro

The system uses a relational schema designed for security and traceability. All tables use UUID (String) primary keys for portability.

## 1. Users (`users`)
Stores user identity and global permissions.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | String | Primary Key (UUID) |
| `email` | String | Unique, used for login |
| `full_name` | String | Display name |
| `role` | String | `admin`, `staff`, or `temporary` |
| `can_edit_certificates` | Integer | Boolean flag (0/1) for editing |
| `can_delete_certificates`| Integer | Boolean flag (0/1) for deletion |
| `password_hash` | String | PBKDF2 hashed password |
| `created_at` | String | ISO Timestamp |

## 2. Certificates (`certificates`)
Primary storage for generated statutory documents.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | String | Primary Key (UUID) |
| `user_id` | String | Foreign Key (users.id) |
| `category` | String | e.g., `NET_WORTH`, `TURNOVER`, `RERA` |
| `certificate_type` | String | Specific variant |
| `entity_type` | String | `PERSONAL`, `PRIVATE_LIMITED`, etc. |
| `payload_json` | Text | Complete structured data of the certificate |
| `created_at` | String | ISO Timestamp |

## 3. History (`history`)
Audit trails for all user actions.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | String | Primary Key (UUID) |
| `user_id` | String | Foreign Key (users.id) |
| `action_type` | String | e.g., `LOGIN`, `CERT_CREATE`, `CERT_DELETE` |
| `action_data` | Text | JSON string containing context of the action |
| `timestamp` | String | ISO Timestamp |

## 4. Office Locations (`office_locations`)
Used for Geo-fencing and IP restriction.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | String | Primary Key (UUID) |
| `name` | String | Location name |
| `ips`| String | Comma-separated list of allowed IP ranges |
| `lat` / `lng` | Float | GPS Coordinates |
| `radius_m` | Float | Allowed radius in meters |

## 5. Temporary Access (`temporary_access`)
One-time or time-limited credentials.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | String | Primary Key |
| `user_id` | String | Foreign Key (users.id) |
| `expires_at` | String | Expiration ISO Timestamp |
| `is_revoked` | Integer | Revocation flag |

## Relationships
- **User -> Certificates**: One-to-Many.
- **User -> History**: One-to-Many.
- **User -> Sessions**: One-to-Many.

## Sample Query
To retrieve all certificates created by a specific user with its related history:
```sql
SELECT c.id, c.category, h.action_type, h.timestamp 
FROM certificates c
JOIN history h ON c.user_id = h.user_id
WHERE c.user_id = 'user_uuid_here'
ORDER BY h.timestamp DESC;
```
