from pathlib import Path
p=Path('src/components/analytics/health/HealthUi.tsx')
s=p.read_text(encoding='utf-8')
start=s.index('const SOURCE_WORD:')
end=s.index('/** Small',start)
new='''export function SourceTag({ p }: { p?: Provenance | string | null }) {
  const { t } = useI18n();
  if (!p || p === 'unavailable') return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-600">
      {t(`fieldAnalytics.sources.${p}`)}
    </span>
  );
}
'''
p.write_text(s[:start]+new+s[end:],encoding='utf-8')
