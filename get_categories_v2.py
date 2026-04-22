import json
with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
categories = sorted(list(set(item['category'] for item in data)))
with open('categories.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(categories))
