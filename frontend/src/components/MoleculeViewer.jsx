import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";

const ResiduePanel = ({ residues, onResidueClick, activeResidue }) => (
  <div className="residue-panel">
    <div className="residue-panel-header">Contacts ({residues.length})</div>
    <div className="residue-list">
      {residues.length === 0 ? (
        <div className="residue-empty">
          Interacting residues
          <br />
          will appear here
          <br />
          after docking
        </div>
      ) : (
        residues.map((r) => (
          <div
            key={r}
            className={`residue-chip ${activeResidue === r ? "active" : ""}`}
            onClick={() => onResidueClick(r)}
            title={`Focus on ${r}`}
          >
            <span>{r}</span>
            <span className="residue-chip-arrow">→</span>
          </div>
        ))
      )}
    </div>
  </div>
);

function NGLViewerInner(
  { target, complexFile, residues, dockingResults, onComplexChange },
  ref,
) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const mountedRef = useRef(false);
  const componentRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [showComplex, setShowComplex] = useState(false);
  const [activeResidue, setActiveResidue] = useState(null);
  const [selectedDock, setSelectedDock] = useState("");

  // Init NGL Stage — guard against StrictMode double-invoke
  // Init NGL Stage
  useEffect(() => {
    let cancelled = false;
    let stage = null;

    const init = async () => {
      try {
        const NGL = await import("ngl");
        if (cancelled || !containerRef.current) return;

        // Defensive: wipe any leftover canvas from a previous init
        containerRef.current.innerHTML = "";

        const testCanvas = document.createElement("canvas");
        const gl =
          testCanvas.getContext("webgl") ||
          testCanvas.getContext("experimental-webgl");
        if (!gl) {
          setWebglUnavailable(true);
          return;
        }

        stage = new NGL.Stage(containerRef.current, {
          backgroundColor: "#050810",
          fogNear: 100,
          fogFar: 100,
        });

        if (cancelled) {
          stage.dispose();
          return;
        }

        stageRef.current = stage;

        const handleResize = () => stage && stage.handleResize();
        window.addEventListener("resize", handleResize);

        let lastWidth = 0;
        let lastHeight = 0;
        let rafId = null;

        const resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          const { width, height } = entry.contentRect;
          if (
            Math.abs(width - lastWidth) < 1 &&
            Math.abs(height - lastHeight) < 1
          )
            return;
          lastWidth = width;
          lastHeight = height;
          if (rafId) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            stage && stage.handleResize();
          });
        });
        resizeObserver.observe(containerRef.current);

        stage._cleanupExtras = () => {
          window.removeEventListener("resize", handleResize);
          if (rafId) cancelAnimationFrame(rafId);
          resizeObserver.disconnect();
        };
      } catch (e) {
        console.warn("NGL init error:", e);
        setWebglUnavailable(true);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (stage) {
        try {
          stage._cleanupExtras?.();
          stage.dispose();
        } catch (e) {}
      }
      stageRef.current = null;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, []);

  // Load target protein
  useEffect(() => {
    if (!target) return;
    if (webglUnavailable) return;
    if (!stageRef.current) return;

    setLoading(true);
    setError(null);
    setShowComplex(false);
    setActiveResidue(null);

    const stage = stageRef.current;
    stage.removeAllComponents();
    componentRef.current = null;

    stage
      .loadFile(`/api/pdb/${target}`, { ext: "pdb", name: target })
      .then((comp) => {
        componentRef.current = comp;
        comp.addRepresentation("cartoon", {
          colorScheme: "chainindex",
          opacity: 0.9,
        });
        comp.autoView();
        setLoading(false);
      })
      .catch((e) => {
        setError(`Could not load structure for ${target}`);
        setLoading(false);
      });
  }, [target, webglUnavailable]);

  // Load complex after docking
  useEffect(() => {
    if (!complexFile) return;
    if (webglUnavailable) return;
    if (!stageRef.current) return;

    setLoading(true);
    setShowComplex(true);

    const stage = stageRef.current;
    stage.removeAllComponents();
    componentRef.current = null;

    stage
      .loadFile(`/api/complex/${complexFile}`, { ext: "pdb", name: "complex" })
      .then((comp) => {
        componentRef.current = comp;
        comp.addRepresentation("cartoon", {
          sele: "protein",
          colorScheme: "chainindex",
          opacity: 0.75,
        });
        comp.addRepresentation("licorice", {
          sele: "not protein and not water",
          colorScheme: "element",
          multipleBond: "symmetric",
        });
        const accent =
          getComputedStyle(document.documentElement)
            .getPropertyValue("--accent")
            .trim() || "#00C8FF";
        comp.addRepresentation("surface", {
          sele: "not protein and not water",
          opacity: 0.2,
          color: accent,
        });
        comp.autoView("not protein and not water", 1000);
        setLoading(false);
      })
      .catch((e) => {
        setError("Could not load docking complex");
        setLoading(false);
      });
  }, [complexFile, webglUnavailable]);

  const focusResidue = useCallback(
    (residue) => {
      setActiveResidue(residue);
      if (!stageRef.current || !componentRef.current || webglUnavailable)
        return;
      const match = residue.match(/(\d+)/);
      if (!match) return;
      const resno = parseInt(match[1]);
      const comp = componentRef.current;
      try {
        const accent =
          getComputedStyle(document.documentElement)
            .getPropertyValue("--accent")
            .trim() || "#00C8FF";
        comp.addRepresentation("spacefill", {
          sele: `${resno}`,
          color: accent,
          opacity: 0.85,
          radius: 0.9,
        });
        comp.autoView(`${resno}`, 800);
      } catch (e) {}
    },
    [webglUnavailable],
  );

  useImperativeHandle(ref, () => ({ focusResidue }), [focusResidue]);

  const resetView = () => {
    if (componentRef.current) {
      try {
        componentRef.current.autoView();
      } catch (e) {}
    }
    setActiveResidue(null);
  };

  const successfulDocks = dockingResults.filter(
    (r) => r.docking_status === "success",
  );

  return (
    <div className="viewer-section">
      <div className="viewer-header">
        <div className="viewer-title-row">
          <span className="viewer-title">3D Structure Viewer</span>
          {target && <span className="viewer-target-badge">{target}</span>}
          {showComplex && (
            <span
              style={{
                fontSize: 11,
                color: "var(--green)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Complex
            </span>
          )}
          {loading && <span className="spinner" />}
        </div>
        <div className="viewer-controls">
          {successfulDocks.length > 0 && (
            <select
              className="viewer-compound-select"
              value={selectedDock}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedDock(val);
                if (!val) return;
                const sep = val.indexOf("||");
                const cpd = val.slice(0, sep);
                const tgt = val.slice(sep + 2);
                const row = successfulDocks.find(
                  (r) => r.compound_name === cpd && r.target_name === tgt,
                );
                if (row && onComplexChange) {
                  const res = row.interacting_residues;
                  onComplexChange(
                    row.pdb_file,
                    res && res !== "None"
                      ? res.split("; ").filter(Boolean)
                      : [],
                  );
                }
              }}
              title="Select docking result to view"
            >
              <option value="">Select complex…</option>
              {successfulDocks.map((r, i) => (
                <option key={i} value={`${r.compound_name}||${r.target_name}`}>
                  {r.compound_name} × {r.target_name} ({r.docking_score}{" "}
                  kcal/mol)
                </option>
              ))}
            </select>
          )}
          {complexFile && (
            <a
              href={`/api/complex/${complexFile}`}
              download={complexFile}
              className="viewer-btn"
              title="Download docked complex as PDB"
              style={{ textDecoration: "none" }}
            >
              ↓ PDB
            </a>
          )}
          <button className="viewer-btn" onClick={resetView} title="Reset view">
            ⟲ Reset
          </button>
        </div>
      </div>

      <div className="viewer-body">
        <div className="ngl-viewport">
          <div className="ngl-container" ref={containerRef} />
          {webglUnavailable && (
            <div className="ngl-placeholder">
              <span className="ngl-placeholder-icon">⬡</span>
              <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
                3D Viewer requires WebGL
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  textAlign: "center",
                  maxWidth: 320,
                  lineHeight: 1.8,
                }}
              >
                WebGL is not available in this environment.
                <br />
                Open the app in a desktop browser with GPU support
                <br />
                to view protein and complex structures.
              </span>
              {target && (
                <a
                  href={`/api/pdb/${target}`}
                  download={`${target}.pdb`}
                  style={{
                    marginTop: 8,
                    color: "var(--accent)",
                    fontSize: 12,
                    textDecoration: "none",
                    border: "1px solid var(--accent-border)",
                    background: "var(--accent-dim)",
                    padding: "5px 12px",
                    borderRadius: 6,
                  }}
                >
                  ↓ Download {target} PDB
                </a>
              )}
              {complexFile && (
                <a
                  href={`/api/complex/${complexFile}`}
                  download={complexFile}
                  style={{
                    color: "var(--accent)",
                    fontSize: 12,
                    textDecoration: "none",
                    border: "1px solid var(--accent-border)",
                    background: "var(--accent-dim)",
                    padding: "5px 12px",
                    borderRadius: 6,
                  }}
                >
                  ↓ Download Complex PDB
                </a>
              )}
            </div>
          )}
          {!webglUnavailable && !target && !loading && (
            <div className="ngl-placeholder">
              <span className="ngl-placeholder-icon">⬡</span>
              <span>Select a target to load its structure</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Run docking to view the protein-ligand complex
              </span>
            </div>
          )}
          {!webglUnavailable && error && (
            <div className="ngl-placeholder">
              <span style={{ color: "var(--red)", fontSize: 13 }}>{error}</span>
            </div>
          )}
        </div>
        <ResiduePanel
          residues={residues}
          onResidueClick={focusResidue}
          activeResidue={activeResidue}
        />
      </div>
    </div>
  );
}

const MoleculeViewer = forwardRef(NGLViewerInner);
export default MoleculeViewer;
