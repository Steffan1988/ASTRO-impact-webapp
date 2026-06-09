import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function InfoTip({ text }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({ top: r.top, cx: r.left + r.width / 2 })
  }

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={() => setPos(null)}
        onClick={e => e.stopPropagation()}
        style={{
          cursor: 'help', color: 'var(--muted)', fontSize: 10,
          lineHeight: 1, userSelect: 'none', flexShrink: 0, opacity: 0.65,
        }}
      >ⓘ</span>
      {pos && createPortal(
        <div style={{
          position: 'fixed',
          top: pos.top - 10,
          left: pos.cx,
          transform: 'translate(-50%, -100%)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 9,
          padding: '9px 12px',
          fontSize: 11,
          color: 'var(--text)',
          lineHeight: 1.6,
          width: 250,
          zIndex: 10000,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}>
          {text}
        </div>,
        document.body
      )}
    </>
  )
}
