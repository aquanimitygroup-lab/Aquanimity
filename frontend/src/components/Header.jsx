export default function Header() {
  return (
    <header className="header">
      <div className="header-brand">
        <div className="header-logo-placeholder">MP</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span className="header-title">MolProfiler</span>
          <span className="header-subtitle">cheminformatics</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span className="header-badge">ADME · DOCK · TOX</span>
      </div>
    </header>
  )
}
