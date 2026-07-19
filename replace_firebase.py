import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content
    
    # Imports
    content = re.sub(r'import\s+\{.*\}\s+from\s+[\'"]firebase/database[\'"];\n?', '', content)
    content = re.sub(r'import\s+\{\s*db\s*\}\s+from\s+[\'"]@/lib/firebase[\'"];\n?', '', content)
    
    if content != original:
        content = "import { dbService } from '@/services/db';\n" + content

    # Replace usages
    # set(ref(db, path), data) -> dbService.setRecord(path, data)
    content = re.sub(r'set\(\s*ref\(\s*db\s*,\s*(.*?)\)\s*,\s*(.*?)\)', r'dbService.setRecord(\1, \2)', content)
    
    # update(ref(db, path), data) -> dbService.updateRecord(path, data)
    content = re.sub(r'update\(\s*ref\(\s*db\s*,\s*(.*?)\)\s*,\s*(.*?)\)', r'dbService.updateRecord(\1, \2)', content)
    
    # get(ref(db, path)) -> dbService.getRecord(path)
    # Actually get returns a snapshot, so snapshot.val() needs to be handled.
    # Let's see if we can do this simply, or if we need manual editing.
    # We will only do set and update for now, we'll manually fix get.

    # push(ref(db, path)) -> this returns a ref, and then set(newRef, data). Better manual.
    
    with open(filepath, 'w') as f:
        f.write(content)
        
    if content != original:
        print(f"Updated {filepath}")

files = [
    'src/app/new-sales.tsx',
    'src/app/records.tsx',
]
for f in files:
    process_file(f)
