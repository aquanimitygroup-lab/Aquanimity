# interaction_analyzer.py
"""
Minimal protein-ligand interaction analysis using ProLIF.
Analyzes docking poses to identify contacting residues and interaction types.
"""

import prolif as plf
from rdkit import Chem
import MDAnalysis as mda
import os
import requests
import numpy as np

# Map dockstring targets to their PDB IDs
TARGET_TO_PDB = {
    'PTGS2': '5F19',   # COX-2
    'PPARG': '2PRG',   # PPAR-gamma
    'DPP4': '1WCY',    # DPP-4
    'ADRB2': '3NY8',   # Beta-2 adrenergic receptor
    'PDE4D': '1XOS',   # PDE4D
    # Add more as needed
}

def get_clean_pdb(target_name):
    """
    Download clean PDB file for a target if not already cached.
    Returns path to PDB file, or None if target not mapped.
    """
    if target_name not in TARGET_TO_PDB:
        return None
    
    pdb_id = TARGET_TO_PDB[target_name]
    cache_dir = 'clean_pdbs'
    pdb_file = f"{cache_dir}/{pdb_id}.pdb"
    
    if not os.path.exists(pdb_file):
        os.makedirs(cache_dir, exist_ok=True)
        url = f"https://files.rcsb.org/download/{pdb_id}.pdb"
        response = requests.get(url)
        if response.status_code == 200:
            with open(pdb_file, 'w') as f:
                f.write(response.text)
        else:
            return None
    
    return pdb_file

def analyze_interactions(ligand_mol, protein_pdb_path):
    import numpy as np
    import MDAnalysis as mda
    
    u = mda.Universe(protein_pdb_path)  # PDBQT
    lig_coords = ligand_mol.GetConformer(0).GetPositions()
    
    contacts = {}
    for res in u.residues:
        min_dist = np.min([np.linalg.norm(res.atoms.positions - lc, axis=1).min() 
                          for lc in lig_coords])
        if min_dist < 4.5:
            contacts[f"{res.resname}{res.resid}"] = ['Contact']
    
    return {
        'interacting_residues': list(contacts.keys()),
        'interaction_summary': contacts,
        'num_interactions': len(contacts),
        'has_contacts': len(contacts) > 0
    }
    
def format_interactions_for_csv(interaction_result):
    """
    Convert interaction dict to flat strings for CSV export.
    """
    residues = "; ".join(interaction_result.get('interacting_residues', []))
    
    summary_parts = []
    for res, types in interaction_result.get('interaction_summary', {}).items():
        summary_parts.append(f"{res}({','.join(types)})")
    summary = "; ".join(summary_parts)
    
    return {
        'interacting_residues': residues if residues else "None",
        'interaction_details': summary if summary else "None",
        'num_interactions': interaction_result.get('num_interactions', 0),
        'has_contacts': interaction_result.get('has_contacts', False)
    }