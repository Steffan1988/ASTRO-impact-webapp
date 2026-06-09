import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import InfoTip from './InfoTip'

const BORDERS_URL   = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json'
const BORDERS_ALT   = 'https://unpkg.com/world-atlas@2/countries-110m.json'

const GEOCODE_TIP =
  'Reverse geocoding zet geografische coördinaten (breedtegraad en lengtegraad) om naar een leesbaar adres. ' +
  'ASTRO-impact stuurt de lat/lng van de vuurbol naar de OpenStreetMap Nominatim API, die antwoordt met het ' +
  'dichtstbijzijnde land, stad of waterlichaam. Dit alles gaat automatisch op de achtergrond zodra je een vuurbol opent.'

// lat/lng → 3D point matching Three.js SphereGeometry UV convention.
// Three.js SphereGeometry: x = -cos(phi)*sin(theta), y = cos(theta), z = sin(phi)*sin(theta)
// where phi = azimuthal around Y (0 at -X), theta = polar from +Y.
function latLngToVec3(lat, lng, r = 1) {
  const phi   = (lng + 180) * (Math.PI / 180)
  const theta = (90 - lat)  * (Math.PI / 180)
  return new THREE.Vector3(
    -r * Math.cos(phi) * Math.sin(theta),
     r * Math.cos(theta),
     r * Math.sin(phi) * Math.sin(theta)
  )
}

// Decode TopoJSON arcs → array of [lng, lat] polylines.
function topoToPolylines(topo) {
  const { scale: [sx, sy], translate: [tx, ty] } = topo.transform
  return topo.arcs.map(arc => {
    let ax = 0, ay = 0
    return arc.map(([dx, dy]) => { ax += dx; ay += dy; return [ax * sx + tx, ay * sy + ty] })
  })
}

const CW = 2048
const CH = 1024

// Draw filled land polygons from TopoJSON objects.land onto a canvas in equirectangular projection.
function drawLandFill(ctx, topo) {
  const { scale: [sx, sy], translate: [tx, ty] } = topo.transform

  const decoded = topo.arcs.map(arc => {
    let ax = 0, ay = 0
    return arc.map(([dx, dy]) => { ax += dx; ay += dy; return [ax * sx + tx, ay * sy + ty] })
  })

  function decodeRing(idxs) {
    const pts = []
    for (const i of idxs) {
      const arc = i >= 0 ? decoded[i] : [...decoded[~i]].reverse()
      pts.push(...arc.slice(0, -1))  // drop shared endpoint to avoid duplicate
    }
    return pts
  }

  ctx.fillStyle = '#2d7a3a'
  const geometries = topo.objects.land.type === 'GeometryCollection'
    ? topo.objects.land.geometries
    : [topo.objects.land]

  for (const geom of geometries) {
    const polys = geom.type === 'Polygon' ? [geom.arcs] : geom.arcs
    for (const poly of polys) {
      ctx.beginPath()
      for (const ringIdxs of poly) {
        const pts = decodeRing(ringIdxs)
        pts.forEach(([lng, lat], i) => {
          const x = ((lng + 180) / 360) * CW
          const y = ((90 - lat) / 180) * CH
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        })
        ctx.closePath()
      }
      ctx.fill('evenodd')
    }
  }
}

// Build opaque THREE.LineSegments for country border polylines.
// LineSegments avoids all transparency issues — same render path as wireframe (which worked).
function buildBorderLines(polylines) {
  const pos = []
  for (const pts of polylines) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [lng0, lat0] = pts[i]
      const [lng1, lat1] = pts[i + 1]
      if (Math.abs(lng1 - lng0) > 180) continue  // skip antimeridian seam
      const a = latLngToVec3(lat0, lng0, 1.002)
      const b = latLngToVec3(lat1, lng1, 1.002)
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff })
  return new THREE.LineSegments(geo, mat)
}

