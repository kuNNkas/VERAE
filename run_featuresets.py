"""Simple wrapper to run featuresets experiment"""
import subprocess
import sys
from pathlib import Path

# Get script directory
script_dir = Path(__file__).parent
experiment_script = script_dir / "experiment_featuresets.py"

# Run the experiment
result = subprocess.run([sys.executable, str(experiment_script)], cwd=script_dir)
sys.exit(result.returncode)
