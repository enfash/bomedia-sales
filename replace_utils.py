import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content
    
    # 1. Replace ₦{var.toLocaleString()} with {formatCurrency(var)}
    # Match ₦{ expression.toLocaleString() }
    content = re.sub(r'₦\{\s*(.*?)(?:\.toLocaleString\(\)|\.toLocaleString\(\'en-US\'.*?\)|\.toLocaleString\(undefined.*?\))\s*\}', r'{formatCurrency(\1)}', content)
    
    # Also handle string templates `₦${var.toLocaleString()}`
    content = re.sub(r'₦\$\{\s*(.*?)(?:\.toLocaleString\(\)|\.toLocaleString\(\'en-US\'.*?\)|\.toLocaleString\(undefined.*?\))\s*\}', r'${formatCurrency(\1)}', content)

    # 2. Add imports if changed
    if content != original:
        if 'formatCurrency' not in original and '{formatCurrency' in content or '${formatCurrency' in content:
            # find last import
            last_import = content.rfind('import ')
            if last_import != -1:
                end_of_line = content.find('\n', last_import)
                content = content[:end_of_line+1] + "import { formatCurrency } from '@/utils/currency';\n" + content[end_of_line+1:]
            else:
                content = "import { formatCurrency } from '@/utils/currency';\n" + content
                
    with open(filepath, 'w') as f:
        f.write(content)
        
    if content != original:
        print(f"Updated {filepath}")

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            process_file(os.path.join(root, file))
