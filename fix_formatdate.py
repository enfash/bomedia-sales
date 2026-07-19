import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content
    
    # fix formatDate(x, ) -> formatDate(x)
    content = re.sub(r'formatDate\((.*?),\s*\)', r'formatDate(\1)', content)
    
    # fix formatDate(x, 'en-US', { ... }) -> formatDate(x, { ... })
    content = re.sub(r"formatDate\((.*?),\s*'en-US'\s*,\s*(\{.*?\})\)", r'formatDate(\1, \2)', content)
    
    # fix formatDate(x, undefined, { ... }) -> formatDate(x, { ... })
    content = re.sub(r"formatDate\((.*?),\s*undefined\s*,\s*(\{.*?\})\)", r'formatDate(\1, \2)', content)

    with open(filepath, 'w') as f:
        f.write(content)
        
    if content != original:
        print(f"Fixed {filepath}")

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            if file == 'date.ts': continue
            process_file(os.path.join(root, file))
