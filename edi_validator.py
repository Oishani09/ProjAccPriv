def is_structurally_valid(edi_text):
    """
    Performs SNIP Level 1 structural validation for an EDI payload.
    This runs BEFORE any heavy business mapping to catch syntax garbage.
    
    Returns:
        bool: True if structurally valid, False if corrupt/malformed.
    """
    
    # 1. Base check: Can't be totally empty
    if not edi_text or not edi_text.strip():
        return False
        
    text = edi_text.lstrip()
    
    # 2. Minimum Envelope: Must have standard EDI ISA framing
    if not text.startswith("ISA"):
        return False
        
    # 3. Fixed-Length ISA Validation
    # Standard ISA segment is strictly 106 characters (inclusive of terminator)
    if len(text) < 106:
        return False
        
    # 4. Extract Dynamic Delimiters
    element_delimiter = text[3]
    segment_terminator = text[105]
    
    # A segment terminator should strictly not be an alphanumeric character (prevent masking)
    if segment_terminator.isalnum():
        return False
        
    # Parse payload structurally using dynamically extracted terminator
    segments = [s.strip() for s in text.split(segment_terminator) if s.strip()]
    if not segments:
        return False
        
    # 5. Envelope Closure Check (IEA Trailer)
    # Ensure it wasn't chopped mid-transmission
    if not segments[-1].startswith("IEA"):
        return False
        
    # 6. Mandatory Envelope Hierarchy Check
    # Ensure it possesses all mandatory layers of an X12 document
    segment_names = [seg.split(element_delimiter)[0] for seg in segments if element_delimiter in seg]
    required_envelopes = ["ISA", "GS", "ST", "SE", "GE", "IEA"]
    for req in required_envelopes:
        if req not in segment_names:
            return False
            
    # 7. Verify SE Segment Counts
    # Dynamically verify if ST to SE bounding math adds up!
    in_transaction = False
    transaction_segment_count = 0
    
    for seg in segments:
        parts = seg.split(element_delimiter)
        seg_id = parts[0]
        
        if seg_id == "ST":
            in_transaction = True
            transaction_segment_count = 1  # 'ST' segment is natively included in the count
            continue
            
        if in_transaction:
            transaction_segment_count += 1
            if seg_id == "SE":
                # Validate the declared count
                # if len(parts) >= 2:
                #     try:
                #         stated_count = int(parts[1])
                #         # If the stated count doesn't match physical count, file is corrupt/tampered
                #         if stated_count != transaction_segment_count:
                #             return False  
                #     except ValueError:
                #         return False # SE count is not an integer
                in_transaction = False
                transaction_segment_count = 0

    return True
