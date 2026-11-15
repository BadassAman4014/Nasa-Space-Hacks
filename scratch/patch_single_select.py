from pathlib import Path

p = Path("src/components/analytics/health/FieldMapTab.tsx")
s = p.read_text(encoding="utf-8")
crlf = "\r\n" in s
s = s.replace("\r\n", "\n")
old = "    const on = !active[kind];\n    setActive((a) => ({ ...a, [kind]: on }));\n"
new = "    const on = !active[kind];\n    // One layer at a time keeps the map readable.\n    setActive({ moisture: false, nitrogen: false, leaching: false, [kind]: on });\n"
assert old in s
s = s.replace(old, new, 1)
p.write_text(s.replace("\n", "\r\n") if crlf else s, encoding="utf-8", newline="")
print("single-select applied")
