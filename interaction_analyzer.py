# interaction_analyzer.py
"""
Minimal protein-ligand interaction analysis using ProLIF.
Analyzes docking poses to identify contacting residues and interaction types.
"""

import prolif as plf
from rdkit import Chem
import MDAnalysis as mda

def analyze_interactions(ligand_mol, protein_pdb_path, interaction_types=None):
    """
    Analyze protein-ligand interactions for a docked pose.
    
    Args:
        ligand_mol: RDKit Mol with 3D coordinates (from dockstring info['ligand'])
        protein_pdb_path: Path to protein PDB/PDBQT file
        interaction_types: List of interactions to check. 
                          Default: ["HBDonor", "HBAcceptor", "Hydrophobic", "PiStacking", "Cationic"]
    
    Returns:
        dict with keys:
            - interacting_residues: list of residue IDs (e.g., ["ASP129.A", "TYR359.B"])
            - interaction_summary: dict mapping residue -> list of interaction types
            - num_interactions: total count of interactions
            - has_contacts: bool (True if any interactions found)
    """
    if interaction_types is None:
        interaction_types = ["HBDonor", "HBAcceptor", "Hydrophobic", "PiStacking", "Cationic"]
    
    try:
        # Load protein via MDAnalysis (handles PDBQT better than RDKit)
        u = mda.Universe(protein_pdb_path)
        
        # Wrap ligand in ProLIF Molecule
        lig = plf.Molecule(ligand_mol)
        
        # Generate fingerprint
        fp = plf.Fingerprint(interaction_types)
        ifp = fp.generate(lig, u)
        
        # Parse results
        interacting_residues = []
        interaction_summary = {}
        
        for (lig_key, prot_key), interactions in ifp.items():
            res_id = str(prot_key)
            if res_id not in interaction_summary:
                interaction_summary[res_id] = []
                interacting_residues.append(res_id)
            
            for int_type, metadata in interactions.items():
                if metadata:  # interaction detected
                    interaction_summary[res_id].append(int_type)
        
        num_interactions = sum(len(v) for v in interaction_summary.values())
        
        return {
            'interacting_residues': interacting_residues,
            'interaction_summary': interaction_summary,
            'num_interactions': num_interactions,
            'has_contacts': num_interactions > 0
        }
        
    except Exception as e:
        return {
            'interacting_residues': [],
            'interaction_summary': {},
            'num_interactions': 0,
            'has_contacts': False,
            'error': str(e)
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