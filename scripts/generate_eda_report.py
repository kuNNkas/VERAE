#!/usr/bin/env python
from __future__ import annotations

import csv
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

BASE_DIR = Path(__file__).resolve().parents[1]
TRAIN_DIR = BASE_DIR / "train_data"
OUT_DIR = BASE_DIR / "reports" / "eda"

DATASETS = {
    "X_kdl": TRAIN_DIR / "X_kdl.csv",
    "X_29n": TRAIN_DIR / "X_29n.csv",
    "X_ext": TRAIN_DIR / "X_ext.csv",
}

TARGETS_PATH = TRAIN_DIR / "y.csv"

@dataclass
class DatasetStats:
    name: str
    rows: int
    cols: int
    complete_rate: float
    missing_rates: Dict[str, float]
    numeric_stats: Dict[str, Dict[str, float]]
    correlations: Dict[str, float]


@dataclass
class Targets:
    y_iron: List[float]
    y_ida: List[float]
    iron_pos: int
    ida_pos: int


def read_csv(path: Path) -> Tuple[List[str], List[List[str]]]:
    with path.open(newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = [row for row in reader]
    return header, rows


def parse_float(value: str) -> float | None:
    if value == "" or value.lower() == "nan":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def load_targets() -> Targets:
    header, rows = read_csv(TARGETS_PATH)
    iron_idx = header.index("Y_IRON_DEFICIENCY")
    ida_idx = header.index("Y_IDA")
    y_iron = []
    y_ida = []
    iron_pos = 0
    ida_pos = 0
    for row in rows:
        iron_val = 1.0 if row[iron_idx] in ("1", "1.0") else 0.0
        ida_val = 1.0 if row[ida_idx] in ("1", "1.0") else 0.0
        y_iron.append(iron_val)
        y_ida.append(ida_val)
        iron_pos += int(iron_val)
        ida_pos += int(ida_val)
    return Targets(y_iron=y_iron, y_ida=y_ida, iron_pos=iron_pos, ida_pos=ida_pos)


def compute_dataset_stats(name: str, path: Path, y_values: List[float]) -> DatasetStats:
    header, rows = read_csv(path)
    rows_count = len(rows)
    cols_count = len(header)

    missing_counts = [0] * cols_count
    complete_rows = 0

    numeric_stats: Dict[str, Dict[str, float]] = {col: {"count": 0, "sum": 0.0, "sum_sq": 0.0, "min": math.inf, "max": -math.inf} for col in header}

    for row in rows:
        row_missing = False
        for idx, value in enumerate(row):
            val = parse_float(value)
            if val is None:
                missing_counts[idx] += 1
                row_missing = True
                continue
            stats = numeric_stats[header[idx]]
            stats["count"] += 1
            stats["sum"] += val
            stats["sum_sq"] += val * val
            stats["min"] = min(stats["min"], val)
            stats["max"] = max(stats["max"], val)
        if not row_missing:
            complete_rows += 1

    missing_rates = {header[idx]: missing_counts[idx] / rows_count for idx in range(cols_count)}

    for col, stats in numeric_stats.items():
        if stats["count"] == 0:
            stats["mean"] = math.nan
            stats["std"] = math.nan
            stats["min"] = math.nan
            stats["max"] = math.nan
        else:
            mean = stats["sum"] / stats["count"]
            variance = max((stats["sum_sq"] / stats["count"]) - mean * mean, 0.0)
            stats["mean"] = mean
            stats["std"] = math.sqrt(variance)

    correlations = compute_correlations(header, rows, y_values)

    return DatasetStats(
        name=name,
        rows=rows_count,
        cols=cols_count,
        complete_rate=complete_rows / rows_count,
        missing_rates=missing_rates,
        numeric_stats=numeric_stats,
        correlations=correlations,
    )


def compute_correlations(header: List[str], rows: List[List[str]], y_values: List[float]) -> Dict[str, float]:
    y_mean = sum(y_values) / len(y_values)
    y_var = sum((y - y_mean) ** 2 for y in y_values) / len(y_values)
    y_std = math.sqrt(y_var) if y_var > 0 else 0.0
    correlations: Dict[str, float] = {}

    for col_idx, col in enumerate(header):
        xs: List[float] = []
        ys: List[float] = []
        for row, y in zip(rows, y_values):
            val = parse_float(row[col_idx])
            if val is None:
                continue
            xs.append(val)
            ys.append(y)
        if len(xs) < 2:
            correlations[col] = 0.0
            continue
        x_mean = sum(xs) / len(xs)
        x_var = sum((x - x_mean) ** 2 for x in xs) / len(xs)
        x_std = math.sqrt(x_var) if x_var > 0 else 0.0
        if x_std == 0 or y_std == 0:
            correlations[col] = 0.0
            continue
        cov = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys)) / len(xs)
        correlations[col] = cov / (x_std * y_std)
    return correlations


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def svg_bar_chart(title: str, labels: List[str], values: List[float], width: int = 900, height: int = 420, bar_color: str = "#4C78A8") -> str:
    padding_left = 160
    padding_bottom = 80
    padding_top = 50
    padding_right = 30
    chart_width = width - padding_left - padding_right
    chart_height = height - padding_top - padding_bottom

    max_value = max(values) if values else 1.0
    if max_value == 0:
        max_value = 1.0

    bar_count = len(values)
    bar_width = chart_width / max(bar_count, 1)

    lines = [f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}'>"]
    lines.append(f"<rect width='100%' height='100%' fill='white' />")
    lines.append(f"<text x='{width/2}' y='30' font-family='Arial' font-size='16' text-anchor='middle'>{title}</text>")
    lines.append(f"<line x1='{padding_left}' y1='{padding_top}' x2='{padding_left}' y2='{padding_top + chart_height}' stroke='#333' />")
    lines.append(f"<line x1='{padding_left}' y1='{padding_top + chart_height}' x2='{padding_left + chart_width}' y2='{padding_top + chart_height}' stroke='#333' />")

    for idx, (label, value) in enumerate(zip(labels, values)):
        bar_height = (value / max_value) * chart_height
        x = padding_left + idx * bar_width + 4
        y = padding_top + chart_height - bar_height
        lines.append(f"<rect x='{x:.1f}' y='{y:.1f}' width='{bar_width - 8:.1f}' height='{bar_height:.1f}' fill='{bar_color}' />")
        lines.append(
            f"<text x='{x + (bar_width - 8) / 2:.1f}' y='{padding_top + chart_height + 20}' font-family='Arial' font-size='10' text-anchor='middle' transform='rotate(45 {x + (bar_width - 8) / 2:.1f},{padding_top + chart_height + 20})'>{label}</text>"
        )
        lines.append(
            f"<text x='{x + (bar_width - 8) / 2:.1f}' y='{y - 6:.1f}' font-family='Arial' font-size='10' text-anchor='middle'>{value:.2f}</text>"
        )

    lines.append("</svg>")
    return "\n".join(lines)


