import { useState, useCallback, useEffect } from 'react'
import Header from './components/Header'
import InputPanel from './components/InputPanel'
import MoleculeViewer from './components/MoleculeViewer'
import ProgressGrid from './components/ProgressGrid'
import ResultsTables from './components/ResultsTables'

export default function App() {
  const [smilesList, setSmilesList] = useState([])
  const [selectedTargets, setSelectedTargets] = useState([])
  const [filterDruglike, setFilterDruglike] = useState(false)
  const [compounds, setCompounds] = useState([])
  const [admeLoading, setAdmeLoading] = useState(false)

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ pct: 0, msg: '', completed: 0, total: 0 })
  const [progressCells, setProgressCells] = useState({})
  const [logs, setLogs] = useState([])

  const [admeResults, setAdmeResults] = useState([])
  const [dockingResults, setDockingResults] = useState([])
  const [boiledEggImg, setBoiledEggImg] = useState(null)
  const [boiledEggLoading, setBoiledEggLoading] = useState(false)

  const [viewerTarget, setViewerTarget] = useState(null)
  const [viewerComplex, setViewerComplex] = useState(null)
  const [viewerResidues, setViewerResidues] = useState([])

  // Load protein structure when first target is selected
  useEffect(() => {
    if (selectedTargets.length > 0 && !running) {
      setViewerTarget(selectedTargets[0])
    }
  }, [selectedTargets])

  const addLog = useCallback((msg, type = '') => {
    setLogs(prev => [...prev.slice(-40), { msg, type }])
  }, [])

  const handleSmilesChange = useCallback((list) => {
    setSmilesList(list)
    setCompounds(list.map(s => ({ smiles: s, compound_name: null })))
  }, [])

  const fetchBoiledEgg = useCallback(async (list) => {
    setBoiledEggLoading(true)
    setBoiledEggImg(null)
    try {
      const res = await fetch('/api/boiledegg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smiles: list })
      })
      const data = await res.json()
      if (data.image) setBoiledEggImg(data.image)
    } catch (e) {
      console.warn('BOILED-Egg error:', e.message)
    } finally {
      setBoiledEggLoading(false)
    }
  }, [])

  const handleAdmeEnrich = useCallback(async (list) => {
    if (!list.length) return
    setAdmeLoading(true)
    try {
      const res = await fetch('/api/adme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smiles: list })
      })
      const data = await res.json()
      const results = data.results || []
      setCompounds(results)
      setAdmeResults(results)
      fetchBoiledEgg(list)
    } catch (e) {
      addLog(`ADME error: ${e.message}`, 'error')
    } finally {
      setAdmeLoading(false)
    }
  }, [addLog, fetchBoiledEgg])

  const handleRun = useCallback(async () => {
    if (!smilesList.length || !selectedTargets.length) return
    setRunning(true)
    setProgress({ pct: 0, msg: 'Starting…', completed: 0, total: 0 })
    setProgressCells({})
    setAdmeResults([])
    setDockingResults([])
    setViewerComplex(null)
    setViewerResidues([])
    setLogs([])

    if (selectedTargets[0]) setViewerTarget(selectedTargets[0])

    // local flag to set the first complex only once
    let firstComplexSet = false

    try {
      const res = await fetch('/api/dock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smiles: smilesList,
          targets: selectedTargets,
          filter_druglike: filterDruglike
        })
      })

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const ev = JSON.parse(line)
            if (ev.type === 'log') {
              addLog(ev.msg)
            } else if (ev.type === 'adme_result') {
              setAdmeResults(prev => [...prev, ev.data])
              setCompounds(prev => {
                const idx = prev.findIndex(c => c.smiles === ev.data.smiles)
                if (idx === -1) return [...prev, ev.data]
                const next = [...prev]
                next[idx] = { ...next[idx], ...ev.data }
                return next
              })
            } else if (ev.type === 'progress') {
              const key = `${ev.smiles}|${ev.target}`
              setProgressCells(prev => ({ ...prev, [key]: 'running' }))
              setProgress({
                pct: ev.progress,
                msg: `${ev.compound} × ${ev.target}`,
                completed: ev.completed,
                total: ev.total
              })
            } else if (ev.type === 'dock_result') {
              const key = `${ev.data.smiles}|${ev.data.target_name}`
              const ok = ev.data.docking_status === 'success'
              setProgressCells(prev => ({ ...prev, [key]: ok ? 'success' : 'failed' }))
              setDockingResults(prev => [...prev, ev.data])

              if (ok) {
                addLog(`✓ ${ev.compound} → ${ev.target}: ${ev.data.docking_score} kcal/mol`, 'success')
                if (!firstComplexSet) {
                  firstComplexSet = true
                  setViewerComplex(ev.data.pdb_file)
                  const res = ev.data.interacting_residues
                  setViewerResidues(res && res !== 'None' ? res.split('; ').filter(Boolean) : [])
                }
              } else {
                addLog(`✗ ${ev.compound} → ${ev.target}: ${ev.data.docking_status}`, 'error')
              }
            } else if (ev.type === 'complete') {
              setProgress(p => ({ ...p, pct: 100, msg: 'Complete' }))
              addLog(`Analysis complete — ${ev.docking_results?.length || 0} docking result(s)`, 'success')
              fetchBoiledEgg(smilesList)
            }
          } catch (_) { /* skip malformed JSON */ }
        }
      }
    } catch (e) {
      addLog(`Run error: ${e.message}`, 'error')
    } finally {
      setRunning(false)
    }
  }, [smilesList, selectedTargets, filterDruglike, addLog, fetchBoiledEgg])

  return (
    <div className="app-wrapper">
      <Header />
      <div className="main-layout">
        <div className="left-col">
          <InputPanel
            onSmilesChange={handleSmilesChange}
            onAdmeEnrich={handleAdmeEnrich}
            compounds={compounds}
            admeLoading={admeLoading}
            selectedTargets={selectedTargets}
            onTargetsChange={setSelectedTargets}
            filterDruglike={filterDruglike}
            onFilterChange={setFilterDruglike}
            onRun={handleRun}
            running={running}
          />
        </div>
        <div className="right-col">
          {running && (
            <ProgressGrid
              compounds={compounds}
              targets={selectedTargets}
              cells={progressCells}
              progress={progress}
              logs={logs}
            />
          )}

          <MoleculeViewer
            target={viewerTarget}
            complexFile={viewerComplex}
            residues={viewerResidues}
            dockingResults={dockingResults}
            onComplexChange={(file, residues) => {
              setViewerComplex(file)
              setViewerResidues(residues)
            }}
          />

          {(admeResults.length > 0 || dockingResults.length > 0 || boiledEggImg || boiledEggLoading) && (
            <ResultsTables
              admeResults={admeResults}
              dockingResults={dockingResults}
              boiledEggImg={boiledEggImg}
              boiledEggLoading={boiledEggLoading}
              onSelectDocking={(row) => {
                if (row.pdb_file) {
                  setViewerComplex(row.pdb_file)
                  const res = row.interacting_residues
                  setViewerResidues(res && res !== 'None' ? res.split('; ').filter(Boolean) : [])
                  setViewerTarget(row.target_name)
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
