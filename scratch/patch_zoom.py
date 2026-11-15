from pathlib import Path

p = Path("src/components/analytics/health/FieldMapTab.tsx")
s = p.read_text(encoding="utf-8")
s = s.replace("import { GeoJSON, ImageOverlay, MapContainer, TileLayer, useMap } from 'react-leaflet';",
              "import { GeoJSON, ImageOverlay, MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet';", 1)
s = s.replace('<MapContainer center={[51.77, 14.28]} zoom={13} className="h-full w-full" zoomControl>',
              '<MapContainer center={[51.77, 14.28]} zoom={13} className="h-full w-full" zoomControl={false}>\n          <ZoomControl position="bottomright" />', 1)
s = s.replace("        <ExternalLink size={9} className=\"ml-1 inline\" />\n", "", 1)
s = s.replace("import { CloudRain, Droplets, ExternalLink, FileText,", "import { CloudRain, Droplets, FileText,", 1)
p.write_text(s, encoding="utf-8")
print("ok" if "ZoomControl position" in s else "FAILED")

e = Path("scratch/e2e_field_analytics.py")
t = e.read_text(encoding="utf-8")
t = t.replace('    pg.wait_for_timeout(6000)\n    pg.screenshot(path=str(OUT / "01_field_map.png"))',
              '    pg.get_by_text("Since rain").wait_for(timeout=120000)\n    pg.wait_for_timeout(1500)\n    pg.screenshot(path=str(OUT / "01_field_map.png"))', 1)
e.write_text(t, encoding="utf-8")
