import os
import json
from datetime import datetime

def format_date(date_str):
    try:
        if len(date_str) == 8:
            return datetime.strptime(date_str, "%Y%m%d").strftime("%Y-%m-%d")
        return None
    except:
        return None

def parse_edi(edi_text):
    segments = [seg.strip() for seg in edi_text.strip().split("~") if seg.strip()]

    file_metadata = {
        "sender_id": None,
        "receiver_id": None,
        "file_date": None,
        "file_time": None,
        "control_number": None,
        "test_indicator": None,
        "group_control_number": None,
        "transaction_version": None
    }

    transactions = []
    current_transaction = None
    current_subscriber = None  # The main 'INS*Y' record
    current_member = None      # The person (Sub or Dep) currently being processed
    current_coverage = None

    employer = {}
    insurer = {}

    for seg in segments:
        elements = [e.strip() for e in seg.split("*")]
        if not elements: continue
        seg_id = elements[0]

        if seg_id == "ISA" and len(elements) > 15:
            file_metadata["sender_id"] = elements[6]
            file_metadata["receiver_id"] = elements[8]
            file_metadata["file_date"] = format_date("20" + elements[9])
            file_metadata["file_time"] = elements[10]
            file_metadata["control_number"] = elements[13]
            file_metadata["test_indicator"] = elements[15]

        elif seg_id == "GS" and len(elements) > 8:
            file_metadata["group_control_number"] = elements[6]
            file_metadata["transaction_version"] = elements[8]

        elif seg_id == "ST":
            # Save previous transaction
            if current_transaction:
                if current_member:
                    if current_member.get("_is_sub"):
                        current_subscriber = current_member
                    elif current_subscriber:
                        current_subscriber.setdefault("dependents", []).append(current_member)
                if current_subscriber:
                    current_transaction["members"].append(current_subscriber)
                transactions.append(current_transaction)

            current_subscriber = None
            current_member = None
            current_transaction = {
                "transaction_metadata": {"transaction_id": elements[2] if len(elements) > 2 else None, "policy_id": None},
                "members": []
            }

        elif seg_id == "N1" and len(elements) > 2:
            if elements[1] == "P5":
                employer = {"employer_name": elements[2], "employer_id": elements[4] if len(elements) > 4 else None}
            elif elements[1] == "IN":
                insurer = {"insurer_name": elements[2], "insurer_id": elements[4] if len(elements) > 4 else None}

        elif seg_id == "INS":
            # New person loop starts. Save the previous one.
            if current_member:
                if current_member.get("_is_sub"):
                    current_subscriber = current_member
                elif current_subscriber:
                    current_subscriber.setdefault("dependents", []).append(current_member)

            is_sub = (elements[1] == "Y")
            current_member = {
                "_is_sub": is_sub,
                "member_info": {
                    "subscriber_indicator": elements[1],
                    "relationship_code": elements[2],
                    "employment_status": elements[3],
                    "subscriber_id": None,
                    "first_name": None,
                    "last_name": None,
                    "ssn": None,
                    "dob": None,
                    "gender": None,
                    "address_line_1": None,
                    "city": None,
                    "state": None,
                    "zip": None,
                    "phone": None,
                    "email": None,
                    **employer,
                    **insurer
                },
                "coverages": []
            }

        elif seg_id == "REF" and len(elements) > 2:
            if elements[1] == "38" and current_transaction:
                current_transaction["transaction_metadata"]["policy_id"] = elements[2]
            elif elements[1] == "0F" and current_member:
                current_member["member_info"]["subscriber_id"] = elements[2]

        elif seg_id == "NM1" and len(elements) > 4:
            if elements[1] in ["IL", "03"]: # Subscriber or Dependent
                info = current_member["member_info"]
                info["last_name"] = elements[3].title()
                info["first_name"] = elements[4].title()
                info["ssn"] = elements[9] if len(elements) > 9 else None

        elif seg_id == "N3" and current_member:
            current_member["member_info"]["address_line_1"] = elements[1]

        elif seg_id == "N4" and current_member:
            info = current_member["member_info"]
            info["city"] = elements[1] if len(elements) > 1 else None
            info["state"] = elements[2] if len(elements) > 2 else None
            info["zip"] = elements[3] if len(elements) > 3 else None

        elif seg_id == "DMG" and len(elements) > 3 and current_member:
            info = current_member["member_info"]
            info["dob"] = format_date(elements[2])
            info["gender"] = elements[3]

        elif seg_id == "PER" and current_member:
            info = current_member["member_info"]
            for i, val in enumerate(elements):
                if val in ["HP", "TE", "CP"] and i + 1 < len(elements) and not info.get("phone"):
                    info["phone"] = elements[i+1]
                elif val == "EM" and i + 1 < len(elements) and not info.get("email"):
                    info["email"] = elements[i+1]

        elif seg_id == "HD" and current_member:
            current_coverage = {
                "coverage_type": elements[1] if len(elements) > 1 else None,
                "plan_code": elements[3] if len(elements) > 3 else None,
                "effective_date": None,
                "termination_date": None
            }
            current_member["coverages"].append(current_coverage)

        elif seg_id == "DTP" and len(elements) > 3:
            if elements[1] == "348" and current_member and current_member["coverages"]:
                current_member["coverages"][-1]["effective_date"] = format_date(elements[3])
            elif elements[1] == "349" and current_member and current_member["coverages"]:
                current_member["coverages"][-1]["termination_date"] = format_date(elements[3])
            elif elements[1] == "303" and current_transaction:
                current_transaction["transaction_metadata"]["effective_date"] = format_date(elements[3])

    # Final cleanup for the very last member/transaction
    if current_member:
        if current_member.get("_is_sub"):
            current_subscriber = current_member
        elif current_subscriber:
            current_subscriber.setdefault("dependents", []).append(current_member)
    
    if current_subscriber and current_transaction:
        current_transaction["members"].append(current_subscriber)
    
    if current_transaction:
        transactions.append(current_transaction)

    return {
        "file_metadata": file_metadata,
        "transactions": transactions
    }

