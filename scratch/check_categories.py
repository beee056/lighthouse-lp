import json

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

categories = set()
for item in data:
    categories.add(item.get('category'))

print("Unique Categories:")
for cat in sorted(list(categories)):
    print(f"- {cat}")

private_recommendation = [item for item in data if '推薦' in item.get('category', '') and item.get('type') == '私立']
print(f"\nPrivate University Recommendation Items: {len(private_recommendation)}")
if private_recommendation:
    print("Example categories for private recommendations:")
    for cat in set(item['category'] for item in private_recommendation):
        print(f"- {cat}")
