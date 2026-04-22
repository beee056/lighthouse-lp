import json

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

private_suisen_url = [item for item in data if 'suisen' in item.get('url', '').lower() and item.get('type') == '私立']
print(f"Private items with 'suisen' in URL: {len(private_suisen_url)}")

if private_suisen_url:
    print("\nSample Private Suisen Items:")
    for item in private_suisen_url[:5]:
        print(f"{item.get('university')} | {item.get('category')} | {item.get('type')} | {item.get('url')}")
