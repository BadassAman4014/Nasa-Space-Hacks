from pathlib import Path
p=Path('src/components/dashboard/Dashboard.tsx')
s=p.read_text(encoding='utf-8')
start=s.index('      {/* Left Data & Metrics Panel')
end=s.index('      {/* Right Leaflet Map Stage */}',start)
new='''      <section
        className={`dash-panel ${panelCollapsed ? 'dash-panel--collapsed' : ''}`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="dash-panel-pinned">
          <button className="dash-panel-collapse" onClick={() => setPanelCollapsed((value) => !value)} title={panelCollapsed ? 'Expand farm panel' : 'Collapse farm panel'} aria-label={panelCollapsed ? 'Expand farm panel' : 'Collapse farm panel'}>
            {panelCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          {!panelCollapsed && <>
            <PropertyHeader
              activeFarm={activeFarm}
              farms={farms}
              selectedFarmId={selectedFarmId}
              onSelectFarm={(farmId) => { setSelectedFarmId(farmId); setFarmMenuOpen(false); setPanelView('list'); }}
              farmMenuOpen={farmMenuOpen}
              setFarmMenuOpen={setFarmMenuOpen}
              totalAreaHa={totalAreaHa}
              locationLabel={props.selectedLocationLabel}
              onAddField={() => props.navigate('fields')}
              onOpenDeleteFarm={(farm) => setDeleteConfirmFarm(farm)}
              onOpenManageFarms={() => setManageFarmsModalOpen(true)}
            />
            <FieldWeatherChip field={selectedField || fields[0] || null} onOpenWeather={() => props.navigate('weather')} />
          </>}
        </div>

        {!panelCollapsed && <div className="dash-panel-body">
          {loading ? <DashboardPanelSkeleton /> : loadError ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{loadError}</p><button onClick={() => loadData()} className="mt-3 font-bold underline">Retry</button></div> : fields.length === 0 ? <EmptyDashboardState onAddField={() => props.navigate('fields')} /> : panelView === 'list' ? (
            <SavedFieldsList
              fields={fields}
              selectedFieldId={selectedFieldId}
              onSelectField={(id) => { setSelectedFieldId(id); setPanelView('summary'); }}
              onAddField={() => props.navigate('fields')}
            />
          ) : selectedField ? (
            <DashboardFieldSummary
              field={selectedField}
              onBack={() => setPanelView('list')}
              onOpenAnalytics={() => props.navigate('analytics', selectedField.id)}
              onViewProfile={() => { sessionStorage.setItem('farmily_analytics_tab', 'health'); props.navigate('analytics', selectedField.id); }}
              notify={props.notify}
            />
          ) : null}
        </div>}
      </section>

'''
s=s[:start]+new+s[end:]
# Remove the floating selected field card on the map; the side panel now owns field details.
marker='      {/* Selected Field Card */}'
card_start=s.find(marker)
if card_start>=0:
    card_end=s.index('      {/* Map Floating Controls */}',card_start)
    s=s[:card_start]+s[card_end:]
p.write_text(s,encoding='utf-8')
