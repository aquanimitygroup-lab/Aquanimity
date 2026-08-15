import { useState, useMemo } from 'react'

function PassFailBadge({ value }) {
  if (value === true  || value === 'true')  return <span className="badge badge-pass">PASS</span>
  if (value === false || value === 'false') return <span className="badge badge-fail">FAIL</span>
  if (value === 'Yes')    return <span className="badge badge-pass">YES</span>
  if (value === 'No')     return <span className="badge badge-fail">NO</span>
  if (value === 'High')   return <span className="badge badge-pass">HIGH</span>
  if (value === 'Low')    return <span className="badge badge-fail">LOW</span>
  if (value === 'HIGH')   return <span className="badge badge-fail">HIGH RISK</span>
  if (value === 'MEDIUM') return <span className="badge badge-warn">MEDIUM</span>
  if (value === 'LOW')    return <span className="badge badge-pass">LOW</span>
  return <span className="badge badge-neutral">{value?.toString() ?? '—'}</span>
}

const ADME_COLS = [
  { key: 'compound_name',     label: 'Name' },
  { key: 'smiles',            label: 'SMILES',    mono: true, truncate: true },
  { key: 'molecular_weight',  label: 'MW',        mono: true },
  { key: 'logp',              label: 'LogP',      mono: true },
  { key: 'tpsa',              label: 'TPSA',      mono: true },
  { key: 'h_bond_donors',     label: 'HBD',       mono: true },
  { key: 'h_bond_acceptors',  label: 'HBA',       mono: true },
  { key: 'n_rotatable_bonds', label: 'RotB',      mono: true },
  { key: 'lipinski_pass',     label: 'Lipinski',  badge: true },
  { key: 'egan_pass',         label: 'Egan',      badge: true },
  { key: 'veber_pass',        label: 'Veber',     badge: true },
  { key: 'gi_absorption',     label: 'GI Abs',    badge: true },
  { key: 'bbb_permeant',      label: 'BBB',       badge: true },
  { key: 'herg_risk',         label: 'hERG',      badge: true },
  { key: 'hepatotoxicity_alert', label: 'Hepatotox', badge: true },
  { key: 'mutagenicity_alert',   label: 'Mutagen',   badge: true },
  { key: 'cyp450_risk',          label: 'CYP450',    badge: true },
  { key: 'pains_alert',          label: 'PAINS',     badge: true },
]

const DOCK_COLS = [
  { key: 'compound_name',        label: 'Compound' },
  { key: 'target_name',          label: 'Target',          mono: true },
  { key: 'docking_score',        label: 'Score (kcal/mol)', score: true },
  { key: 'docking_status',       label: 'Status' },
  { key: 'num_interactions',     label: '# Contacts',      mono: true },
  { key: 'interacting_residues', label: 'Residues',        truncate: true },
]

