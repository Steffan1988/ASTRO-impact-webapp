import { useEffect, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'

export default function WidgetNewsArticle() {
  const [sims, setSims] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [dbError, setDbError] = useState(false)

  // Load simulation list
  const loadSims = useCallback(() => {
    fetch('/api/simulations?limit=50')
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : d.data ?? []
        setSims(list)
        if (list.length > 0) setSelectedId(prev => prev ?? list[0].id)
      })
      .catch(() => setDbError(true))
  }, [])

  useEffect(() => { loadSims() }, [loadSims])

  // Load article when selection changes
  useEffect(() => {
    if (!selectedId) return
    setArticle(null); setError(null); setLoading(true)
    fetch(`/api/article/${selectedId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setArticle(d); setLoading(false) })
      .catch(code => {
        if (code === 404) setArticle(null) // geen artikel, toon genereer-knop
        else setError('Fout bij ophalen artikel')
        setLoading(false)
      })
  }, [selectedId])

  const [streamText, setStreamText] = useState('')

  const generate = useCallback(async () => {
    if (!selectedId) return
    setGenerating(true); setError(null); setArticle(null); setStreamText('')

    try {
      const resp = await fetch('/api/article/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulation_id: selectedId }),
      })
      if (!resp.ok) {
        const d = await resp.json()
        throw new Error(d.error ?? 'Genereren mislukt')
      }

      // Read SSE stream
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let articleId = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.text) {
              setStreamText(prev => prev + evt.text)
            }
            if (evt.article_done) {
              articleId = evt.article_id
            }
          } catch {}
        }
      }

      // Fetch the saved article from DB
      if (articleId) {
        const ar = await fetch(`/api/article/${articleId}`)
        if (ar.ok) {
          const d = await ar.json()
          setArticle(d)
          setStreamText('')
        }
      }
    } catch (e) { setError(e.message) }

    setGenerating(false)
  }, [selectedId])

  if (dbError) return (
    <div style={{ textAlign: 'center', paddingTop: 24 }}>
      <p style={{ fontSize: 28, marginBottom: 8 }}>📰</p>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>Database niet bereikbaar.</p>
      <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
        Voer <code>setup_db.sql</code> uit en herstart Flask.
      </p>
    </div>
  )

  const sim = sims.find(s => s.id === selectedId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>

      {/* Simulatie kiezer */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <select
          value={selectedId ?? ''}
          onChange={e => setSelectedId(Number(e.target.value))}
          disabled={sims.length === 0}
          style={{
            flex: 1, padding: '6px 8px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--surface2)',
            color: 'var(--text)', fontSize: 12,
          }}
        >
          {sims.length === 0
            ? <option>Nog geen simulaties...</option>
            : sims.map(s => (
                <option key={s.id} value={s.id}>
                  #{s.id} — {s.asteroid_naam ?? '?'} → {s.land_naam ?? '?'} ({s.created_at?.slice(0,10) ?? '?'})
                </option>
              ))
          }
        </select>

        {!article && !loading && selectedId && (
          <button
            onClick={generate}
            disabled={generating}
            style={{
              padding: '6px 14px', borderRadius: 6, border: 'none', flexShrink: 0,
              background: generating ? 'var(--surface2)' : 'var(--accent)',
              color: generating ? 'var(--muted)' : '#fff',
              cursor: generating ? 'not-allowed' : 'pointer',
              fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap',
            }}
          >
            {generating ? '✍️ Genereren...' : '✍️ Genereer artikel'}
          </button>
        )}

        {article && (
          <button
            onClick={generate}
            disabled={generating}
            title="Nieuw artikel genereren"
            style={{
              padding: '6px 10px', borderRadius: 6, flexShrink: 0,
              border: '1px solid var(--border)', background: 'var(--surface2)',
              color: 'var(--muted)', cursor: 'pointer', fontSize: 12,
            }}
          >
            {generating ? '...' : '↺'}
          </button>
        )}
      </div>

      {/* Simulatie samenvatting */}
      {sim && (
        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', flexShrink: 0,
          padding: '6px 10px', background: 'var(--surface2)',
          borderRadius: 8, fontSize: 11,
        }}>
          {[
            ['☄️', sim.asteroid_naam],
            ['🌍', sim.land_naam],
            ['💥', sim.energie_megaton != null ? `${Number(sim.energie_megaton).toFixed(0)} Mt` : '—'],
            ['💀', sim.slachtoffers != null ? Number(sim.slachtoffers).toLocaleString('nl-NL') : '—'],
            ['📐', sim.magnitude != null ? `M${Number(sim.magnitude).toFixed(1)}` : '—'],
          ].map(([icon, val]) => (
            <span key={icon} style={{ color: 'var(--muted)' }}>
              {icon} <strong style={{ color: 'var(--text)' }}>{val}</strong>
            </span>
          ))}
          {sim.extinction_event ? <span style={{ color: 'var(--danger)', fontWeight: 700 }}>⚠ EXTINCTIE</span> : null}
        </div>
      )}

      {error && <p style={{ color: 'var(--danger)', fontSize: 12, flexShrink: 0 }}>Fout: {error}</p>}

      {/* Artikel inhoud */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {loading && <p style={{ color: 'var(--muted)', padding: 16, textAlign: 'center' }}>Laden...</p>}

        {!loading && !article && !generating && selectedId && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>📰</p>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              Nog geen artikel voor deze simulatie.
            </p>
            <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
              Klik op <strong style={{ color: 'var(--text)' }}>✍️ Genereer artikel</strong> om een
              AI-nieuwsbericht te maken{!window.__hasAnthropicKey && ' (demo-modus)'}
            </p>
          </div>
        )}

        {!loading && !article && sims.length === 0 && !dbError && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>📰</p>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              Simuleer eerst een inslag via de kaart.
            </p>
          </div>
        )}

        {generating && !streamText && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>✍️</div>
            <p style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>Artikel wordt geschreven...</p>
          </div>
        )}

        {generating && streamText && (
          <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>
            <ReactMarkdown
              components={{
                h1: ({children}) => <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', margin: '12px 0 6px' }}>{children}</h3>,
                h2: ({children}) => <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '10px 0 4px' }}>{children}</h4>,
                p:  ({children}) => <p style={{ marginBottom: 10 }}>{children}</p>,
                em: ({children}) => <em style={{ color: 'var(--muted)', fontStyle: 'italic' }}>{children}</em>,
                strong: ({children}) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
                hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />,
              }}
            >{streamText + ' ▌'}</ReactMarkdown>
          </div>
        )}

        {article && !generating && (
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            {/* Kop */}
            {article.kop && (
              <h2 style={{
                fontSize: 16, fontWeight: 800, color: 'var(--text)',
                marginBottom: 12, lineHeight: 1.3,
                borderBottom: '2px solid var(--accent)', paddingBottom: 8,
              }}>
                📰 {article.kop}
              </h2>
            )}

            {/* Afbeelding */}
            {article.image_url && (
              <img
                src={article.image_url}
                alt="Impact visualisatie"
                style={{
                  width: '100%', borderRadius: 8, marginBottom: 12,
                  maxHeight: 180, objectFit: 'cover',
                }}
                onError={e => { e.target.style.display = 'none' }}
              />
            )}

            {/* Markdown inhoud */}
            <div style={{ color: 'var(--text)' }}>
              <ReactMarkdown
                components={{
                  h1: ({children}) => <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', margin: '12px 0 6px' }}>{children}</h3>,
                  h2: ({children}) => <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '10px 0 4px' }}>{children}</h4>,
                  h3: ({children}) => <h5 style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', margin: '8px 0 4px' }}>{children}</h5>,
                  p:  ({children}) => <p style={{ marginBottom: 10, color: 'var(--text)' }}>{children}</p>,
                  em: ({children}) => <em style={{ color: 'var(--muted)', fontStyle: 'italic' }}>{children}</em>,
                  strong: ({children}) => <strong style={{ color: 'var(--text)', fontWeight: 700 }}>{children}</strong>,
                  blockquote: ({children}) => (
                    <blockquote style={{
                      borderLeft: '3px solid var(--accent2)', paddingLeft: 12,
                      margin: '8px 0', color: 'var(--muted)', fontStyle: 'italic',
                    }}>{children}</blockquote>
                  ),
                  hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />,
                }}
              >
                {article.inhoud ?? ''}
              </ReactMarkdown>
            </div>

            <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8, textAlign: 'right' }}>
              Gegenereerd: {article.generated_at ?? '—'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
