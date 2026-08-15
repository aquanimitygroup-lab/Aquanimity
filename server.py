"""
MolProfiler Flask API Backend
Wraps molprofiler_2.py logic for the web frontend.
"""
import os
import sys
import json
import io
import base64
import copy
import traceback
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from flask import Flask, request, jsonify, Response, send_file, abort
from flask_cors import CORS

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dockstring import load_target, list_all_target_names
from adme_pred import ADME
from toxicity_predictor import ToxicityPredictor
from compound_namer import get_compound_name
from int_analyzer import analyze_interactions, format_interactions_for_csv, TARGET_TO_PDB, get_clean_pdb
from rdkit import Chem
import numpy as np

app = Flask(__name__)
CORS(app)

DOCKING_POSES_DIR = os.path.join(os.path.dirname(__file__), 'docking_poses')


# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────

def calculate_adme_properties(smiles):
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    try:
        adme = ADME(smiles)
        properties = {
            "lipinski_pass": adme.druglikeness_lipinski(),
            "lipinski_violations": adme.druglikeness_lipinski(verbose=True),
            "egan_pass": adme.druglikeness_egan(),
            "egan_violations": adme.druglikeness_egan(verbose=True),
            "ghose_pass": adme.druglikeness_ghose(),
            "veber_pass": adme.druglikeness_veber(),
            "veber_violations": adme.druglikeness_veber(verbose=True),
            "muegge_pass": adme.druglikeness_muegge(),
            "gi_absorption": "High" if adme.boiled_egg_hia() else "Low",
            "bbb_permeant": "Yes" if adme.boiled_egg_bbb() else "No",
            "pains_alert": adme.pains(),
            "brenk_alert": adme.brenk(),
            "molecular_weight": round(adme._molecular_weight(), 2),
            "logp": round(adme._logp(), 3),
            "tpsa": round(adme._tpsa(), 2),
            "h_bond_donors": adme._h_bond_donors(),
            "h_bond_acceptors": adme._h_bond_acceptors(),
            "n_rotatable_bonds": adme._n_rot_bonds(),
            "n_atoms": adme._n_atoms(),
            "n_rings": adme._n_rings(),
            "molar_refractivity": round(adme._molar_refractivity(), 2),
        }
        tox = ToxicityPredictor(smiles)
        tox_report = tox.full_toxicity_report()
        properties.update({
            "herg_risk": tox_report['herg_liability']['risk_level'],
            "herg_reasons": "; ".join(tox_report['herg_liability']['reasons']) if tox_report['herg_liability']['reasons'] else "None",
            "hepatotoxicity_alert": "Yes" if tox_report['hepatotoxicity']['alert'] else "No",
            "hepatotoxicity_reasons": "; ".join(tox_report['hepatotoxicity']['reasons']),
            "reactive_metabolite_alert": "Yes" if tox_report['reactive_metabolites']['alert'] else "No",
            "reactive_metabolite_reasons": "; ".join(tox_report['reactive_metabolites']['reasons']),
            "mutagenicity_alert": "Yes" if tox_report['mutagenicity']['alert'] else "No",
            "mutagenicity_reasons": "; ".join(tox_report['mutagenicity']['reasons']),
            "cyp450_risk": tox_report['cyp450_inhibition']['risk_level'],
            "cyp450_isoforms": ", ".join(tox_report['cyp450_inhibition']['at_risk_isoforms']) if tox_report['cyp450_inhibition']['at_risk_isoforms'] else "None",
        })
        return properties
    except Exception as e:
        print(f"ADME error for {smiles}: {e}")
        return None


def passes_druglike_filter(adme_props):
    """Returns True if compound passes Lipinski + Egan + Veber."""
    return (
        adme_props.get('lipinski_pass', False) and
        adme_props.get('egan_pass', False) and
        adme_props.get('veber_pass', False)
    )


PDB_CACHE_DIR = '/tmp/molprofiler_pdb_cache'


def pdbqt_to_pdb(pdbqt_path):
    """Convert PDBQT to PDB using openbabel; cache under /tmp (never inside the package dir)."""
    target_name = os.path.basename(pdbqt_path).replace('_target.pdbqt', '')
    os.makedirs(PDB_CACHE_DIR, exist_ok=True)
    pdb_path = os.path.join(PDB_CACHE_DIR, f'{target_name}_target.pdb')
    if os.path.exists(pdb_path):
        return pdb_path
    try:
        from openbabel import openbabel as ob
        conv = ob.OBConversion()
        conv.SetInAndOutFormats("pdbqt", "pdb")
        mol_ob = ob.OBMol()
        conv.ReadFile(mol_ob, pdbqt_path)
        conv.WriteFile(mol_ob, pdb_path)
        return pdb_path if os.path.exists(pdb_path) else None
    except Exception as e:
        print(f"openbabel error: {e}")
        return None


