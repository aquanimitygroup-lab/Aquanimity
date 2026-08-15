export default function ProgressGrid({ compounds, targets, cells, progress, logs }) {
  const cellIcon = (status) => {
    if (!status) return <span className="cell-pending">·</span>
    if (status === 'running') return <span className="cell-running">⟳</span>
    if (status === 'success') return <span className="cell-success">✓</span>
    return <span className="cell-failed">✗</span>
  }

  return (
    <div className="progress-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          ◈ Running
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-on-dark)' }}>
          {progress.completed}/{progress.total} · {progress.pct.toFixed(0)}%
        </span>
      </div>
      <div className="progress-bar-outer">
        <div className="progress-bar-inner" style={{ width: `${progress.pct}%` }} />
      </div>

      {compounds.length > 0 && targets.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="progress-grid-table">
            <thead>
              <tr>
                <th>Compound</th>
                {targets.map(t => <th key={t} title={t}>{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {compounds.map((c, i) => {
                const smiles = c.smiles || ''
                const label = c.compound_name || smiles.slice(0, 18) || '?'
                return (
                  <tr key={i}>
                    <td title={smiles}>{label}</td>
                    {targets.map(t => {
                      const key = `${smiles}|${t}`
                      return <td key={t}>{cellIcon(cells[key])}</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {logs.length > 0 && (
        <div className="log-stream" style={{ marginTop: 10 }}>
          {logs.map((l, i) => (
            <div key={i} className={`log-line ${l.type}`}>{l.msg}</div>
          ))}
        </div>
      )}
    </div>
  )
}
