import os, re

src_dir = 'd:/certificate/frontend-app/src'
# 1. Delete duplicate .js files
for root, dirs, files in os.walk(src_dir):
    for file in files:
        if file.endswith('.js'):
            base = file[:-3]
            jsx_file = base + '.jsx'
            if jsx_file in files:
                js_path = os.path.join(root, file)
                print('Removing duplicate:', js_path)
                os.remove(js_path)

# 2. Fix explicit .js imports inside .jsx files
import_re = re.compile(r'(from\s+[\'\"].*?)(\.js)([\'\"])')
for root, dirs, files in os.walk(src_dir):
    for file in files:
        if file.endswith('.jsx') or file.endswith('.js'):
            file_path = os.path.join(root, file)
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            new_content = import_re.sub(r'\1\3', content)
            
            # Also fix React.lazy imports like import("./Login.js")
            lazy_import_re = re.compile(r'(import\([\'\"].*?)(\.js)([\'\"]\))')
            new_content = lazy_import_re.sub(r'\1\3', new_content)

            if new_content != content:
                print('Fixed imports in:', file_path)
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
