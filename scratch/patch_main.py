from pathlib import Path

p = Path("backend/app/main.py")
s = p.read_text(encoding="utf-8")
s = s.replace("    ai_assistant,\n)", "    ai_assistant,\n    field_health,\n)", 1)
s = s.replace("    ai_assistant.router,\n]:", "    ai_assistant.router,\n    field_health.router,\n]:", 1)
s = s.replace(
    "@app.get('/health')",
    "@app.on_event('startup')\ndef _start_appeears_worker() -> None:\n    \"\"\"Poll NASA AppEEARS in the background so queued SMAP/ECOSTRESS extractions get ingested.\"\"\"\n    from app.services.nasa.real.appeears import appeears_worker\n\n    appeears_worker.start()\n\n\n@app.get('/health')",
    1,
)
p.write_text(s, encoding="utf-8")
print("main.py patched" if "field_health.router" in s and "appeears_worker" in s else "PATCH FAILED")
