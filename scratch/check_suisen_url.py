import json

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

suisen_url_items = [item for item in data if '35_suisen' in item.get('url', '')]
print(f"Items with '35_suisen' in URL: {len(suisen_url_items)}")

if suisen_url_items:
    print("\nSample Suisen URL Items:")
    for item in suisen_url_items[:5]:
        print(f"{item.get('university')} | {item.get('category')} | {item.get('type')}")
    
    print("\nCategories for these items:")
    for cat in set(item.get('category') for item in suisen_url_items):
        print(f"- {cat}")
else:
    # Maybe 34_suisen? Or just suisen?
    any_suisen_url = [item for item in data if 'suisen' in item.get('url', '').lower()]
    print(f"Items with 'suisen' in URL (case insensitive): {len(any_suisen_url)}")
    if any_suisen_url:
         print("\nSample 'suisen' URL Items:")
         for item in any_suisen_url[:5]:
             print(f"{item.get('university')} | {item.get('category')} | {item.get('type')}")