def svg_histogram(title: str, values: List[float], bins: int = 20, width: int = 900, height: int = 420) -> str:
    if not values:
        values = [0.0]
    min_val = min(values)
    max_val = max(values)
    if min_val == max_val:
        max_val = min_val + 1.0
    bin_width = (max_val - min_val) / bins
    counts = [0] * bins
    for val in values:
        idx = int((val - min_val) / bin_width)
        if idx == bins:
            idx -= 1
        counts[idx] += 1
    max_count = max(counts) if counts else 1
    padding_left = 60
    padding_bottom = 50
    padding_top = 50
    padding_right = 20
    chart_width = width - padding_left - padding_right
    chart_height = height - padding_top - padding_bottom

    lines = [f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}'>"]
    lines.append("<rect width='100%' height='100%' fill='white' />")
    lines.append(f"<text x='{width/2}' y='30' font-family='Arial' font-size='16' text-anchor='middle'>{title}</text>")
    lines.append(f"<line x1='{padding_left}' y1='{padding_top}' x2='{padding_left}' y2='{padding_top + chart_height}' stroke='#333' />")
    lines.append(f"<line x1='{padding_left}' y1='{padding_top + chart_height}' x2='{padding_left + chart_width}' y2='{padding_top + chart_height}' stroke='#333' />")

    bar_width = chart_width / bins
    for idx, count in enumerate(counts):
        bar_height = (count / max_count) * chart_height
        x = padding_left + idx * bar_width
        y = padding_top + chart_height - bar_height
        lines.append(f"<rect x='{x:.1f}' y='{y:.1f}' width='{bar_width - 2:.1f}' height='{bar_height:.1f}' fill='#72B7B2' />")

    lines.append("</svg>")
    return "\n".join(lines)


