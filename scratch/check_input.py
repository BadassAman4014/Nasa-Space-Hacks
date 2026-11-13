import json

transcript_path = r'C:\Users\amanr\.gemini\antigravity\brain\938078f3-cb21-4464-9a2c-f9892162b99a\.system_generated\logs\transcript.jsonl'
with open(transcript_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

inputs = []
for line in lines:
    try:
        data = json.loads(line)
        if data.get('type') == 'USER_INPUT':
            inputs.append(data)
    except Exception:
        pass

print(f"Total USER_INPUT: {len(inputs)}")
if inputs:
    last = inputs[-1]
    print("Step index:", last.get("step_index"))
    print("Content:", repr(last.get("content")))
    print("Media:", last.get("media"))

