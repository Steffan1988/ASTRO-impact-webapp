import { useState, useCallback, useEffect } from 'react'
import { MapContainer, TileLayer, useMapEvents, Marker, Popup, Circle } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import SimulatorModal from '../components/SimulatorModal'

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const DARK_TILES  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
const ATTR = '© OpenStreetMap © CARTO'

function useIsDark() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') !== 'light'
  )
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') !== 'light')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return isDark
}

function DropHandler({ onDrop }) {
  const map = useMapEvents({})
  useEffect(() => {
    const container = map.getContainer()
    const onDragOver = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }
    const handleDrop = e => {
      e.preventDefault()
      const raw = e.dataTransfer.getData('asteroid')
      if (!raw) return
      const asteroid = JSON.parse(raw)
      const rect = container.getBoundingClientRect()
      const point = L.point(e.clientX - rect.left, e.clientY - rect.top)
      const latlng = map.containerPointToLatLng(point)
      onDrop(asteroid, latlng.lat, latlng.lng)
    }
    container.addEventListener('dragover', onDragOver)
    container.addEventListener('drop', handleDrop)
    return () => {
      container.removeEventListener('dragover', onDragOver)
      container.removeEventListener('drop', handleDrop)
    }
  }, [map, onDrop])
  return null
}

async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`,
      { headers: { 'User-Agent': 'ASTRO-impact/1.0' } }
    )
    const d = await r.json()
    return d.address?.country ?? null
  } catch { return null }
}

const ZONE_CIRCLES = result => {
  if (!result?.zones) return []
  const z = result.zones
  return [
    { key: 'seismisch',  r: (z.seismisch?.radius_km  ?? 0) * 1000, color: '#8b5cf6', label: z.seismisch?.label  ?? 'Seismisch',         desc: z.seismisch?.beschrijving },
    { key: 'licht',      r: (z.lichte_schade?.radius_km ?? 0) * 1000, color: '#3b82f6', label: z.lichte_schade?.label ?? 'Lichte schade', desc: z.lichte_schade?.beschrijving },
    { key: 'thermisch',  r: (z.thermisch?.radius_km  ?? 0) * 1000, color: '#ec4899', label: z.thermisch?.label  ?? 'Thermisch',         desc: z.thermisch?.beschrijving },
    { key: 'matig',      r: (z.matige_vern?.radius_km ?? 0) * 1000, color: '#f59e0b', label: z.matige_vern?.label ?? 'Matige verwoesting', desc: z.matige_vern?.beschrijving },
    { key: 'zwaar',      r: (z.zware_vern?.radius_km  ?? 0) * 1000, color: '#f97316', label: z.zware_vern?.label  ?? 'Zware verwoesting',   desc: z.zware_vern?.beschrijving },
    { key: 'vuurbal',    r: (z.vuurbal?.radius_km     ?? 0) * 1000, color: '#ef4444', label: z.vuurbal?.label     ?? 'Vuurbal',             desc: z.vuurbal?.beschrijving },
  ].filter(c => c.r > 0).sort((a, b) => b.r - a.r)
}

export default function WidgetSimulatorMap() {
  const isDark = useIsDark()
  const [modal, setModal] = useState(null)    // { asteroid, country, lat, lng }
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [impactPos, setImpactPos] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDrop = useCallback(async (asteroid, lat, lng) => {
    setResult(null)
    setImpactPos(null)
    const country = await reverseGeocode(lat, lng)
    setModal({ asteroid, country: country ?? 'Onbekend land', lat, lng })
  }, [])

  const handleConfirm = async ({ composition, target, country }) => {
    if (!modal) return
    setModal(null)
    setLoading(true)
    try {
      const r = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asteroid_id: modal.asteroid.id,
          country_name: country,
          composition,
          target_type: target,
          lat_override: modal.lat,
          lng_override: modal.lng,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Fout')
      setResult(d)
      setImpactPos({ lat: modal.lat, lng: modal.lng })
    } catch (e) {
      setResult({ error: e.message })
    }
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      {/* Drop hint */}
      <div style={{
        padding: '6px 10px',
        background: 'var(--surface2)',
        borderBottom: '1px solid var(--border)',
        fontSize: 12, color: 'var(--muted)',
        flexShrink: 0,
      }}>
        ☄️ Sleep een asteroïde vanuit de tabel en laat hem los op de kaart
      </div>

      {/* Map */}
      <div
        style={{
          flex: 1, position: 'relative', minHeight: 0,
          outline: isDragOver ? '2px solid var(--accent)' : '2px solid transparent',
          transition: 'outline 0.15s',
        }}
        onDragEnter={() => setIsDragOver(true)}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={() => setIsDragOver(false)}
      >
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 500,
            background: 'rgba(0,0,0,0.6)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(2px)',
            flexDirection: 'column', gap: 12,
            animation: 'fadeIn 0.15s ease',
          }}>
            <div style={{ fontSize: 36, animation: 'impact-pulse 1.2s ease-in-out infinite' }}>☄️</div>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Simulatie berekenen...</span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Collins et al. (2005) impactmodel</span>
          </div>
        )}

        <MapContainer
          center={[20, 10]} zoom={2}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
          attributionControl={false}
        >
          <TileLayer url={isDark ? DARK_TILES : LIGHT_TILES} attribution={ATTR} />
          <DropHandler onDrop={handleDrop} />

          {impactPos && result && !result.error && (
            <>
              {ZONE_CIRCLES(result).map(c => (
                <Circle
                  key={c.key}
                  center={[impactPos.lat, impactPos.lng]}
                  radius={c.r}
                  pathOptions={{ color: c.color, fillColor: c.color, fillOpacity: 0.10, weight: 1.5 }}
                >
                  {c.label && (
                    <Popup>
                      <div style={{ fontSize: 13, minWidth: 200 }}>
                        <strong style={{ color: c.color }}>● {c.label}</strong><br />
                        <span style={{ color: '#666', fontSize: 12 }}>Radius: {(c.r / 1000).toFixed(1)} km</span>
                        {c.desc && <><br /><span style={{ fontSize: 12 }}>{c.desc}</span></>}
                      </div>
                    </Popup>
                  )}
                </Circle>
              ))}
              <Marker position={[impactPos.lat, impactPos.lng]}>
                <Popup>
                  <div style={{ minWidth: 200, fontSize: 13, lineHeight: 1.6 }}>
                    <strong style={{ fontSize: 14 }}>💥 {result.land?.naam ?? 'Inslag'}</strong>
                    {result.land?.city_naam && <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{result.land.city_naam}</div>}
                    <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '4px 0' }} />
                    <div>⚡ Energie: <strong>{result.energie?.megaton_tnt?.toFixed(1) ?? '—'} Mt TNT</strong></div>
                    <div>💀 Slachtoffers: <strong>{Number(result.schade?.slachtoffers ?? 0).toLocaleString('nl-NL')}</strong></div>
                    <div>📐 Magnitude: <strong>M {result.magnitude?.toFixed(1) ?? '—'}</strong></div>
                    {(result.impact_params?.crater_diameter_km ?? 0) > 0 && (
                      <div>🕳️ Krater: <strong>Ø {result.impact_params.crater_diameter_km.toFixed(1)} km</strong></div>
                    )}
                    {result.impact_params?.airburst && (
                      <div style={{ color: '#f97316' }}>💨 Airburst op {result.impact_params.airburst_alt_km?.toFixed(0)} km</div>
                    )}
                    {result.chicxulub?.extinction_event && (
                      <div style={{ color: 'red', fontWeight: 700, marginTop: 4 }}>⚠ EXTINCTIE-EVENT</div>
                    )}
                  </div>
                </Popup>
              </Marker>
            </>
          )}
        </MapContainer>
      </div>

      {/* Result panel */}
      {result && (
        <div style={{
          flexShrink: 0, padding: '10px 12px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface2)',
          fontSize: 12,
        }}>
          {result.error
            ? <p style={{ color: 'var(--danger)' }}>Fout: {result.error}</p>
            : <ResultBar r={result} onClear={() => { setResult(null); setImpactPos(null) }} />
          }
        </div>
      )}

      {modal && (
        <SimulatorModal
          asteroid={modal.asteroid}
          country={modal.country}
          lat={modal.lat}
          lng={modal.lng}
          onClose={() => setModal(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  )
}

function ResultBar({ r, onClear }) {
  const ext      = r.chicxulub?.extinction_event
  const airburst = r.impact_params?.airburst

  const stats = [
    { icon: '⚡', label: 'Energie',      val: `${r.energie?.megaton_tnt?.toFixed(1) ?? '—'} Mt`,  color: 'var(--warning)' },
    { icon: '💀', label: 'Slachtoffers', val: Number(r.schade?.slachtoffers ?? 0).toLocaleString('nl-NL'), color: 'var(--danger)' },
    { icon: '📐', label: 'Magnitude',    val: `M ${r.magnitude?.toFixed(1) ?? '—'}`,              color: 'var(--accent)' },
    { icon: '🕳️', label: 'Krater',       val: (r.impact_params?.crater_diameter_km ?? 0) > 0.1
        ? `Ø ${r.impact_params.crater_diameter_km.toFixed(1)} km` : '—',                           color: 'var(--muted)' },
  ]

  return (
    <div style={{ animation: 'fadeInUp 0.2s ease' }}>
      {ext && (
        <div style={{
          marginBottom: 6, padding: '4px 10px', borderRadius: 6,
          background: 'rgba(239,68,68,0.15)', border: '1px solid var(--danger)',
          fontSize: 12, fontWeight: 700, color: 'var(--danger)', textAlign: 'center',
        }}>
          ⚠ EXTINCTIE-EVENT — Chicxulub-niveau. Mogelijke massa-extinctie.
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {airburst && (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(249,115,22,0.15)', color: '#f97316', fontWeight: 600 }}>
            💨 Airburst {r.impact_params.airburst_alt_km?.toFixed(0)} km
          </span>
        )}
        {stats.map(({ icon, label, val, color }) => val !== '—' ? (
          <span key={label} style={{ fontSize: 12, color: 'var(--muted)' }}>
            {icon} {label}: <strong style={{ color }}>{val}</strong>
          </span>
        ) : null)}
        <button
          onClick={onClear}
          style={{
            marginLeft: 'auto', padding: '3px 10px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--muted)', cursor: 'pointer', fontSize: 12,
          }}
        >
          ✕ Wis
        </button>
      </div>
    </div>
  )
}