def dock_smiles(target_obj, smiles, seed=974528263, exhaustiveness=8, n_poses=9):
    """
    Dock a SMILES against a target using the Python vina package.

    Replaces dockstring's target_obj.dock() which shells out to a bundled
    vina_linux binary that crashes under Replit's seccomp sandbox (SIGSYS).
    The Python vina package uses a compiled extension library instead, which
    is not subject to the same syscall restrictions.

    Returns (score, info_dict) with the same shape as dockstring's dock() API.
    """
    import tempfile
    import pathlib
    from vina import Vina
    from dockstring.utils import (
        canonicalize_smiles, smiles_to_mol, sanitize_mol, check_mol, check_charges,
        protonate_mol, embed_mol, refine_mol_with_ff, assign_stereochemistry,
        write_mol_to_mol_file, convert_mol_file_to_pdbqt, convert_pdbqt_to_pdb,
        read_mol_from_pdb, assign_bond_orders, parse_search_box_conf,
    )

    # --- Ligand preparation (identical pipeline to dockstring) ---
    canonical = canonicalize_smiles(smiles)
    mol = smiles_to_mol(canonical)
    mol = sanitize_mol(mol)
    check_mol(mol)
    check_charges(mol)
    protonated = protonate_mol(mol, pH=7.4)
    check_mol(protonated)
    embedded = embed_mol(protonated, seed=seed)
    refined = refine_mol_with_ff(embedded)
    assign_stereochemistry(refined)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = pathlib.Path(tmpdir)
        lig_mol = tmp / 'ligand.mol'
        lig_pdbqt = tmp / 'ligand.pdbqt'
        vina_out = tmp / 'vina.out'
        docked_pdb = tmp / 'docked.pdb'

        write_mol_to_mol_file(refined, lig_mol)
        convert_mol_file_to_pdbqt(lig_mol, lig_pdbqt)

        conf = parse_search_box_conf(target_obj.conf_path)

        v = Vina(sf_name='vina', seed=seed, verbosity=0)
        v.set_receptor(str(target_obj.pdbqt_path))
        v.set_ligand_from_file(str(lig_pdbqt))
        v.compute_vina_maps(
            center=[conf['center_x'], conf['center_y'], conf['center_z']],
            box_size=[conf['size_x'], conf['size_y'], conf['size_z']],
        )
        v.dock(exhaustiveness=exhaustiveness, n_poses=n_poses)

        energies = v.energies(n_poses=n_poses)
        if energies is None or len(energies) == 0:
            return None, {}
        best_score = float(energies[0][0])
        affinities = [float(e[0]) for e in energies]

        v.write_poses(str(vina_out), n_poses=n_poses, overwrite=True)

        # Recover docked ligand mol for complex assembly + interaction analysis
        try:
            convert_pdbqt_to_pdb(pdbqt_file=vina_out, pdb_file=docked_pdb, disable_bonding=True)
            raw_ligand = read_mol_from_pdb(docked_pdb)
            try:
                docked_ligand = assign_bond_orders(raw_ligand, refined)
            except Exception:
                # Bond order recovery can fail when H-counts differ; use H-stripped mol
                docked_ligand = Chem.RemoveHs(raw_ligand)
        except Exception:
            # Fall back to the 3D-embedded (pre-docked) mol if PDB parsing fails
            docked_ligand = refined

        return best_score, {'ligand': docked_ligand, 'affinities': affinities}


# ─────────────────────────────────────────────
#  Routes
# ─────────────────────────────────────────────

@app.route('/api/targets', methods=['GET'])
def get_targets():
    try:
        targets = list_all_target_names()
        return jsonify({"targets": targets})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/adme', methods=['POST'])
def run_adme():
    data = request.get_json(force=True)
    smiles_list = data.get('smiles', [])
    if not smiles_list:
        return jsonify({"error": "No SMILES provided"}), 400

    results = []
    for smiles in smiles_list:
        smiles = smiles.strip()
        if not smiles:
            continue
        compound_name = get_compound_name(smiles)
        adme_props = calculate_adme_properties(smiles)
        if adme_props is not None:
            row = {'compound_name': compound_name, 'smiles': smiles}
            row.update(adme_props)
            results.append(row)
        else:
            results.append({'smiles': smiles, 'compound_name': 'Unknown', 'error': 'Invalid SMILES'})

    return jsonify({"results": results})


