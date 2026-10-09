"""MongoDB storage helpers."""
from __future__ import annotations

from io import BytesIO
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from gridfs import GridFSBucket
from gridfs.errors import NoFile
from pymongo import MongoClient

MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017')
MONGO_DB = os.getenv('MONGO_DB', 'campuslink')

try:
    _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=450)
    _client.admin.command('ping')
    _db = _client[MONGO_DB]
    _drive_jd_bucket = GridFSBucket(_db, bucket_name='drive_jds')
except Exception as exc:
    raise RuntimeError(f'Could not connect to MongoDB at {MONGO_URI}') from exc


def backend_name() -> str:
    return 'mongodb'


def new_id(prefix: str) -> str:
    return f'{prefix}_{uuid.uuid4().hex[:10]}'


def count(name: str, filters: dict[str, Any] | None = None) -> int:
    filters = filters or {}
    return int(_db[name].count_documents(filters))


def find_many(name: str, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    filters = filters or {}
    return [{k: v for k, v in d.items() if k != '_id'} for d in _db[name].find(filters)]


def find_one(name: str, filters: dict[str, Any]) -> dict[str, Any] | None:
    document = _db[name].find_one(filters)
    return None if document is None else {k: v for k, v in document.items() if k != '_id'}


def insert_one(name: str, document: dict[str, Any]) -> dict[str, Any]:
    data = dict(document)
    _db[name].insert_one(data)
    return data


def update_one(name: str, filters: dict[str, Any], fields: dict[str, Any]) -> dict[str, Any] | None:
    _db[name].update_one(filters, {'$set': dict(fields)})
    return find_one(name, filters)


def delete_many(name: str, filters: dict[str, Any] | None = None) -> int:
    filters = filters or {}
    return int(_db[name].delete_many(filters).deleted_count)


def delete_one(name: str, filters: dict[str, Any]) -> int:
    return int(_db[name].delete_one(filters).deleted_count)


def unset_field(name: str, field: str) -> int:
    result = _db[name].update_many({}, {'$unset': {field: ''}})
    return int(result.modified_count)


def store_drive_jd_file(data: bytes, filename: str, metadata: dict[str, Any]) -> str:
    file_id = _drive_jd_bucket.upload_from_stream(filename, BytesIO(data), metadata=metadata)
    return str(file_id)


def open_drive_jd_file(file_id: str):
    try:
        return _drive_jd_bucket.open_download_stream(ObjectId(file_id))
    except (InvalidId, NoFile):
        return None


def delete_drive_jd_file(file_id: str) -> None:
    try:
        _drive_jd_bucket.delete(ObjectId(file_id))
    except (InvalidId, NoFile):
        pass


def safe_text(value: Any) -> str:
    return re.sub(r'\s+', ' ', str(value or '')).strip()


def log_action(actor: str, action: str, record: str, detail: Any = None) -> None:
    insert_one('audit_log', {
        'id': new_id('log'), 'who': actor, 'action': action, 'record': record,
        'detail': detail, 'time': datetime.now(timezone.utc).isoformat(),
    })
