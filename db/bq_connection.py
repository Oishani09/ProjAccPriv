"""
BigQuery Connection Module — Drop-in replacement for mongo_connection.py

Stores member and batch data in BigQuery using the SAME JSON document structure
as MongoDB. The full document is stored as a JSON string in a 'data' column,
with 'subscriber_id' and 'status' as indexed columns for fast filtering.

This ensures 100% data parity — business_logic.py, agent.py, and all routers
work without any changes to their data expectations.
"""

import os
import json
from datetime import datetime
from google.cloud import bigquery
from dotenv import load_dotenv

load_dotenv()

# BigQuery Settings (from .env)
PROJECT_ID = os.getenv("GCP_PROJECT_ID")
DATASET_ID = os.getenv("GCP_DATASET_ID", "health_enroll")
CREDENTIALS_PATH = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

MEMBERS_TABLE = f"{PROJECT_ID}.{DATASET_ID}.members"
BATCHES_TABLE = f"{PROJECT_ID}.{DATASET_ID}.batches"


# ─────────────────────────────────────────────
# Client & Table Setup
# ─────────────────────────────────────────────

def get_bq_client():
    """Initializes the BigQuery client using service account or default credentials."""
    if CREDENTIALS_PATH and os.path.exists(CREDENTIALS_PATH):
        return bigquery.Client.from_service_account_json(CREDENTIALS_PATH)
    return bigquery.Client(project=PROJECT_ID)


def ensure_tables_exist():
    """Creates the members and batches tables if they don't already exist."""
    client = get_bq_client()

    members_schema = [
        bigquery.SchemaField("subscriber_id", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("status", "STRING"),
        bigquery.SchemaField("data", "STRING"),  # Full JSON document
    ]

    batches_schema = [
        bigquery.SchemaField("id", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("status", "STRING"),
        bigquery.SchemaField("data", "STRING"),  # Full JSON document
    ]

    for table_ref, schema in [(MEMBERS_TABLE, members_schema), (BATCHES_TABLE, batches_schema)]:
        try:
            client.get_table(table_ref)
            print(f"BigQuery table {table_ref} already exists.")
        except Exception:
            table = bigquery.Table(table_ref, schema=schema)
            client.create_table(table)
            print(f"Created BigQuery table: {table_ref}")


# ─────────────────────────────────────────────
# Member Operations (replaces mongo_connection)
# ─────────────────────────────────────────────

def save_member_to_bq(member_data):
    """
    Saves a fully parsed member document to BigQuery using the same
    history/snapshot pattern as MongoDB's save_member_to_mongo().

    The primary key is subscriber_id. Each run's data is stored under
    a date-keyed branch inside 'history', exactly like MongoDB.
    """
    client = get_bq_client()
    sub_id = member_data.get("subscriber_id") or member_data.get("member_info", {}).get("subscriber_id")

    if not sub_id:
        return None

    today_str = datetime.now().strftime("%Y-%m-%d")

    # Check if member already exists
    existing = get_member_by_id(sub_id)

    if existing:
        # Update: add new snapshot to history (same as MongoDB's $set)
        if "history" not in existing:
            existing["history"] = {}
        existing["history"][today_str] = member_data
        existing["latest_update"] = today_str
        existing["status"] = member_data.get("status", "Pending")
        existing["subscriber_id"] = sub_id

        data_json = json.dumps(existing)
        query = f"""
            UPDATE `{MEMBERS_TABLE}`
            SET status = @status, data = @data
            WHERE subscriber_id = @sub_id
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("status", "STRING", existing["status"]),
                bigquery.ScalarQueryParameter("data", "STRING", data_json),
                bigquery.ScalarQueryParameter("sub_id", "STRING", sub_id),
            ]
        )
    else:
        # New member: create document with history snapshot
        doc = {
            "subscriber_id": sub_id,
            "status": member_data.get("status", "Pending"),
            "latest_update": today_str,
            "history": {
                today_str: member_data
            }
        }
        data_json = json.dumps(doc)
        query = f"""
            INSERT INTO `{MEMBERS_TABLE}` (subscriber_id, status, data)
            VALUES (@sub_id, @status, @data)
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("sub_id", "STRING", sub_id),
                bigquery.ScalarQueryParameter("status", "STRING", doc["status"]),
                bigquery.ScalarQueryParameter("data", "STRING", data_json),
            ]
        )

    client.query(query, job_config=job_config).result()
    return sub_id


def get_all_members():
    """Returns all members as a list of dicts. Same format as MongoDB's find({}, {"_id": 0})."""
    client = get_bq_client()
    query = f"SELECT data FROM `{MEMBERS_TABLE}`"
    try:
        results = client.query(query).result()
        return [json.loads(row.data) for row in results]
    except Exception as e:
        print(f"BigQuery get_all_members Error: {e}")
        return []


