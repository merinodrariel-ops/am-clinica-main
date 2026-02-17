import json
import re
import sys

# Path to the data file
DATA_FILE = "/Users/am/.gemini/antigravity/brain/3f6fd10b-6b20-4ac0-9534-c253fa72e406/.system_generated/steps/36/output.txt"

def load_data(file_path):
    try:
        with open(file_path, 'r') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"File not found: {file_path}")
        return []

    # Try to find the JSON array list
    match = re.search(r'\[.*\]', content, re.DOTALL)
    if not match:
        print("Could not find JSON data ([...]) in file.")
        return []
    
    json_candidates = []
    raw_match = match.group(0)
    json_candidates.append(raw_match)
    
    # Candidate 2: Unescape quotes if they look escaped
    if '\\"' in raw_match:
        unescaped = raw_match.replace('\\"', '"')
        # We might also need to handle other escapes if necessary, but start with quotes
        json_candidates.append(unescaped)

    data = None
    for i, candidate in enumerate(json_candidates):
        try:
            data = json.loads(candidate)
            print(f"Successfully loaded data using candidate {i+1}")
            break
        except json.JSONDecodeError as e:
            print(f"Candidate {i+1} failed JSON decode: {e}")
            # print(f"Snippet: {candidate[:100]}...")

    if not data:
        print("Failed to decode JSON from any candidate.")
        print(f"Raw snippet: {raw_match[:200]}")
        return []

    return data

def normalize_string(s):
    if not s:
        return ""
    return str(s).lower().strip() # Ensure it's string (e.g. if numbers)

def calculate_completeness_score(record):
    score = 0
    # Weighted fields
    # document: strict check for non-empty string that isn't just whitespace
    doc = record.get('documento')
    if doc and str(doc).strip(): score += 5
    
    email = record.get('email')
    if email and str(email).strip(): score += 3
    
    phone = record.get('telefono')
    if phone and str(phone).strip(): score += 3
    
    if record.get('fecha_nacimiento'): score += 2
    if record.get('link_historia_clinica'): score += 2
    
    if record.get('presupuesto_total') and float(record['presupuesto_total'] or 0) > 0: score += 1
    if record.get('financ_monto_total') and float(record['financ_monto_total'] or 0) > 0: score += 1
    
    # Prefer newer records if scores are tied? Or older?
    # Usually older records have more history, but newer might be cleaner.
    # Let's add a tiny fraction based on ID or date to break ties consistently
    return score

def main():
    data = load_data(DATA_FILE)
    if not data:
        return

    print(f"Loaded {len(data)} records.")

    # Group by normalized name + surname
    groups = {}
    for record in data:
        name = normalize_string(record.get('nombre'))
        surname = normalize_string(record.get('apellido'))
        
        # Skip if name/surname is extremely short or empty
        if len(name) < 2 or len(surname) < 2:
            continue

        key = f"{name}|{surname}"
        
        # Also, check if 'documento' is same?
        # A person might be entered as "Juan Perez" and "Juan Antonio Perez" - this is harder.
        # But let's stick to exact name+surname match for now as requested by user logic typically
        
        if key not in groups:
            groups[key] = []
        groups[key].append(record)

    duplicate_groups = {k: v for k, v in groups.items() if len(v) > 1}
    
    print(f"Found {len(duplicate_groups)} groups with duplicates based on Name + Surname.")

    to_delete = []
    to_keep = []
    
    summary_counts = {"kept": 0, "deleted": 0}

    # Open a report file
    with open('duplicate_report.txt', 'w') as report:
        report.write("--- Duplicate Report ---\n")
        
        for key, group in duplicate_groups.items():
            # Score each record
            scored_group = []
            for record in group:
                score = calculate_completeness_score(record)
                scored_group.append((score, record))
            
            # Sort by score descending. 
            # If tie, use ID or created_at to be deterministic?
            # Let's use ID as secondary sort key
            scored_group.sort(key=lambda x: (x[0], x[1].get('id_paciente')), reverse=True)
            
            winner = scored_group[0][1]
            losers = [x[1] for x in scored_group[1:]]
            
            to_keep.append(winner)
            to_delete.extend(losers)
            summary_counts["kept"] += 1
            summary_counts["deleted"] += len(losers)
    
            report.write(f"\nGroup: {key.replace('|', ' ')}\n")
            report.write(f"  KEEP: ID={winner['id_paciente']} (Score: {scored_group[0][0]}) - Doc: {winner.get('documento')}, Email: {winner.get('email')}, Updated: {winner.get('updated_at')}\n")
            for loser in losers:
                l_score = calculate_completeness_score(loser)
                report.write(f"  DELETE: ID={loser['id_paciente']} (Score: {l_score}) - Doc: {loser.get('documento')}, Email: {loser.get('email')}, Updated: {loser.get('updated_at')}\n")

    print(f"Total duplicates found: {summary_counts['deleted']}")
    print("Report generated in 'duplicate_report.txt'")

    # Generate SQL delete statements
    if to_delete:
        with open('delete_duplicates.sql', 'w') as sql_file:
            ids_to_delete = [f"'{r['id_paciente']}'" for r in to_delete]
            batch_size = 50
            for i in range(0, len(ids_to_delete), batch_size):
                batch = ids_to_delete[i:i+batch_size]
                sql_file.write(f"UPDATE pacientes SET is_deleted = true WHERE id_paciente IN ({', '.join(batch)});\n")
        print("SQL script generated in 'delete_duplicates.sql'")

if __name__ == "__main__":
    main()