// ── 3D Globe (WebGL) ──────────────────────────────────────────────────────────
function GlobeCanvas({ lat, lng }) {
  const mountRef = useRef(null)

  useEffect(() => {
    const el = mountRef.current
    if (!el) return
    const W = el.clientWidth  || 560
    const H = el.clientHeight || 420

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.appendChild(renderer.domElement)

    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100)
    camera.position.z = 3.5

    scene.add(new THREE.AmbientLight(0xffffff, 0.45))
    const sun = new THREE.DirectionalLight(0xffffff, 1.1)
    sun.position.set(4, 3, 5)
    scene.add(sun)

    // Earth canvas texture: ocean fill initially, land fill added when TopoJSON loads.
    // Using canvas avoids all URL texture 404 issues and transparency complications.
    const eCanvas = document.createElement('canvas')
    eCanvas.width = CW; eCanvas.height = CH
    const eCtx = eCanvas.getContext('2d')
    eCtx.fillStyle = '#0e3a5c'
    eCtx.fillRect(0, 0, CW, CH)
    const eTex = new THREE.CanvasTexture(eCanvas)

    // polygonOffset pushes earth surface back so border lines (r=1.002) win depth test
    const earthGeo = new THREE.SphereGeometry(1, 64, 64)
    const earthMat = new THREE.MeshPhongMaterial({
      map: eTex, shininess: 18,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    })
    const earth    = new THREE.Mesh(earthGeo, earthMat)
    scene.add(earth)

    // Atmosphere glow
    const atmGeo = new THREE.SphereGeometry(1.04, 32, 32)
    const atmMat = new THREE.MeshPhongMaterial({
      color: 0x3388cc, transparent: true, opacity: 0.12, side: THREE.FrontSide,
    })
    scene.add(new THREE.Mesh(atmGeo, atmMat))

    // ── Country fill + border lines ───────────────────────────────────────
    let mounted = true
    let borderMesh = null

    const tryLoad = url =>
      fetch(url)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
        .then(topo => {
          if (!mounted) return
          drawLandFill(eCtx, topo)
          eTex.needsUpdate = true
          borderMesh = buildBorderLines(topoToPolylines(topo))
          earth.add(borderMesh)
        })

    tryLoad(BORDERS_URL)
      .catch(() => tryLoad(BORDERS_ALT))
      .catch(err => console.warn('[GlobeModal] border fetch failed:', err))

    // ── Marker ──────────────────────────────────────────────────────────────
    const hasPos    = lat != null && lng != null
    const markerDir = hasPos ? latLngToVec3(lat, lng).normalize() : new THREE.Vector3(0, 0, 1)
    const surfPt    = markerDir.clone().multiplyScalar(1.015)

    // Fireball marker: bright core + orange mid + pulsing red halo (additive blending for glow)
    const coreGeo = new THREE.SphereGeometry(0.020, 12, 12)
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffff99 })
    const core    = new THREE.Mesh(coreGeo, coreMat)
    core.position.copy(surfPt)
    earth.add(core)

    const midGeo  = new THREE.SphereGeometry(0.038, 12, 12)
    const midMat  = new THREE.MeshBasicMaterial({
      color: 0xff7700, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const mid     = new THREE.Mesh(midGeo, midMat)
    mid.position.copy(surfPt)
    earth.add(mid)

    const haloGeo = new THREE.SphereGeometry(0.062, 12, 12)
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xff2200, transparent: true, opacity: 0.40,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const halo    = new THREE.Mesh(haloGeo, haloMat)
    halo.position.copy(surfPt)
    earth.add(halo)

    if (hasPos) {
      earth.setRotationFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(markerDir, new THREE.Vector3(0, 0, 1))
      )
    }
    const baseQuat  = earth.quaternion.clone()
    const worldY    = new THREE.Vector3(0, 1, 0)
    const spinQuat  = new THREE.Quaternion()
    let   spinAngle = 0

    let animId
    let prevTime = performance.now()

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const now   = performance.now()
      const delta = (now - prevTime) / 1000
      prevTime    = now

      spinAngle += delta * 0.28
      spinQuat.setFromAxisAngle(worldY, spinAngle)
      earth.quaternion.multiplyQuaternions(spinQuat, baseQuat)

      const t = now / 1000
      halo.scale.setScalar(1 + 0.30 * Math.abs(Math.sin(t * 3.5)))
      haloMat.opacity = 0.25 + 0.25 * Math.abs(Math.sin(t * 3.5))
      midMat.opacity  = 0.60 + 0.20 * Math.abs(Math.sin(t * 5.2))

      renderer.render(scene, camera)
    }
    animate()

    return () => {
      mounted = false
      cancelAnimationFrame(animId)
      renderer.dispose()
      earthGeo.dispose(); earthMat.dispose(); eTex.dispose()
      atmGeo.dispose();   atmMat.dispose()
      coreGeo.dispose(); coreMat.dispose()
      midGeo.dispose();  midMat.dispose()
      haloGeo.dispose(); haloMat.dispose()
      if (borderMesh) { borderMesh.geometry.dispose(); borderMesh.material.dispose() }
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
    }
  }, [lat, lng])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export default function GlobeModal({ fireball, onClose }) {
  const [location, setLocation] = useState(null)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const { lat, lng } = fireball
    if (lat == null || lng == null) return
    setLocation(null)
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=nl`)
      .then(r => r.json())
      .then(d => {
        const a    = d.address ?? {}
        const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state_district ?? null
        const country = a.country ?? null
        const name = (d.name ?? '').toLowerCase()
        const isWater = ['ocean', 'sea', 'oceaan', 'zee', 'pacific', 'atlantic', 'indian', 'arctic'].some(w => name.includes(w))
        setLocation({ city, country, waterName: isWater ? d.name : null })
      })
      .catch(() => setLocation({ city: null, country: null, waterName: null }))
  }, [fireball.lat, fireball.lng])

  const hasPos      = fireball.lat != null && fireball.lng != null
  const energy      = Number(fireball.energy_kt ?? 0)
  const energyColor = energy >= 100 ? 'var(--danger)' : energy >= 10 ? 'var(--warning)' : energy >= 1 ? '#f97316' : 'var(--text)'

  const locationLine = (() => {
    if (!hasPos) return null
    if (!location) return '📍 Locatie ophalen…'
    if (location.waterName) return `🌊 ${location.waterName}`
    const parts = [location.city, location.country].filter(Boolean)
    return parts.length > 0
      ? `📍 ${parts.join(', ')}`
      : `📍 ${Number(fireball.lat).toFixed(2)}°, ${Number(fireball.lng).toFixed(2)}°`
  })()

  const stats = [
    ['⚡ Energie',  energy > 0 ? `${energy.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} kt TNT` : '—', energyColor],
    ['💥 Impact',   Number(fireball.impact_e_kt ?? 0) > 0 ? `${Number(fireball.impact_e_kt).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} kt` : '—', 'var(--text)'],
    ['🚀 Snelheid', Number(fireball.vel_kms ?? 0) > 0 ? `${Number(fireball.vel_kms).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} km/s` : '—', 'var(--text)'],
    ['📏 Hoogte',   Number(fireball.alt_km ?? 0) > 0 ? `${Number(fireball.alt_km).toLocaleString('nl-NL', { maximumFractionDigits: 0 })} km` : '—', 'var(--text)'],
    ['📍 Lat',      hasPos ? `${Number(fireball.lat).toFixed(2)}°` : '—', 'var(--muted)'],
    ['📍 Lon',      hasPos ? `${Number(fireball.lng).toFixed(2)}°` : '—', 'var(--muted)'],
  ]

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 560, maxWidth: 'calc(100vw - 24px)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,0.65)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>🌍 Vuurbol locatie</span>
            <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>{fireball.date ?? 'datum onbekend'}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 20, lineHeight: 1, padding: '2px 8px' }}>×</button>
        </div>

        <div style={{ height: 420, background: '#020810', position: 'relative' }}>
          {hasPos
            ? <GlobeCanvas lat={fireball.lat} lng={fireball.lng} />
            : (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span style={{ fontSize: 40 }}>📍</span>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>Geen locatiedata beschikbaar voor deze vuurbol</span>
              </div>
            )
          }
        </div>

        {hasPos && (
          <div style={{
            padding: '10px 18px', background: 'var(--surface2)', borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)', fontWeight: 600 }}>
              {locationLine ?? ''}
              <InfoTip text={GEOCODE_TIP} />
            </span>
            <span style={{ color: 'var(--muted)', fontSize: 11 }}>
              {Number(fireball.lat).toFixed(2)}° · {Number(fireball.lng).toFixed(2)}°
            </span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, padding: '12px 16px' }}>
          {stats.map(([label, val, color]) => (
            <div key={label} style={{ padding: '6px 10px', background: 'var(--surface2)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color, marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '0 16px 14px', textAlign: 'right' }}>
          <button
            onClick={onClose}
            style={{ padding: '7px 24px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
          >Sluiten</button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
