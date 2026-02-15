"""Copy results and experiment scripts to Research 0 folder."""
import shutil
from pathlib import Path

base = Path(__file__).parent
src_results = base / "results"
dst_dir = base / "Research 0"
dst_results = dst_dir / "results"

# Copy results tree
if src_results.exists():
    shutil.copytree(src_results, dst_results, dirs_exist_ok=True)
    print(f"Copied results -> {dst_results}")
else:
    print(f"WARNING: {src_results} not found")

# Copy experiment scripts
for script in ['experiment_targets.py', 'experiment_featuresets.py']:
    src = base / script
    dst = dst_dir / script
    if src.exists():
        shutil.copy2(src, dst)
        print(f"Copied {script}")

print("Done.")
