from pathlib import Path
p=Path('src/components/analytics/FieldAnalyticsWorkspace.tsx')
s=p.read_text(encoding='utf-8')
start=s.index('  const loadRisk = useCallback')
end=s.index('  const loadAllData = useCallback',start)
s=s[:start]+s[end:]
s=s.replace("    void loadRisk(false);\n","")
s=s.replace("  }, [fieldId, loadAllData, loadRisk]);","  }, [fieldId, loadAllData]);")
start=s.find("        {activeTab === 'risk' && (")
if start>=0:
    end=s.index("        {activeTab === 'status'",start)
    s=s[:start]+s[end:]
p.write_text(s,encoding='utf-8')
