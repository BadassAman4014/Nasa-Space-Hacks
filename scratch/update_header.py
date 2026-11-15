from pathlib import Path
p=Path('src/components/analytics/FieldHeader.tsx')
s=p.read_text(encoding='utf-8')
start=s.index('        {/* Field Risk */}')
end=s.index('        {/* Status */}',start)
s=s[:start]+s[end:]
p.write_text(s,encoding='utf-8')
