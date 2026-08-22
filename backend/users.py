import os
import json
import uuid
import time
import secrets
import hashlib
import threading
from pathlib import Path
from typing import Optional, Dict, Any

STORAGE_DIR = Path(__file__).parent / "storage"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
USERS_DB_FILE = STORAGE_DIR / "users.json"
_users_lock = threading.Lock()

def _load_users_db() -> Dict[str, Any]:
    if USERS_DB_FILE.exists():
        try:
            with open(USERS_DB_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading users db: {e}")
    return {"users": {}, "sessions": {}}

def _save_users_db(db: Dict[str, Any]):
    with _users_lock:
        try:
            with open(USERS_DB_FILE, "w", encoding="utf-8") as f:
                json.dump(db, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error saving users db: {e}")

_db = _load_users_db()

def _hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    if not salt:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return key.hex(), salt

def _verify_password(password: str, password_hash: str, salt: str) -> bool:
    key, _ = _hash_password(password, salt)
    return secrets.compare_digest(key, password_hash)

def register_user(username: str, email: str, password: str) -> Dict[str, Any]:
    username = username.strip()
    email = email.strip().lower()
    
    if len(username) < 3:
        raise ValueError("Tên người dùng phải có ít nhất 3 ký tự")
    if len(password) < 6:
        raise ValueError("Mật khẩu phải có ít nhất 6 ký tự")
    if "@" not in email or "." not in email:
        raise ValueError("Email không hợp lệ")

    for user in _db["users"].values():
        if user["username"].lower() == username.lower():
            raise ValueError("Tên người dùng đã được sử dụng")
        if user["email"].lower() == email:
            raise ValueError("Email đã được đăng ký")

    user_id = "u_" + str(uuid.uuid4())[:12]
    pwd_hash, salt = _hash_password(password)

    new_user = {
        "id": user_id,
        "username": username,
        "email": email,
        "password_hash": pwd_hash,
        "salt": salt,
        "created_at": time.time(),
        "role": "user"
    }

    _db["users"][user_id] = new_user
    _save_users_db(_db)

    token = create_session(user_id)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "username": username,
            "email": email,
            "role": "user"
        }
    }

def authenticate_user(login_id: str, password: str) -> Dict[str, Any]:
    login_id = login_id.strip().lower()
    target_user = None

    for user in _db["users"].values():
        if user["username"].lower() == login_id or user["email"].lower() == login_id:
            target_user = user
            break

    if not target_user:
        raise ValueError("Tên đăng nhập hoặc mật khẩu không chính xác")

    if not _verify_password(password, target_user["password_hash"], target_user["salt"]):
        raise ValueError("Tên đăng nhập hoặc mật khẩu không chính xác")

    token = create_session(target_user["id"])
    return {
        "token": token,
        "user": {
            "id": target_user["id"],
            "username": target_user["username"],
            "email": target_user["email"],
            "role": target_user.get("role", "user")
        }
    }

def create_session(user_id: str) -> str:
    token = "tok_" + secrets.token_urlsafe(32)
    # Session lasts 30 days
    expires_at = time.time() + (30 * 24 * 3600)
    _db["sessions"][token] = {
        "user_id": user_id,
        "expires_at": expires_at
    }
    _save_users_db(_db)
    return token

def get_session_user(token: str) -> Optional[Dict[str, Any]]:
    if not token or token not in _db["sessions"]:
        return None
    
    session = _db["sessions"][token]
    if time.time() > session.get("expires_at", 0):
        # Expired
        _db["sessions"].pop(token, None)
        _save_users_db(_db)
        return None

    user_id = session.get("user_id")
    user = _db["users"].get(user_id)
    if not user:
        return None

    return {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "role": user.get("role", "user")
    }

def delete_session(token: str):
    if token in _db["sessions"]:
        _db["sessions"].pop(token, None)
        _save_users_db(_db)

def authenticate_google_user(google_id: str, email: str, name: str, picture: Optional[str] = None) -> Dict[str, Any]:
    email = email.strip().lower()
    target_user = None

    # Check if user already exists with this email or google_id
    for user in _db["users"].values():
        if user.get("google_id") == google_id or user.get("email", "").lower() == email:
            target_user = user
            break

    if target_user:
        # Update google_id and avatar if missing
        if not target_user.get("google_id"):
            target_user["google_id"] = google_id
        if picture and not target_user.get("avatar"):
            target_user["avatar"] = picture
        _save_users_db(_db)
    else:
        # Create new user from Google profile
        user_id = "u_" + str(uuid.uuid4())[:12]
        base_username = (name.replace(" ", "_") if name else email.split("@")[0])[:20]
        username = base_username
        suffix = 1
        existing_usernames = {u["username"].lower() for u in _db["users"].values() if "username" in u}
        while username.lower() in existing_usernames:
            username = f"{base_username}_{suffix}"
            suffix += 1

        target_user = {
            "id": user_id,
            "username": username,
            "email": email,
            "google_id": google_id,
            "avatar": picture or "",
            "created_at": time.time(),
            "role": "user",
            "provider": "google"
        }
        _db["users"][user_id] = target_user
        _save_users_db(_db)

    token = create_session(target_user["id"])
    return {
        "token": token,
        "user": {
            "id": target_user["id"],
            "username": target_user["username"],
            "email": target_user["email"],
            "role": target_user.get("role", "user"),
            "avatar": target_user.get("avatar", "")
        }
    }
