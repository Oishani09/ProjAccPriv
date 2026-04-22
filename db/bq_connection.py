import os
import json
from datetime import datetime
from google.cloud import bigquery
from dotenv import load_dotenv

load_dotenv()

# BigQuery Settings
PROJECT_ID = os.getenv("GCP_PROJECT_ID")
DATASET_ID = os.getenv("GCP_DATASET_ID", "health_enroll")
TABLE_ID = os.getenv("GCP_TABLE_ID", "members_test")
CREDENTIALS_PATH = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

def get_bq_client():
    """Initializes the BigQuery client."""
    if CREDENTIALS_PATH:
        return bigquery.Client.from_service_account_json(CREDENTIALS_PATH)
    return bigquery.Client(project=PROJECT_ID)

def get_table_schema():
    """Defines the schema for member data."""
    return [
        bigquery.SchemaField("subscriber_id", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("ingestion_timestamp", "TIMESTAMP", mode="REQUIRED"),
        bigquery.SchemaField("status", "STRING", mode="NULLABLE"),
        
        # File Metadata (Nested)
        bigquery.SchemaField("file_metadata", "RECORD", mode="NULLABLE", fields=[
            bigquery.SchemaField("sender_id", "STRING"),
            bigquery.SchemaField("receiver_id", "STRING"),
            bigquery.SchemaField("file_date", "STRING"),
            bigquery.SchemaField("control_number", "STRING"),
        ]),
        
        # Member Info (Nested)
        bigquery.SchemaField("member_info", "RECORD", mode="NULLABLE", fields=[
            bigquery.SchemaField("first_name", "STRING"),
            bigquery.SchemaField("last_name", "STRING"),
            bigquery.SchemaField("ssn", "STRING"),
            bigquery.SchemaField("dob", "STRING"),
            bigquery.SchemaField("gender", "STRING"),
            bigquery.SchemaField("address_line_1", "STRING"),
            bigquery.SchemaField("city", "STRING"),
            bigquery.SchemaField("state", "STRING"),
            bigquery.SchemaField("zip", "STRING"),
            bigquery.SchemaField("phone", "STRING"),
            bigquery.SchemaField("email", "STRING"),
        ]),
        
        # Coverages (Repeated Record)
        bigquery.SchemaField("coverages", "RECORD", mode="REPEATED", fields=[
            bigquery.SchemaField("coverage_type", "STRING"),
            bigquery.SchemaField("plan_code", "STRING"),
            bigquery.SchemaField("effective_date", "STRING"),
            bigquery.SchemaField("termination_date", "STRING"),
        ]),
        
        # Raw Data (JSON string for 100% parity)
        bigquery.SchemaField("raw_data", "STRING", mode="NULLABLE"),
    ]

def load_members_to_bq(members_list):
    """
    Loads a list of member dictionaries into BigQuery using a batch load job.
    This is cost-free for ingestion.
    """
    client = get_bq_client()
    table_ref = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}"
    
    # Prepare data for NDJSON
    ingestion_time = datetime.utcnow().isoformat()
    processed_rows = []
    for member in members_list:
        # Ensure timestamp is added
        if "ingestion_timestamp" not in member:
            member["ingestion_timestamp"] = ingestion_time
        
        # Add raw_data if not already provided by the parser
        if "raw_data" not in member:
            member["raw_data"] = json.dumps(member)
        
        processed_rows.append(member)
        
    # Configuration for Batch Load
    job_config = bigquery.LoadJobConfig(
        schema=get_table_schema(),
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
        write_disposition="WRITE_APPEND", # Keeps history of all uploads
        time_partitioning=bigquery.TimePartitioning(field="ingestion_timestamp")
    )
    
    try:
        # Load data from memory (as NDJSON)
        load_job = client.load_table_from_json(processed_rows, table_ref, job_config=job_config)
        load_job.result() # Wait for completion
        print(f"Successfully loaded {len(processed_rows)} rows to {table_ref}")
        return True
    except Exception as e:
        print(f"BigQuery Load Error: {e}")
        return False

if __name__ == "__main__":
    # Quick test if run directly
    print("BQ Schema defined.")
