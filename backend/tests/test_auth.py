import pytest
from fastapi.testclient import TestClient
from server import app
import os

client = TestClient(app, base_url="http://localhost")

def test_root():
    response = client.get("/api/")
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    assert response.json() == {"message": "Universal Certificate API"}

def test_login_invalid():
    response = client.post("/api/auth/login", json={
        "email": "nonexistent@example.com",
        "password": "wrongpassword"
    })
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."

def test_login_success():
    # Uses default admin credentials from .env
    response = client.post("/api/auth/login", json={
        "email": "admin",
        "password": "admin@123"
    })
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert data["user"]["email"] == "admin"
