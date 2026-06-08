import { useEffect, useState } from 'react'

const COMPOSITIONS = ['stony', 'iron', 'cometary']
const TARGET_TYPES = ['rock', 'ocean', 'soft']
const NL = { stony: 'Steen', iron: 'IJzer', cometary: 'Komeet', rock: 'Rots', ocean: 'Oceaan', soft: 'Zacht' }

export default function WidgetSimulator() {
  const [asteroids, setAsteroids] = useState([])
  const [countries, setCountries] = useState([])
  const [form, setForm] = useState({
    asteroid_id: '', country_name: '', angle: 45,
    composition: 'stony', target_type: 'rock',
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/asteroids').then(r => r.json())
      .then(d => setAsteroids(Array.isArray(d) ? d : d.data ?? []))
      .catch(() => {})
    fetch('/api/countries').then(r => r.json())
      .then(d => setCountries(Array.isArray(d) ? d : d.landen ?? d.data ?? []))
      .catch(() => {})
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const run = async () => {
    setLoading(true); setError(null); setResult(null)
    try {
      const r = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Onbekende fout')
      setResult(d)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Asteroïde">
          <select value={form.asteroid_id} onChange={e => set('asteroid_id', e.target.value)} style={sel}>
            <option value="">— kies —</option>
            {asteroids.slice(0, 200).map(a => (
              <option key={a.id} value={a.id}>{a.name ?? a.full_name ?? a.id}</option>
            ))}
          </select>
        </Field>

        <Field label="Land">
          <select value={form.country_name} onChange={e => set('country_name', e.target.value)} style={sel}>
            <option value="">— kies —</option>
            {countries.map(c => (
              <option key={c.naam ?? c.name} value={c.naam ?? c.name}>{c.naam ?? c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Samenstelling">
          <select value={form.composition} onChange={e => set('composition', e.target.value)} style={sel}>
            {COMPOSITIONS.map(c => <option key={c} value={c}>{NL[c]}</option>)}
          </select>
        </Field>

        <Field label="Doeltype">
          <select value={form.target_type} onChange={e => set('target_type', e.target.value)} style={sel}>
            {TARGET_TYPES.map(t => <option key={t} value={t}>{NL[t]}</option>)}
          </select>
        </Field>

        <Field label={`Invalshoek: ${form.angle}°`} style={{ gridColumn: '1 / -1' }}>
          <input type="range" min={5} max={90} value={form.angle}
            onChange={e => set('angle', Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)' }} />
        </Field>
      </div>

      <button onClick={run} disabled={!form.asteroid_id || !form.country_name || loading} style={{
        padding: '8px 16px', borderRadius: 8, border: 'none',
        background: 'var(--accent)', color: '#fff', fontWeight: 700,
        cursor: form.asteroid_id && form.country_name ? 'pointer' : 'not-allowed',
        opacity: form.asteroid_id && form.country_name ? 1 : 0.5,
        fontSize: 14,
      }}>
        {loading ? 'Simuleren...' : '🚀 Simuleer inslag'}
      </button>

      {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>Fout: {error}</p>}

      {result && <SimResult r={result} />}
    </div>
  )
}

function SimResult({ r }) {
  const rows = [
    ['Energie', r.energie_megaton != null ? `${r.energie_megaton?.toFixed(2)} Megaton TNT` : '—'],
    ['Magnitude', r.magnitude?.toFixed(1) ?? '—'],
    ['Slachtoffers', r.slachtoffers?.toLocaleString('nl-NL') ?? '—'],
    ['Vernietigde oppervlakte', r.vernietigde_opp != null ? `${r.vernietigde_opp?.toLocaleString('nl-NL')} km²` : '—'],
    ['Extinctie-event', r.extinction_event ? '⚠ JA' : 'Nee'],
  ]
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
      <p style={{ fontWeight: 700, marginBottom: 8, color: 'var(--accent)' }}>📊 Resultaat</p>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
          <span style={{ color: 'var(--muted)' }}>{k}</span>
          <span style={{ fontWeight: 600, color: k === 'Extinctie-event' && v !== 'Nee' ? 'var(--danger)' : 'var(--text)' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

function Field({ label, children, style }) {
  return (
    <div style={style}>
      <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  )
}

const sel = {
  width: '100%', padding: '5px 8px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--surface2)',
  color: 'var(--text)', fontSize: 13,
}
