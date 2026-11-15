from pathlib import Path


def edit(path, pairs):
    p = Path(path)
    s = p.read_text(encoding="utf-8")
    crlf = "\r\n" in s
    s = s.replace("\r\n", "\n")
    for a, b in pairs:
        assert a in s, (path, a[:70])
        s = s.replace(a, b, 1)
    p.write_text(s.replace("\n", "\r\n") if crlf else s, encoding="utf-8", newline="")
    print("patched", path)


TAB_BTN = """        {/* Field Map */}
        <button
          type="button"
          onClick={() => setActiveTab('map')}
          className={`px-3 py-1.5 text-xs font-bold rounded-xl transition whitespace-nowrap cursor-pointer ${
            activeTab === 'map' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Field Map
        </button>

        {/* Field Health Trend */}
        <button
          type="button"
          onClick={() => setActiveTab('health')}
          className={`px-3 py-1.5 text-xs font-bold rounded-xl transition whitespace-nowrap cursor-pointer ${
            activeTab === 'health' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Field Health
        </button>

        {/* Tab 1: Status */}"""

edit("src/components/analytics/FieldHeader.tsx", [
    ("export type WorkspaceTab = 'status' | 'report' | 'prescription' | 'data' | 'yield';",
     "export type WorkspaceTab = 'map' | 'health' | 'status' | 'report' | 'prescription' | 'data' | 'yield';"),
    ("        {/* Tab 1: Status */}", TAB_BTN),
])

edit("src/components/analytics/FieldAnalyticsWorkspace.tsx", [
    ("import { boundariesApi, type SavedField } from '../../services/boundariesApi';",
     "import { boundariesApi, type SavedField } from '../../services/boundariesApi';\nimport { FieldMapTab } from './health/FieldMapTab';\nimport { FieldHealthTab } from './health/FieldHealthTab';"),
    ("  onSelectField?: (id: string) => void;\n}\n\nexport interface ProgressiveBatchProgress",
     "  onSelectField?: (id: string) => void;\n  onNavigate?: (page: string) => void;\n}\n\nexport interface ProgressiveBatchProgress"),
    ("  onSelectField,\n}) => {\n  const [activeTab, setActiveTab] = useState<WorkspaceTab>('status');",
     "  onSelectField,\n  onNavigate,\n}) => {\n  const [activeTab, setActiveTab] = useState<WorkspaceTab>('map');"),
    ("      <main className=\"flex-1 px-6 md:px-8 pb-10 pt-2\">\n",
     "      <main className=\"flex-1 px-6 md:px-8 pb-10 pt-2\">\n        {activeTab === 'map' && (\n          <FieldMapTab\n            fieldId={fieldId}\n            onSelectField={onSelectField}\n            onOpenHealth={() => setActiveTab('health')}\n            onNavigate={onNavigate}\n          />\n        )}\n\n        {activeTab === 'health' && <FieldHealthTab fieldId={fieldId} notify={notify} />}\n\n"),
])

edit("src/App.tsx", [
    ("              onSelectField={(id) => setAnalyticsFieldId(id)}\n            />\n          )}\n          {page === 'ai-assistant'",
     "              onSelectField={(id) => setAnalyticsFieldId(id)}\n              onNavigate={(p) => navigate(p as PageKey)}\n            />\n          )}\n          {page === 'ai-assistant'"),
])
