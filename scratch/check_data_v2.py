import json
import sys

# Set encoding for output
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

categories = {}
for item in data:
    cat = item.get('category')
    typ = item.get('type')
    if cat not in categories:
        categories[cat] = set()
    categories[cat].add(typ)

for cat, types in categories.items():
    print(f"Category: {cat}, Types: {list(types)}")