if __name__ == "__main__":
    import sys
    import os
    # Add project root to path so we can import db.bq_connection and server logic
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
    
    from db.bq_connection import load_members_to_bq
    from server.routers.files import check_file_integrity
    
    # Path to a sample EDI file for testing
    sample_path = "synthetic_data/edi_834_100_strict_production/strict_1.edi" 
    
    if os.path.exists(sample_path):
        print(f"--- Starting Side-by-Side Flow for {sample_path} ---")
        
        # 1. Structural Integrity Check (Same as Production)
        print("Step 1: Checking File Integrity...")
        validation_status = check_file_integrity(sample_path)
        print(f"Status: {validation_status}")
        
        if validation_status != "Healthy":
            print("Aborting: File structure is invalid.")
            sys.exit(1)
            
        # 2. Parsing (Same as Production)
        print("Step 2: Parsing EDI Content...")
        with open(sample_path, 'r') as f:
            edi_content = f.read()
        parsed_result = parse_edi(edi_content)
        
        # 3. BigQuery Transformation (New Side-by-Side Step)
        print("Step 3: Preparing Data for BigQuery...")
        members_to_load = []
        file_meta = parsed_result["file_metadata"]
        
        for tx in parsed_result["transactions"]:
            for member in tx["members"]:
                # Match the "Record" structure exactly
                bq_row = {
                    "subscriber_id": member.get("subscriber_id") or member.get("member_info", {}).get("subscriber_id"),
                    "status": "Side-by-Side Ingested",
                    "file_metadata": file_meta,
                    "member_info": member.get("member_info"),
                    "coverages": member.get("coverages", []),
                    "raw_data": json.dumps(member) # 100% Data Parity with Mongo
                }
                
                # Cleanup: BigQuery doesn't like None for required fields or extra keys
                if not bq_row["subscriber_id"]:
                    bq_row["subscriber_id"] = f"MEM-{os.urandom(4).hex()}"
                
                members_to_load.append(bq_row)
        
        # 4. Ingestion (Mirroring Mongo flow but to BQ)
        print(f"Step 4: Ingesting {len(members_to_load)} members to BigQuery...")
        success = load_members_to_bq(members_to_load)
        
        if success:
            print("\nSUCCESS: BigQuery Side-by-Side Flow Complete.")
            print("Check your BigQuery console for the 'Side-by-Side Ingested' status.")
        else:
            print("\nFAILED: Ingestion error. Check GCP credentials/permissions.")
    else:
        print(f"Sample file not found at {sample_path}. Please place an EDI file there to test.")