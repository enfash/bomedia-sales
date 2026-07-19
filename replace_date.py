import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content
    
    # Replace new Date(x).toLocaleDateString(y) with formatDate(x, y)
    # Match: new Date(x).toLocaleDateString()
    content = re.sub(r'new\s+Date\((.*?)\)\.toLocaleDateString\((.*?)\)', r'formatDate(\1, \2)', content)
    
    # We might have `new Date().toLocaleDateString()`
    content = re.sub(r'new\s+Date\(\)\.toLocaleDateString\((.*?)\)', r'formatDate(new Date(), \1)', content)

    # 2. Add imports if changed
    if content != original:
        if 'formatDate' not in original and 'formatDate(' in content:
            last_import = content.rfind('import ')
            if last_import != -1:
                end_of_line = content.find('\n', last_import)
                content = content[:end_of_line+1] + "import { formatDate } from '@/utils/date';\n" + content[end_of_line+1:]
            else:
                content = "import { formatDate } from '@/utils/date';\n" + content
                
    with open(filepath, 'w') as f:
        f.write(content)
        
    if content != original:
        print(f"Updated {filepath}")

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            if file == 'date.ts': continue
            process_file(os.path.join(root, file))