@app.route('/api/dock', methods=['POST'])
def run_dock():
    """Streaming docking endpoint — yields NDJSON progress events."""
    data = request.get_json(force=True)
    smiles_list = data.get('smiles', [])
    target_list = data.get('targets', [])
    filter_druglike = data.get('filter_druglike', False)

    if not smiles_list or not target_list:
        return jsonify({"error": "smiles and targets are required"}), 400

    def generate():
        # 1. ADME pass
        adme_results = []
        for smiles in smiles_list:
            smiles = smiles.strip()
            if not smiles:
                continue
            mol = Chem.MolFromSmiles(smiles)
            if mol is None:
                yield json.dumps({"type": "log", "msg": f"Invalid SMILES skipped: {smiles}"}) + '\n'
                continue
            compound_name = get_compound_name(smiles)
            props = calculate_adme_properties(smiles)
            if props is None:
                continue
            row = {'compound_name': compound_name, 'smiles': smiles}
            row.update(props)
            adme_results.append(row)
            yield json.dumps({"type": "adme_result", "data": row}) + '\n'

        # 2. Optional filter
        if filter_druglike:
            before = len(adme_results)
            adme_results = [r for r in adme_results if passes_druglike_filter(r)]
            filtered = before - len(adme_results)
            yield json.dumps({"type": "log", "msg": f"Filtered {filtered} compound(s) that failed Lipinski/Egan/Veber"}) + '\n'

        if not adme_results:
            yield json.dumps({"type": "complete", "adme_results": [], "docking_results": []}) + '\n'
            return

        # 3. Docking
        docking_results = []
        total = len(adme_results) * len(target_list)
        completed = 0

        for target_name in target_list:
            try:
                target_obj = load_target(target_name)
            except Exception as e:
                yield json.dumps({"type": "log", "msg": f"Failed to load target {target_name}: {e}"}) + '\n'
                continue

            for row in adme_results:
                smiles = row['smiles']
                compound_name = row.get('compound_name', smiles[:20])
                completed += 1
                progress_pct = round((completed / total) * 100, 1)

                yield json.dumps({
                    "type": "progress",
                    "compound": compound_name,
                    "smiles": smiles,
                    "target": target_name,
                    "progress": progress_pct,
                    "completed": completed,
                    "total": total,
                    "status": "running"
                }) + '\n'

                try:
                    score, info = dock_smiles(target_obj, smiles)
                    ligand = info.get('ligand')

                    if score is not None and ligand is not None:
                        os.makedirs(DOCKING_POSES_DIR, exist_ok=True)
                        safe_smiles = smiles[:25].replace('/', '_').replace('\\', '_').replace(' ', '_')
                        safe_target = target_name.replace('/', '_')
                        complex_file = os.path.join(DOCKING_POSES_DIR, f"{safe_target}_{safe_smiles}_complex.pdb")

                        pdbqt_path = str(target_obj.pdbqt_path)
                        pdb_path = pdbqt_to_pdb(pdbqt_path)

                        interaction_data = {
                            'interacting_residues': 'None',
                            'interaction_details': 'None',
                            'num_interactions': 0,
                            'has_contacts': False,
                        }

                        try:
                            ligand_copy = Chem.Mol(ligand)
                            try:
                                Chem.SanitizeMol(ligand_copy, catchErrors=True)
                            except Exception:
                                ligand_copy = Chem.RemoveHs(ligand_copy)
                                ligand_copy = Chem.AddHs(ligand_copy, addCoords=True)
                            ligand_pdb = Chem.MolToPDBBlock(ligand_copy)

                            if pdb_path:
                                with open(pdb_path, 'r') as f:
                                    protein_lines = f.readlines()
                                with open(complex_file, 'w') as f:
                                    for line in protein_lines:
                                        if not line.startswith('END'):
                                            f.write(line)
                                    f.write(ligand_pdb)
                                    f.write('END\n')

                            interaction_result = analyze_interactions(ligand, pdbqt_path)
                            interaction_data = format_interactions_for_csv(interaction_result)
                        except Exception as ie:
                            print(f"Interaction/complex error: {ie}")

                        result = {
                            'smiles': smiles,
                            'compound_name': compound_name,
                            'target_name': target_name,
                            'docking_score': round(float(score), 3),
                            'affinity_list': str(info.get('affinities', [])),
                            'pdb_file': os.path.basename(complex_file),
                            'docking_status': 'success',
                            'interacting_residues': interaction_data['interacting_residues'],
                            'interaction_details': interaction_data['interaction_details'],
                            'num_interactions': int(interaction_data['num_interactions']),
                            'has_contacts': bool(interaction_data['has_contacts']),
                        }
                    else:
                        result = {
                            'smiles': smiles,
                            'compound_name': compound_name,
                            'target_name': target_name,
                            'docking_score': None,
                            'docking_status': 'failed: no pose found',
                            'interacting_residues': 'None',
                            'num_interactions': 0,
                            'has_contacts': False,
                        }

                except Exception as e:
                    result = {
                        'smiles': smiles,
                        'compound_name': compound_name,
                        'target_name': target_name,
                        'docking_score': None,
                        'docking_status': f'failed: {str(e)[:200]}',
                        'interacting_residues': 'None',
                        'num_interactions': 0,
                        'has_contacts': False,
                    }

                docking_results.append(result)
                yield json.dumps({
                    "type": "dock_result",
                    "data": result,
                    "compound": compound_name,
                    "target": target_name,
                    "status": result['docking_status']
                }) + '\n'

        yield json.dumps({
            "type": "complete",
            "adme_results": adme_results,
            "docking_results": docking_results
        }) + '\n'

    return Response(generate(), mimetype='application/x-ndjson')


