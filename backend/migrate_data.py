import sqlite3
import os
import json
from sqlalchemy.orm import Session
from database import SessionLocal
from models import User, Certificate, History, Session as SessionModel, TemporaryAccess, OfficeLocation

def migrate_data(sqlite_path="data/app.db"):
    """Migrate data from SQLite to PostgreSQL"""
    
    print(f"Connecting to SQLite: {sqlite_path}")
    if not os.path.exists(sqlite_path):
        print(f"ERROR: SQLite database file not found at {sqlite_path}")
        return

    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_conn.row_factory = sqlite3.Row
    cursor = sqlite_conn.cursor()
    
    print("Connecting to PostgreSQL...")
    db = SessionLocal()
    
    try:
        # Migrate Users
        print("\nMigrating users...")
        cursor.execute("SELECT * FROM users")
        users = cursor.fetchall()
        for row in users:
            d = dict(row)
            user = User(
                id=d['id'],
                email=d['email'],
                full_name=d['full_name'],
                role=d['role'],
                can_edit_certificates=d.get('can_edit_certificates', 0),
                can_delete_certificates=d.get('can_delete_certificates', 0),
                password_hash=d['password_hash'],
                created_at=d['created_at']
            )
            db.merge(user)
        db.commit()
        print(f"  ✓ Migrated {len(users)} users")
        
        # Migrate Temporary Access (Order matters due to FKs)
        print("Migrating temporary access...")
        cursor.execute("SELECT * FROM temporary_access")
        temp_accesses = cursor.fetchall()
        for row in temp_accesses:
            d = dict(row)
            temp = TemporaryAccess(
                id=d['id'],
                user_id=d['user_id'],
                password_hash=d['password_hash'],
                expires_at=d['expires_at'],
                is_revoked=d['is_revoked'],
                created_by_admin_id=d['created_by_admin_id'],
                created_at=d['created_at']
            )
            db.merge(temp)
        db.commit()
        print(f"  ✓ Migrated {len(temp_accesses)} temporary access records")

        # Migrate Sessions
        print("Migrating sessions...")
        cursor.execute("SELECT * FROM sessions")
        sessions = cursor.fetchall()
        for row in sessions:
            d = dict(row)
            session = SessionModel(
                id=d['id'],
                user_id=d['user_id'],
                temp_access_id=d['temp_access_id'],
                token=d['token'],
                expires_at=d['expires_at'],
                is_revoked=d['is_revoked'],
                geo_granted_until=d.get('geo_granted_until'),
                created_at=d['created_at']
            )
            db.merge(session)
        db.commit()
        print(f"  ✓ Migrated {len(sessions)} sessions")
        
        # Migrate Certificates
        print("Migrating certificates...")
        cursor.execute("SELECT * FROM certificates")
        certs = cursor.fetchall()
        for row in certs:
            d = dict(row)
            cert = Certificate(
                id=d['id'],
                user_id=d['user_id'],
                category=d['category'],
                certificate_type=d['certificate_type'],
                entity_type=d['entity_type'],
                payload_json=d['payload_json'],
                created_at=d['created_at'],
                updated_at=d['updated_at']
            )
            db.merge(cert)
        db.commit()
        print(f"  ✓ Migrated {len(certs)} certificates")
        
        # Migrate History
        print("Migrating history...")
        cursor.execute("SELECT * FROM history")
        histories = cursor.fetchall()
        for row in histories:
            d = dict(row)
            hist = History(
                id=d['id'],
                user_id=d['user_id'],
                action_type=d['action_type'],
                action_data=d['action_data'],
                timestamp=d['timestamp']
            )
            db.merge(hist)
        db.commit()
        print(f"  ✓ Migrated {len(histories)} history entries")
        
        # Migrate Office Locations
        print("Migrating office locations...")
        cursor.execute("SELECT * FROM office_locations")
        offices = cursor.fetchall()
        for row in offices:
            d = dict(row)
            office = OfficeLocation(
                id=d['id'],
                name=d['name'],
                ips=d['ips'],
                lat=d['lat'],
                lng=d['lng'],
                radius_m=d['radius_m'],
                created_at=d['created_at'],
                updated_at=d['updated_at']
            )
            db.merge(office)
        db.commit()
        print(f"  ✓ Migrated {len(offices)} office locations")
        
        print("\n✅ Migration completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()
        sqlite_conn.close()

if __name__ == "__main__":
    import sys
    
    if "DATABASE_URL" not in os.environ:
        print("ERROR: DATABASE_URL environment variable not set")
        sys.exit(1)
    
    sqlite_path = os.path.join("data", "app.db")
    migrate_data(sqlite_path)
