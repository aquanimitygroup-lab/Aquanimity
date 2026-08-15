import { useState, useRef, useCallback } from 'react'
import Papa from 'papaparse'
import TargetSelector from './TargetSelector'

function Toggle({ checked, onChange, label, sublabel }) {
  return (
    <div className="toggle-row">
      <div className="toggle-label">
        {label}
        {sublabel && <span>{sublabel}</span>}
      </div>
      <label className="toggle-switch">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className="toggle-track">
          <div className="toggle-thumb" />
        </div>
      </label>
    </div>
  )
}

function AdmeBadges({ row }) {
  if (!row || row.error) return null
  return (
    <div className="compound-badges">
      <span className={`badge ${row.lipinski_pass ? 'badge-pass' : 'badge-fail'}`}>Lipinski</span>
      <span className={`badge ${row.egan_pass ? 'badge-pass' : 'badge-fail'}`}>Egan</span>
      <span className={`badge ${row.veber_pass ? 'badge-pass' : 'badge-fail'}`}>Veber</span>
      <span className={`badge ${row.gi_absorption === 'High' ? 'badge-pass' : 'badge-fail'}`}>
        GI:{row.gi_absorption}
      </span>
      <span className={`badge ${row.bbb_permeant === 'Yes' ? 'badge-pass' : 'badge-neutral'}`}>
        BBB:{row.bbb_permeant}
      </span>
      {row.herg_risk && (
        <span className={`badge ${row.herg_risk === 'LOW' ? 'badge-pass' : row.herg_risk === 'MEDIUM' ? 'badge-warn' : 'badge-fail'}`}>
          hERG:{row.herg_risk}
        </span>
      )}
    </div>
  )
}

export default function InputPanel({
  onSmilesChange,
  onAdmeEnrich,
  compounds,
  admeLoading,
  selectedTargets,
  onTargetsChange,
  filterDruglike,
  onFilterChange,
  onRun,
  running,
}) {
  const [rawInput, setRawInput] = useState('')
  const fileRef = useRef(null)
  const [fileName, setFileName] = useState(null)

  const parseSmilesFromText = useCallback((text) => {
    return text.split(/[\n,]/).map(s => s.trim()).filter(s => s.length > 0)
  }, [])

  const handleTextChange = useCallback((e) => {
    const val = e.target.value
    setRawInput(val)
    const list = parseSmilesFromText(val)
    onSmilesChange(list)
  }, [parseSmilesFromText, onSmilesChange])

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data
        const col = results.meta.fields?.find(f => f.toLowerCase() === 'smiles')
        if (!col) {
          alert('CSV must have a "smiles" column')
          return
        }
        const list = rows.map(r => r[col]).filter(Boolean)
        setRawInput(list.join('\n'))
        onSmilesChange(list)
        onAdmeEnrich(list)
      },
      error: (err) => alert(`CSV parse error: ${err.message}`)
    })
    e.target.value = ''
  }, [onSmilesChange, onAdmeEnrich])

  const handleEnrich = useCallback(() => {
    const list = parseSmilesFromText(rawInput)
    if (list.length) onAdmeEnrich(list)
  }, [rawInput, parseSmilesFromText, onAdmeEnrich])

  const canRun = compounds.length > 0 && selectedTargets.length > 0 && !running

  return (
    <>
      {/* SMILES Input */}
      <div className="panel">
        <div className="panel-title">Ligand Input</div>
        <textarea
          className="smiles-textarea"
          value={rawInput}
          onChange={handleTextChange}
          placeholder={'SMILES string(s), one per line\nCC(=O)Oc1ccccc1C(=O)O\nCC(=O)Nc1ccc(O)cc1'}
          rows={4}
          spellCheck={false}
        />
        <div className="upload-area">
          <input
            type="file"
            accept=".csv"
            ref={fileRef}
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
          <button className="upload-btn" onClick={() => fileRef.current?.click()}>
            <span>↑</span> Upload CSV
          </button>
          {fileName && (
            <span className="upload-label" style={{ color: 'var(--accent)' }}>
              {fileName}
            </span>
          )}
          {rawInput && !admeLoading && (
            <button
              className="upload-btn"
              onClick={handleEnrich}
              style={{ marginLeft: 'auto' }}
              title="Fetch names and ADME for entered SMILES"
            >
              ⟳ Analyse
            </button>
          )}
        </div>
      </div>

      {/* Compound list — only shown after ADME enrichment has run */}
      {compounds.length > 0 && compounds.some(c => c.molecular_weight != null) && (
        <div className="panel">
          <div className="panel-title">
            Compounds ({compounds.length})
            {admeLoading && <span className="spinner" style={{ marginLeft: 6 }} />}
          </div>
          <div className="compound-list">
            {compounds.map((c, i) => (
              <div key={i} className="compound-row">
                <div className="compound-row-header">
                  <span className="compound-name">
                    {c.compound_name && c.compound_name !== 'Unknown'
                      ? c.compound_name
                      : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unknown</span>
                    }
                  </span>
                  {c.molecular_weight && (
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {c.molecular_weight} Da
                    </span>
                  )}
                </div>
                <div className="compound-smiles">{c.smiles}</div>
                <AdmeBadges row={c} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Target selector */}
      <div className="panel">
        <div className="panel-title">Protein Targets</div>
        <TargetSelector
          selected={selectedTargets}
          onChange={onTargetsChange}
        />
        {selectedTargets.length === 0 && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            Search and select one or more targets from the dropdown.
          </p>
        )}
      </div>

      {/* Pre-filter toggle */}
      <div className="panel">
        <div className="panel-title">Docking Options</div>
        <Toggle
          checked={filterDruglike}
          onChange={onFilterChange}
          label="Pre-filter: Lipinski + Egan + Veber"
          sublabel="Only dock compounds passing all three druglikeness filters"
        />
      </div>

      {/* Run button */}
      <div className="panel" style={{ borderBottom: 'none' }}>
        <button
          className={`run-btn ${running ? 'running' : ''}`}
          onClick={onRun}
          disabled={!canRun}
        >
          {running ? (
            <>
              <span className="spinner" style={{ borderTopColor: 'var(--accent)', borderColor: 'var(--border)' }} />
              Running…
            </>
          ) : (
            <>▶ Run Analysis</>
          )}
        </button>
        {compounds.length === 0 && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
            Enter SMILES or upload a CSV to begin
          </p>
        )}
        {compounds.length > 0 && selectedTargets.length === 0 && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
            Select at least one target to enable docking
          </p>
        )}
      </div>
    </>
  )
}
