import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', padding: 24, gap: 10,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>Widget onverwacht gecrasht</p>
          <p style={{ color: 'var(--muted)', fontSize: 11, maxWidth: 260, lineHeight: 1.5 }}>
            {this.state.error?.message ?? 'Onbekende fout'}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text)',
              cursor: 'pointer', fontSize: 12, marginTop: 4,
            }}
          >
            ↺ Opnieuw proberen
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
