import re
from pathlib import Path


def cut(s, start_marker, end_marker, keep_end=True, label=""):
    a = s.index(start_marker)
    b = s.index(end_marker, a)
    assert a < b, label
    return s[:a] + (s[b:] if keep_end else s[b + len(end_marker):])


# ------------------------------------------------------------------ FieldHeader
p = Path("src/components/analytics/FieldHeader.tsx")
s = p.read_text(encoding="utf-8")
crlf = "\r\n" in s
s = s.replace("\r\n", "\n")

# tabs: drop Field Report, Prescription Maps (Tab 2 + Tab 3) and Yield Analysis (Tab 5)
s = cut(s, "        {/* Tab 2: Field Report */}", "        {/* Tab 4: Data +23 */}", label="tabs 2-3")
s = cut(s, "        {/* Tab 5: Yield Analysis */}", "      </div>\n\n      {/* Right: Quick Action Buttons", label="tab 5")
# right-hand action row
a = s.index("      {/* Right: Quick Action Buttons (OneSoil Yield Style) */}")
b = s.index("    </header>")
s = s[:a].rstrip() + "\n    </header>" + s[b + len("    </header>"):]

s = s.replace("export type WorkspaceTab = 'map' | 'health' | 'status' | 'report' | 'prescription' | 'data' | 'yield';",
              "export type WorkspaceTab = 'map' | 'health' | 'status' | 'data';")
# props no longer needed
for line in ("  onExport: () => void;\n", "  onRefresh: () => void;\n", "  refreshing: boolean;\n", "  notify?: (msg: string) => void;\n",
             "  onExport,\n", "  onRefresh,\n", "  refreshing,\n", "  notify = () => {},\n"):
    s = s.replace(line, "", 1)
s = s.replace("  const [moreMenuOpen, setMoreMenuOpen] = useState(false);\n", "", 1)
s = s.replace("import { LanguageSwitcher } from '../common/LanguageSwitcher';\n", "", 1)

# drop lucide icons that are no longer referenced
m = re.search(r"import \{([^}]*)\} from 'lucide-react';", s)
names = [n.strip() for n in m.group(1).split(",") if n.strip()]
body = s[m.end():]
keep = [n for n in names if re.search(rf"\b{n}\b", body)]
dropped = [n for n in names if n not in keep]
s = s[:m.start()] + "import {\n  " + ",\n  ".join(keep) + ",\n} from 'lucide-react';" + s[m.end():]
p.write_text(s.replace("\n", "\r\n") if crlf else s, encoding="utf-8", newline="")
print("FieldHeader: dropped icons ->", dropped)

# ------------------------------------------------------------------ Workspace
p = Path("src/components/analytics/FieldAnalyticsWorkspace.tsx")
s = p.read_text(encoding="utf-8")
crlf = "\r\n" in s
s = s.replace("\r\n", "\n")
for line in ("import { FieldReportTab } from './FieldReportTab';\n", "import { PrescriptionMapsTab } from './PrescriptionMapsTab';\n",
             "import { YieldAnalysisTab } from './YieldAnalysisTab';\n"):
    assert line in s, line
    s = s.replace(line, "", 1)

# render blocks
s = cut(s, "        {activeTab === 'report' && fullReport && (", "        {activeTab === 'data' && (", label="report+prescription")
s = cut(s, "        {activeTab === 'yield' && (", "      </main>", label="yield")
# handlers only used by the removed tabs
s = cut(s, "  const handleToggleObservation = async", "  if (loading) {", label="handlers")
# header props
for line in ("        onExport={handleExport}\n", "        onRefresh={() => loadAllData(true)}\n", "        refreshing={refreshing}\n", "        notify={notify}\n"):
    assert line in s, line
    s = s.replace(line, "", 1)
p.write_text(s.replace("\n", "\r\n") if crlf else s, encoding="utf-8", newline="")
print("Workspace patched")

# ------------------------------------------------------------------ delete orphaned components
for f in ("FieldReportTab", "PrescriptionMapsTab", "YieldAnalysisTab"):
    Path(f"src/components/analytics/{f}.tsx").unlink()
    print("deleted", f)
