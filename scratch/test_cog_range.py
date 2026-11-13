import urllib.request

url = "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/32/U/QD/2024/8/S2A_32UQD_20240828_0_L2A/B04.tif"
req = urllib.request.Request(url, headers={'Range': 'bytes=0-1023', 'User-Agent': 'FieldShift/1.0'})
try:
    with urllib.request.urlopen(req, timeout=5) as res:
        print("Range request status:", res.status)
        data = res.read()
        print(f"Read {len(data)} bytes, Header: {data[:4]}")
except Exception as e:
    print("Error:", e)
