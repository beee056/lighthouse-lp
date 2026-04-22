import json
with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
categories = set(item['category'] for item in data)
print(categories)
