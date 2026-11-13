import json
import urllib.request

def search_sentinel2(bbox, datetime_range='2024-05-01T00:00:00Z/2024-08-31T23:59:59Z', max_cloud=10):
    url = 'https://earth-search.aws.element84.com/v1/search'
    payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": bbox,
        "datetime": datetime_range,
        "query": {
            "eo:cloud_cover": {"lt": max_cloud}
        },
        "limit": 3
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'User-Agent': 'FieldShift/1.0'}
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        features = data.get('features', [])
        print(f"Found {len(features)} scenes for bbox {bbox}")
        for f in features:
            props = f.get('properties', {})
            assets = f.get('assets', {})
            print(f"  ID: {f.get('id')}, Date: {props.get('datetime')}, Cloud: {props.get('eo:cloud_cover'):.1f}%")
            print("  Bands:", [k for k in ['blue', 'green', 'red', 'nir'] if k in assets])
            if 'red' in assets:
                print("  Red href:", assets['red']['href'])
        return features

print("--- Testing Potsdam, Brandenburg ---")
search_sentinel2([13.0, 52.35, 13.15, 52.45])

print("\n--- Testing Umred, Maharashtra, India ---")
search_sentinel2([79.30, 20.82, 79.38, 20.88])