@app.route('/api/pdb/<target_name>', methods=['GET'])
def get_target_pdb(target_name):
    """Return PDB content for a given target (for 3D viewer)."""
    try:
        # 1. Try clean PDB from RCSB (preferred — no HETATM artifacts)
        clean_path = get_clean_pdb(target_name)
        if clean_path and os.path.exists(clean_path):
            return send_file(clean_path, mimetype='text/plain')

        # 2. Fall back: convert dockstring's PDBQT to PDB
        target_obj = load_target(target_name)
        pdbqt_path = str(target_obj.pdbqt_path)
        pdb_path = pdbqt_to_pdb(pdbqt_path)
        if pdb_path and os.path.exists(pdb_path):
            return send_file(pdb_path, mimetype='text/plain')

        abort(404, f"No PDB found for target {target_name}")
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/complex/<path:filename>', methods=['GET'])
def get_complex_pdb(filename):
    """Serve a docking complex PDB from docking_poses/."""
    safe = os.path.basename(filename)
    path = os.path.join(DOCKING_POSES_DIR, safe)
    if not os.path.exists(path):
        abort(404, f"Complex file not found: {safe}")
    return send_file(path, mimetype='text/plain')


@app.route('/api/boiledegg', methods=['POST'])
def boiled_egg_plot():
    """Generate a multi-compound BOILED-Egg plot and return as base64 PNG."""
    data = request.get_json() or {}
    smiles_list = data.get('smiles', [])
    if not smiles_list:
        return jsonify({"error": "No SMILES provided"}), 400
    try:
        # Use the first molecule's class-level ellipses (they're constants)
        first_adme = ADME(smiles_list[0])
        colors = plt.cm.tab10.colors

        fig, axis = plt.subplots(figsize=(7, 5))
        fig.patch.set_facecolor('#0d1117')
        axis.set_facecolor('#111827')
        axis.tick_params(colors='#9ca3af')
        axis.xaxis.label.set_color('#9ca3af')
        axis.yaxis.label.set_color('#9ca3af')
        for spine in axis.spines.values():
            spine.set_edgecolor('#1f2937')

        white = copy.deepcopy(first_adme.BOILED_EGG_HIA_ELLIPSE)
        yolk  = copy.deepcopy(first_adme.BOILED_EGG_BBB_ELLIPSE)
        white.set_clip_box(axis.bbox)
        white.set_facecolor('#e5e7eb')
        white.set_alpha(0.85)
        axis.add_artist(white)
        yolk.set_clip_box(axis.bbox)
        yolk.set_facecolor('#f59e0b')
        yolk.set_alpha(0.9)
        axis.add_artist(yolk)

        axis.set_xlim(-10, 200)
        axis.set_ylim(-4, 8)
        axis.set_xlabel('TPSA (Å²)', fontsize=10)
        axis.set_ylabel('LogP', fontsize=10)
        axis.set_title('BOILED-Egg — GI Absorption & BBB Permeability', color='#d1d5db', fontsize=11, pad=10)

        legend_handles = []
        for i, smi in enumerate(smiles_list[:10]):  # cap at 10 for readability
            try:
                adme_mol = ADME(smi)
                logp = adme_mol._logp()
                tpsa = adme_mol._tpsa()
                label = get_compound_name(smi) or smi[:16]
                color = colors[i % len(colors)]
                sc = axis.scatter(tpsa, logp, color=color, zorder=10, s=80, edgecolors='white', linewidths=0.5, label=label)
                legend_handles.append(sc)
            except Exception:
                pass

        if legend_handles:
            legend = axis.legend(fontsize=8, loc='upper right', framealpha=0.3,
                                 facecolor='#0d1117', edgecolor='#1f2937', labelcolor='#d1d5db')

        # Annotations
        axis.text(80, 7.2, 'GI Absorbed', color='#374151', fontsize=8, ha='center')
        axis.text(25, 2.5, 'BBB+', color='#92400e', fontsize=8, ha='center')

        buf = io.BytesIO()
        fig.savefig(buf, format='png', dpi=130, bbox_inches='tight', facecolor=fig.get_facecolor())
        buf.seek(0)
        img_b64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.close(fig)
        return jsonify({'image': f'data:image/png;base64,{img_b64}'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})


if __name__ == '__main__':
    app.run(host='localhost', port=8000, debug=False)