function downloadCSV(cols, rows, filename) {
  const escape = (v) => {
    if (v == null) return ''
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = cols.map(c => c.label).join(',')
  const body   = rows.map(r => cols.map(c => escape(r[c.key])).join(',')).join('\n')
  const blob   = new Blob([header + '\n' + body], { type: 'text/csv' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function SortableTable({ cols, rows, onRowClick, rowClass }) {
  const [sortKey, setSortKey]   = useState(null)
  const [sortDir, setSortDir]   = useState(1)

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(1) }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number') return (av - bv) * sortDir
      return String(av).localeCompare(String(bv)) * sortDir
    })
  }, [rows, sortKey, sortDir])

  if (!rows.length) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">⬡</span>
        No data yet
      </div>
    )
  }

  return (
    <div className="results-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {cols.map(c => (
              <th
                key={c.key}
                className={sortKey === c.key ? 'sorted' : ''}
                onClick={() => handleSort(c.key)}
                title={c.label}
              >
                {c.label}
                <span className="sort-icon">
                  {sortKey === c.key ? (sortDir === 1 ? '▲' : '▼') : '⇅'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={i}
              className={rowClass?.(row) || ''}
              onClick={() => onRowClick?.(row)}
              style={onRowClick ? { cursor: 'pointer' } : {}}
            >
              {cols.map(c => (
                <td
                  key={c.key}
                  className={c.mono ? 'cell-mono' : c.score ? 'cell-score' : ''}
                  title={String(row[c.key] ?? '')}
                >
                  {c.badge ? (
                    <PassFailBadge value={row[c.key]} />
                  ) : c.score ? (
                    row[c.key] != null ? `${row[c.key]}` : '—'
                  ) : (
                    row[c.key] != null ? String(row[c.key]) : '—'
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BoiledEggPanel({ img, loading }) {
  if (loading) {
    return (
      <div className="empty-state" style={{ padding: 40 }}>
        <span className="spinner" style={{ width: 28, height: 28 }} />
        <span style={{ color: 'var(--text-muted)', marginTop: 12 }}>Generating BOILED-Egg plot…</span>
      </div>
    )
  }
  if (!img) {
    return (
      <div className="empty-state" style={{ padding: 40 }}>
        <span className="empty-state-icon">⬡</span>
        <span>Run ADME analysis to generate the BOILED-Egg plot</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 320, textAlign: 'center', lineHeight: 1.7 }}>
          The BOILED-Egg model (Daina 2016) visualises GI absorption (white region) and BBB permeability (yellow yolk) from LogP vs TPSA.
        </span>
      </div>
    )
  }
  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <img
        src={img}
        alt="BOILED-Egg druglikeness plot"
        style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }}
      />
      <div style={{ display: 'flex', gap: 10 }}>
        <a
          href={img}
          download="boiled_egg.png"
          style={{
            fontSize: 12, color: 'var(--accent-on-dark)', textDecoration: 'none',
            border: '1px solid var(--accent-border)', background: 'var(--accent-dim)',
            padding: '5px 14px', borderRadius: 6, fontFamily: 'var(--font-mono)'
          }}
        >
          ↓ Download PNG
        </a>
      </div>
    </div>
  )
}

export default function ResultsTables({ admeResults, dockingResults, onSelectDocking, boiledEggImg, boiledEggLoading }) {
  const [tab, setTab] = useState('adme')

  return (
    <div className="results-section">
      <div className="results-tabs">
        <button
          className={`results-tab ${tab === 'adme' ? 'active' : ''}`}
          onClick={() => setTab('adme')}
        >
          ADME / Toxicity
          {admeResults.length > 0 && (
            <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 100 }}>
              {admeResults.length}
            </span>
          )}
        </button>
        <button
          className={`results-tab ${tab === 'docking' ? 'active' : ''}`}
          onClick={() => setTab('docking')}
        >
          Docking Results
          {dockingResults.length > 0 && (
            <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 100 }}>
              {dockingResults.length}
            </span>
          )}
        </button>
        <button
          className={`results-tab ${tab === 'boiledegg' ? 'active' : ''}`}
          onClick={() => setTab('boiledegg')}
        >
          BOILED-Egg
          {boiledEggImg && <span style={{ marginLeft: 5, fontSize: 10 }}>🥚</span>}
        </button>
      </div>

      {tab === 'adme' && (
        <>
          {admeResults.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px 0' }}>
              <button
                className="download-csv-btn"
                onClick={() => downloadCSV(ADME_COLS, admeResults, 'adme_results.csv')}
              >
                ↓ CSV
              </button>
            </div>
          )}
          <SortableTable cols={ADME_COLS} rows={admeResults} />
        </>
      )}

      {tab === 'docking' && (
        <>
          {dockingResults.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px 0' }}>
              <button
                className="download-csv-btn"
                onClick={() => downloadCSV(DOCK_COLS, dockingResults, 'docking_results.csv')}
              >
                ↓ CSV
              </button>
            </div>
          )}
          <SortableTable
            cols={DOCK_COLS}
            rows={dockingResults}
            onRowClick={onSelectDocking}
            rowClass={(row) => row.docking_status !== 'success' ? 'row-failed' : ''}
          />
        </>
      )}

      {tab === 'boiledegg' && (
        <BoiledEggPanel img={boiledEggImg} loading={boiledEggLoading} />
      )}
    </div>
  )
}
