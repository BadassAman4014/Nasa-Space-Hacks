from pathlib import Path
p=Path('src/components/dashboard/FieldSoilCard.tsx')
s=p.read_text(encoding='utf-8')
start=s.index('          {/* Properties Grid */}')
end=s.index('        </div>\n      )}',start)
new='''          {/* Uniform 2-column soil metrics */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SoilMetric label={t('soilCard.soilPh')} value={topsoil.ph.toFixed(1)} unit="pH" meaning={topsoil.ph < 5.5 ? t('soilCard.acidic') : topsoil.ph > 7.5 ? t('soilCard.alkaline') : t('soilCard.optimal')} tone={topsoil.ph >= 5.5 && topsoil.ph <= 7.5 ? 'green' : 'amber'} />
            <SoilMetric label={t('soilCard.organicCarbon')} value={topsoil.organic_carbon_g_kg.toFixed(1)} unit="g/kg" meaning={`${topsoil.organic_carbon_pct.toFixed(2)}% SOC`} />
            <SoilMetric label={t('soilCard.bulkDensity')} value={topsoil.bulk_density_g_cm3.toFixed(2)} unit="g/cm³" meaning={topsoil.bulk_density_g_cm3 > 1.6 ? 'Compaction risk' : 'Normal for sandy loam'} tone={topsoil.bulk_density_g_cm3 > 1.6 ? 'amber' : 'green'} />
            <SoilMetric label={t('soilCard.cec')} value={topsoil.cec_mmol_kg.toFixed(1)} unit="mmol(c)/kg" meaning={t('soilCard.nutrientRetention')} />
            <SoilMetric label={t('soilCard.totalNitrogen')} value={topsoil.total_nitrogen_g_kg.toFixed(2)} unit="g/kg" meaning="Total soil nitrogen" info="Total N in soil, not the N available to crops." />
            <SoilMetric label={t('soilCard.cnRatio')} value={topsoil.total_nitrogen_g_kg > 0 ? (topsoil.organic_carbon_g_kg / topsoil.total_nitrogen_g_kg).toFixed(1) : '—'} meaning="Organic carbon relative to total nitrogen" />
          </div>
'''
s=s[:start]+new+s[end:]
# Technical footer becomes disclosure
old_start=s.index('      {/* Provenance & Citation Metadata Footer */}')
old_end=s.index('    </div>\n  );',old_start)
footer='''      <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <summary className="cursor-pointer font-bold text-slate-700">Data details</summary>
        <div className="mt-2 space-y-1">
          <div className="flex justify-between gap-3"><span>{t('soilCard.sourceCitation')}</span><span>{t('soilCard.coverage', { pct: profile.coverage_percentage })}</span></div>
          {profile.extraction_date && <div className="flex justify-between gap-3"><span>{t('soilCard.extractedDate', { date: formatDate(profile.extraction_date) })}</span><span>{t('soilCard.cells', { count: topsoil?.valid_pixel_count || 1 })}</span></div>}
        </div>
      </details>
'''
s=s[:old_start]+footer+s[old_end:]
p.write_text(s,encoding='utf-8')
