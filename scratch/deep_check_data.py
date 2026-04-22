import json

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Total items in data.json: {len(data)}")

# Search for dricomeye.net
dricom_items = [item for item in data if 'dricomeye.net' in item.get('url', '')]
print(f"Items from dricomeye.net: {len(dricom_items)}")

if dricom_items:
    print("\nSample Dricom Items (first 5):")
    for item in dricom_items[:5]:
        print(f"- {item.get('university')} | {item.get('faculty')} | {item.get('category')} | {item.get('type')}")
    
    print("\nCategories in Dricom Items:")
    dricom_categories = set(item.get('category') for item in dricom_items)
    for cat in dricom_categories:
        print(f"- {cat}")

    print("\nTypes in Dricom Items:")
    dricom_types = set(item.get('type') for item in dricom_items)
    for t in dricom_types:
        print(f"- {t}")

# Search for items where category contains '推薦' and type is '私立'
private_rec = [item for item in data if '推薦' in item.get('category', '') and item.get('type') == '私立']
print(f"\nItems with '推薦' in category and type '私立': {len(private_rec)}")

# Search for any items with type '私立'
all_private = [item for item in data if item.get('type') == '私立']
print(f"Total Private items: {len(all_private)}")
if all_private:
    print("\nCategories found in Private items:")
    private_cats = set(item.get('category') for item in all_private)
    for cat in private_cats:
        print(f"- {cat}")
