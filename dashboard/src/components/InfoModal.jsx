import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function InfoModal({ title, icon, onClose, children }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 2000,
          backdropFilter: 'blur(3px)',
          animation: 'fadeIn 0.15s ease',
        }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        zIndex: 2001,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '24px 28px',
        width: 460,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        animation: 'fadeInUp 0.18s ease',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>{icon}</span>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{title}</h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid transparent', borderRadius: 8,
              color: 'var(--muted)', fontSize: 20, cursor: 'pointer',
              lineHeight: 1, padding: '2px 7px', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--muted)' }}
            title="Sluiten (Escape)"
          >×</button>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', marginBottom: 16 }} />

        {/* Content */}
        <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>
          {children}
        </div>
      </div>
    </>,
    document.body
  )
}

export function InfoSection({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--accent)',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
      }}>{title}</div>
      <div style={{ color: 'var(--muted)' }}>{children}</div>
    </div>
  )
}

export function InfoTip({ children }) {
  return (
    <div style={{
      marginTop: 14, padding: '10px 14px', borderRadius: 8,
      background: 'rgba(59,130,246,0.08)',
      border: '1px solid rgba(59,130,246,0.2)',
      fontSize: 12, color: 'var(--muted)',
      display: 'flex', gap: 8,
    }}>
      <span style={{ flexShrink: 0 }}>💡</span>
      <span>{children}</span>
    </div>
  )
}