def get_member_by_id(subscriber_id):
    """Returns a single member dict by subscriber_id. Same as MongoDB's find_one()."""
    client = get_bq_client()
    query = f"SELECT data FROM `{MEMBERS_TABLE}` WHERE subscriber_id = @sub_id"
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("sub_id", "STRING", subscriber_id)
        ]
    )
    try:
        results = list(client.query(query, job_config=job_config).result())
        if results:
            return json.loads(results[0].data)
        return None
    except Exception:
        return None


def get_members_by_status(status):
    """Returns all members with a given status. Same as MongoDB's find({"status": ...})."""
    client = get_bq_client()
    query = f"SELECT data FROM `{MEMBERS_TABLE}` WHERE status = @status"
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("status", "STRING", status)
        ]
    )
    try:
        results = client.query(query, job_config=job_config).result()
        return [json.loads(row.data) for row in results]
    except Exception:
        return []


def update_member_status(subscriber_id, updates):
    """
    Updates specific fields on a member document.
    'updates' is a dict like {"status": "Ready", "validation_issues": [...]}
    Same as MongoDB's update_one with $set.
    """
    client = get_bq_client()
    existing = get_member_by_id(subscriber_id)
    if not existing:
        return False

    # Merge updates into the existing document (same as MongoDB $set)
    existing.update(updates)

    new_status = existing.get("status", "Pending")
    data_json = json.dumps(existing)

    query = f"""
        UPDATE `{MEMBERS_TABLE}`
        SET status = @status, data = @data
        WHERE subscriber_id = @sub_id
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("status", "STRING", new_status),
            bigquery.ScalarQueryParameter("data", "STRING", data_json),
            bigquery.ScalarQueryParameter("sub_id", "STRING", subscriber_id),
        ]
    )
    client.query(query, job_config=job_config).result()
    return True


def update_members_batch(subscriber_ids, updates):
    """
    Updates multiple members at once. Same as MongoDB's update_many with $in.
    """
    for sub_id in subscriber_ids:
        update_member_status(sub_id, updates.copy())


# ─────────────────────────────────────────────
# Batch Operations (replaces db.batches.*)
# ─────────────────────────────────────────────

def get_all_batches():
    """Returns all batches as a list of dicts."""
    client = get_bq_client()
    query = f"SELECT data FROM `{BATCHES_TABLE}`"
    try:
        results = client.query(query).result()
        return [json.loads(row.data) for row in results]
    except Exception:
        return []


def create_batch_in_bq(batch_doc):
    """Inserts a new batch document. Same as MongoDB's insert_one."""
    client = get_bq_client()
    data_json = json.dumps(batch_doc)
    query = f"""
        INSERT INTO `{BATCHES_TABLE}` (id, status, data)
        VALUES (@id, @status, @data)
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("id", "STRING", batch_doc["id"]),
            bigquery.ScalarQueryParameter("status", "STRING", batch_doc["status"]),
            bigquery.ScalarQueryParameter("data", "STRING", data_json),
        ]
    )
    client.query(query, job_config=job_config).result()


def get_batch_by_id(batch_id):
    """Returns a single batch by ID. Same as MongoDB's find_one."""
    client = get_bq_client()
    query = f"SELECT data FROM `{BATCHES_TABLE}` WHERE id = @batch_id"
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("batch_id", "STRING", batch_id)
        ]
    )
    try:
        results = list(client.query(query, job_config=job_config).result())
        if results:
            return json.loads(results[0].data)
        return None
    except Exception:
        return None


def update_batch_status(batch_id, new_status):
    """Updates a batch's status. Same as MongoDB's update_one."""
    client = get_bq_client()
    existing = get_batch_by_id(batch_id)
    if not existing:
        return False

    existing["status"] = new_status
    data_json = json.dumps(existing)

    query = f"""
        UPDATE `{BATCHES_TABLE}`
        SET status = @status, data = @data
        WHERE id = @batch_id
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("status", "STRING", new_status),
            bigquery.ScalarQueryParameter("data", "STRING", data_json),
            bigquery.ScalarQueryParameter("batch_id", "STRING", batch_id),
        ]
    )
    client.query(query, job_config=job_config).result()
    return True


# ─────────────────────────────────────────────
# Auto-setup: Create tables when server starts
# ─────────────────────────────────────────────
try:
    ensure_tables_exist()
except Exception as e:
    print(f"BigQuery setup warning (tables may need manual creation): {e}")
