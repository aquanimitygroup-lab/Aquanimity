import { useState, useEffect, useRef } from 'react'

export default function TargetSelector({ selected, onChange }) {
  const [allTargets, setAllTargets] = useState([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    fetch('/api/targets')
      .then(r => r.json())
      .then(d => setAllTargets(d.targets || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = allTargets.filter(t =>
    t.toLowerCase().includes(search.toLowerCase()) && !selected.includes(t)
  )

  const removeTarget = (t) => onChange(selected.filter(s => s !== t))
  const addTarget = (t) => {
    onChange([...selected, t])
    setSearch('')
  }

  return (
    <div className="target-selector-container" ref={wrapperRef}>
      <div
        className="target-input-wrapper"
        onClick={() => setOpen(true)}
      >
        {selected.map(t => (
          <span key={t} className="target-tag">
            {t}
            <button
              className="target-tag-remove"
              onClick={(e) => { e.stopPropagation(); removeTarget(t) }}
              title="Remove"
            >×</button>
          </span>
        ))}
        <input
          className="target-search-input"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? 'Search targets…' : ''}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="target-dropdown">
          {filtered.map(t => (
            <div
              key={t}
              className="target-option"
              onMouseDown={(e) => { e.preventDefault(); addTarget(t) }}
            >
              <span>{t}</span>
            </div>
          ))}
        </div>
      )}
      {allTargets.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          Loading targets…
        </div>
      )}
    </div>
  )
}