def write_svg(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def format_percent(value: float) -> str:
    return f"{value * 100:.1f}%"


def build_report(stats: Dict[str, DatasetStats], targets: Targets, out_dir: Path) -> str:
    html_lines = [
        "<html><head><meta charset='utf-8'><title>EDA Report</title>",
        "<style>",
        "body { font-family: Arial, sans-serif; margin: 24px; }",
        "h1, h2, h3 { color: #1a1a1a; }",
        "table { border-collapse: collapse; width: 100%; margin: 12px 0 24px; }",
        "th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }",
        "th { background: #f4f4f4; }",
        "img { max-width: 100%; }",
        ".section { margin-bottom: 32px; }",
        "</style>",
        "</head><body>",
        "<h1>EDA: X_kdl / X_29n / X_ext</h1>",
        "<p>Отчёт сформирован автоматически скриптом <code>scripts/generate_eda_report.py</code>.</p>",
        "<p><strong>Примечание:</strong> файл <code>eda_report.doc</code> содержит HTML-разметку и открывается в Microsoft Word.</p>",
        "<div class='section'>",
        "<h2>Баланс классов</h2>",
        "<table>",
        "<tr><th>Target</th><th>Positive</th><th>Total</th><th>Share</th></tr>",
    ]
    total = len(targets.y_iron)
    html_lines.append(
        f"<tr><td>Y_IRON_DEFICIENCY</td><td>{targets.iron_pos}</td><td>{total}</td><td>{format_percent(targets.iron_pos/total)}</td></tr>"
    )
    html_lines.append(
        f"<tr><td>Y_IDA</td><td>{targets.ida_pos}</td><td>{total}</td><td>{format_percent(targets.ida_pos/total)}</td></tr>"
    )
    html_lines.extend(["</table>", "</div>"])

    for name, dataset in stats.items():
        html_lines.append("<div class='section'>")
        html_lines.append(f"<h2>{name}</h2>")
        html_lines.append(
            f"<p>Строк: <strong>{dataset.rows}</strong>, колонок: <strong>{dataset.cols}</strong>, полные строки: <strong>{format_percent(dataset.complete_rate)}</strong>.</p>"
        )

        missing_sorted = sorted(dataset.missing_rates.items(), key=lambda x: x[1], reverse=True)
        html_lines.append("<h3>Топ пропусков</h3>")
        html_lines.append("<table><tr><th>Feature</th><th>Missing rate</th></tr>")
        for feature, rate in missing_sorted[:15]:
            html_lines.append(f"<tr><td>{feature}</td><td>{format_percent(rate)}</td></tr>")
        html_lines.append("</table>")

        html_lines.append("<h3>Ключевые статистики (выборка)</h3>")
        html_lines.append("<table><tr><th>Feature</th><th>Mean</th><th>Std</th><th>Min</th><th>Max</th></tr>")
        for feature, stats_row in list(dataset.numeric_stats.items())[:12]:
            mean = stats_row.get("mean", math.nan)
            std = stats_row.get("std", math.nan)
            min_val = stats_row.get("min", math.nan)
            max_val = stats_row.get("max", math.nan)
            html_lines.append(
                f"<tr><td>{feature}</td><td>{mean:.2f}</td><td>{std:.2f}</td><td>{min_val:.2f}</td><td>{max_val:.2f}</td></tr>"
            )
        html_lines.append("</table>")

        corr_sorted = sorted(dataset.correlations.items(), key=lambda x: x[1], reverse=True)
        html_lines.append("<h3>Корреляции с Y_IRON_DEFICIENCY (top +/-)</h3>")
        html_lines.append("<table><tr><th>Feature</th><th>Correlation</th></tr>")
        for feature, corr in corr_sorted[:8]:
            html_lines.append(f"<tr><td>{feature}</td><td>{corr:.3f}</td></tr>")
        for feature, corr in corr_sorted[-8:]:
            html_lines.append(f"<tr><td>{feature}</td><td>{corr:.3f}</td></tr>")
        html_lines.append("</table>")

        html_lines.append(f"<h3>Визуализации</h3>")
        html_lines.append(f"<p><img src='{name}_missing.svg' alt='Missing rates {name}'></p>")
        html_lines.append(f"<p><img src='{name}_corr.svg' alt='Correlations {name}'></p>")
        if name == "X_29n":
            html_lines.append("<p><img src='X_29n_hist_hgb.svg' alt='Histogram HGB'></p>")
            html_lines.append("<p><img src='X_29n_hist_mcv.svg' alt='Histogram MCV'></p>")
            html_lines.append("<p><img src='X_29n_hist_rdw.svg' alt='Histogram RDW'></p>")
        html_lines.append("</div>")

    html_lines.append("</body></html>")
    return "\n".join(html_lines)


def main() -> None:
    ensure_dir(OUT_DIR)
    targets = load_targets()

    stats: Dict[str, DatasetStats] = {}
    for name, path in DATASETS.items():
        stats[name] = compute_dataset_stats(name, path, targets.y_iron)

    # Charts
    for name, dataset in stats.items():
        missing_sorted = sorted(dataset.missing_rates.items(), key=lambda x: x[1], reverse=True)[:12]
        labels = [item[0] for item in missing_sorted]
        values = [item[1] * 100 for item in missing_sorted]
        missing_svg = svg_bar_chart(f"{name}: Missing rate (top 12)", labels, values, bar_color="#F58518")
        write_svg(OUT_DIR / f"{name}_missing.svg", missing_svg)

        corr_sorted = sorted(dataset.correlations.items(), key=lambda x: abs(x[1]), reverse=True)[:12]
        corr_labels = [item[0] for item in corr_sorted]
        corr_values = [item[1] for item in corr_sorted]
        corr_svg = svg_bar_chart(f"{name}: Correlation with Y_IRON_DEFICIENCY", corr_labels, corr_values, bar_color="#54A24B")
        write_svg(OUT_DIR / f"{name}_corr.svg", corr_svg)

    # Histograms for X_29n
    x29n_header, x29n_rows = read_csv(DATASETS["X_29n"])
    def get_values(col_name: str) -> List[float]:
        idx = x29n_header.index(col_name)
        values: List[float] = []
        for row in x29n_rows:
            val = parse_float(row[idx])
            if val is not None:
                values.append(val)
        return values

    for col, title in [("LBXHGB", "HGB"), ("LBXMCVSI", "MCV"), ("LBXRDW", "RDW")]:
        values = get_values(col)
        hist_svg = svg_histogram(f"X_29n: {title} distribution", values)
        write_svg(OUT_DIR / f"X_29n_hist_{title.lower()}.svg", hist_svg)

    report_html = build_report(stats, targets, OUT_DIR)
    (OUT_DIR / "eda_report.html").write_text(report_html, encoding="utf-8")
    (OUT_DIR / "eda_report.doc").write_text(report_html, encoding="utf-8")


if __name__ == "__main__":
    main()
