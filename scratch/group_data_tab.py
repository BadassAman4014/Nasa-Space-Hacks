from pathlib import Path
p=Path('src/components/analytics/DataCatalogTab.tsx')
s=p.read_text(encoding='utf-8')
start=s.index('      {/* VIEW 1: NASA Challenge Datasets Hub')
end=s.index('      {/* VIEW 2: Local Operational Layers */}',start)
new='''      {/* Grouped source catalogue */}
      {activeCatalogView === 'challenge_hub' && (
        <div className="space-y-4">
          <div className="relative w-full">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" placeholder={t('fieldAnalytics.data.search')} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15" />
          </div>
          {loadingCatalog && <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{[0,1,2,3].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl bg-white" />)}</div>}
          {catalogError && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{catalogError}</div>}
          {!loadingCatalog && [
            { id: 'weather', label: t('fieldAnalytics.data.weather'), categories: ['climate', 'water'] },
            { id: 'soil', label: t('fieldAnalytics.data.soil'), categories: ['soil'] },
            { id: 'satellite', label: t('fieldAnalytics.data.satellite'), categories: ['satellite', 'ecology', 'topography'] },
            { id: 'inputs', label: t('fieldAnalytics.data.inputs'), categories: ['economics'] },
          ].map((group) => {
            const datasets = filteredChallengeDatasets.filter((dataset) => group.categories.includes(dataset.category));
            const showInputs = group.id === 'inputs';
            if (!datasets.length && !showInputs) return null;
            return (
              <details key={group.id} open className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4"><span className="text-base font-extrabold text-slate-950">{group.label} <span className="ml-1 text-sm font-semibold text-slate-500">({datasets.length + (showInputs ? 1 : 0)})</span></span><ChevronDown size={18} className="text-slate-500 transition group-open:rotate-180" /></summary>
                <div className="grid grid-cols-1 gap-4 border-t border-slate-100 p-6 md:grid-cols-2 xl:grid-cols-3">
                  {showInputs && <button type="button" onClick={onOpenInputs} className="flex min-h-40 flex-col items-start justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-left transition hover:border-emerald-500"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-emerald-700"><DollarSign size={19} /></span><span><strong className="block text-sm text-slate-950">{t('fieldAnalytics.data.cropInputs')}</strong><span className="mt-1 block text-xs text-slate-600">{t('fieldAnalytics.inputs.subtitle')}</span></span></button>}
                  {datasets.map((dataset) => {
                    const querying = queryingDatasetId === dataset.id;
                    return <article key={dataset.id} className="flex min-h-40 flex-col rounded-2xl border border-slate-200 p-5"><div className="flex items-start justify-between gap-3"><span className="flex items-center gap-2 text-xs font-bold text-slate-600">{getCategoryIcon(dataset.category)}{dataset.agency}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{dataset.spatial_resolution}</span></div><h3 className="mt-3 text-sm font-extrabold text-slate-950">{dataset.name}</h3><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">{dataset.agricultural_application}</p><div className="mt-auto flex gap-2 pt-4"><button onClick={() => handleQuerySingleDataset(dataset)} disabled={querying || !dataset.is_live_queryable} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300">{querying ? 'Loading…' : dataset.is_live_queryable ? 'Open for field' : 'Unavailable'}</button><a href={dataset.official_url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-slate-200 p-2 text-slate-600" aria-label="Official documentation"><ExternalLink size={15} /></a></div></article>;
                  })}
                </div>
              </details>
            );
          })}
          {!loadingCatalog && !catalogError && filteredChallengeDatasets.length === 0 && !searchQuery.trim() && <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">{t('fieldAnalytics.data.noResults')}</div>}
          {!loadingCatalog && searchQuery.trim() && filteredChallengeDatasets.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">{t('fieldAnalytics.data.noResults')}</div>}
        </div>
      )}

'''
s=s[:start]+new+s[end:]
p.write_text(s,encoding='utf-8')
