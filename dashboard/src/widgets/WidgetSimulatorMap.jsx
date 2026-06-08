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
    { key: 'seismisch',  r: (z.seismisch?.radius_km  ?? 0) * 1000, color: '#8b5cf6' },
    { key: 'licht',      r: (z.lichte_schade?.radius_km ?? 0) * 1000, color: '#3b82f6' },
    { key: 'thermisch',  r: (z.thermisch?.radius_km  ?? 0) * 1000, color: '#ec4899' },
    { key: 'matig',      r: (z.matige_vern?.radius_km ?? 0) * 1000, color: '#f59e0b' },
    { key: 'zwaar',      r: (z.zware_vern?.radius_km  ?? 0) * 1000, color: '#f97316' },
    { key: 'vuurbal',    r: (z.vuurbal?.radius_km     ?? 0) * 1000, color: '#ef4444' },
  ].filter(c => c.r > 0).sort((a, b) => b.r - a.r)
}

export default function WidgetSimulatorMap() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light'
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
            background: 'rgba(0,0,0,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#fff', fontSize: 14 }}>🚀 Simuleren...</span>
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
                  pathOptions={{ color: c.color, fillColor: c.color, fillOpacity: 0.12, weight: 1.5 }}
                />
              ))}
              <Marker position={[impactPos.lat, impactPos.lng]}>
                <Popup>
                  <div style={{ minWidth: 180, fontSize: 13 }}>
                    <strong>💥 Inslag</strong><br />
                    Energie: {result.energie?.megaton_tnt?.toFixed(1) ?? '—'} Mt TNT<br />
                    Slachtoffers: {result.schade?.slachtoffers?.toLocaleString('nl-NL') ?? '—'}<br />
                    Magnitude: {result.magnitude?.toFixed(1) ?? '—'}<br />
                    Krater: Ø {result.impact_params?.crater_diameter_km?.toFixed(1) ?? '—'} km
                    {result.chicxulub?.extinction_event && <><br /><strong style={{ color: 'red' }}>⚠ EXTINCTIE-EVENT</strong></>}
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
  const stats = [
    ['Energie',      `${r.energie?.megaton_tnt?.toFixed(1) ?? '—'} Mt`],
    ['Slachtoffers', r.schade?.slachtoffers?.toLocaleString('nl-NL') ?? '—'],
    ['Magnitude',    r.magnitude?.toFixed(1) ?? '—'],
    ['Krater',       r.impact_params?.crater_diameter_km ? `Ø ${r.impact_params.crater_diameter_km.toFixed(1)} km` : '—'],
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      {r.chicxulub?.extinction_event && (
        <span style={{ color: 'var(--danger)', fontWeight: 700 }}>⚠ EXTINCTIE</span>
      )}
      {stats.map(([k, v]) => (
        <span key={k} style={{ color: 'var(--muted)' }}>
          {k}: <strong style={{ color: 'var(--text)' }}>{v}</strong>
        </span>
      ))}
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
  )
}
