# MolProfiler

A computational drug discovery and cheminformatics toolkit for ADME prediction, toxicity analysis, and molecular docking.

## Overview

MolProfiler analyzes chemical compounds (provided as SMILES strings) and generates comprehensive reports covering:
- **ADME properties**: Druglikeness filters (Lipinski, Egan, Ghose, BOILED-Egg), GI absorption, BBB permeability
- **Toxicity predictions**: hERG liability, hepatotoxicity, mutagenicity, CYP450 inhibition alerts
- **Molecular docking**: Docking scores against protein targets (e.g., PPARG, DPP4) via the `dockstring` library
- **Interaction analysis**: Protein-ligand interaction fingerprints via ProLIF/MDAnalysis
- **Compound naming**: Auto-retrieval of compound names from PubChem

## Usage

Run ADME + toxicity analysis on a single SMILES:
```bash
python molprofiler.py --smiles "CC(=O)Oc1ccccc1C(=O)O" --adme
```

Run from a CSV file containing a column of SMILES:
```bash
python molprofiler.py --input SMILES_test.csv --adme --toxicity
```

Run molecular docking:
```bash
python molprofiler.py --smiles "CC(=O)Oc1ccccc1C(=O)O" --dock --target PPARG
```

See all options:
```bash
python molprofiler.py --help
```

## Tech Stack

- **Python 3.12**
- **RDKit** — cheminformatics calculations
- **dockstring** — molecular docking
- **ProLIF / MDAnalysis** — protein-ligand interaction fingerprints
- **pandas / matplotlib / numpy** — data handling and visualization
- **requests** — PubChem API integration

## Key Files

- `molprofiler.py` — main entry point
- `molprofiler_2.py` — alternate version with extended features
- `adme_pred.py` — ADME/druglikeness calculations (`ADME` class)
- `toxicity_predictor.py` — rule-based toxicity alerts (`ToxicityPredictor` class)
- `interaction_analyzer.py` / `int_analyzer.py` — docking interaction utilities
- `compound_namer.py` — PubChem name lookup

## User Preferences

- Keep existing code structure and module organization
