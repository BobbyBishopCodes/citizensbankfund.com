"""Render Riley's two PCA subplots from the current cached analysis."""

"""Original code from Riley Murray and updated by Robert Bishop"""
import json
import hashlib
import os
import tempfile
from pathlib import Path
import matplotlib
import matplotlib.pyplot as plt
import matplotlib.patheffects as path_effects
import numpy as np
from matplotlib import font_manager
from fontTools.ttLib import TTFont


matplotlib.use("Agg")


ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "content/portfolio/cluster-analysis.json"
HOLDINGS = ROOT / "content/portfolio/holdings.json"
OUTPUT = ROOT / "public/assets/portfolio/pca-clusters.svg"
INTER_FONTS = [ROOT / f"node_modules/@fontsource/inter/files/inter-latin-{weight}-normal.woff"
               for weight in (400, 600)]
COLORS = ["#2384bb", "#e9792c", "#2db77b", "#9664b7",
          "#d65383", "#c99a1e", "#198f9f", "#718399"]
NAVY = "#173458"
MUTED = "#607590"


def add_page_font():
    """Use the same Inter file that the site's CSS imports."""
    directory = ROOT / ".local/portfolio-fonts"
    directory.mkdir(parents=True, exist_ok=True)
    for source in INTER_FONTS:
        font_bytes = source.read_bytes()
        path = directory / \
            f"inter-{hashlib.sha256(font_bytes).hexdigest()[:12]}.ttf"
        if not path.exists():
            font = TTFont(source)
            font.flavor = None
            font.save(path)
        font_manager.fontManager.addfont(str(path))


def label_2d_points(ax, fig, coords, symbols):
    """Keep ticker names near their original points....."""
    fig.canvas.draw()
    pixels = ax.transData.transform(coords[:, :2])
    scale = fig.dpi / 72
    font_px = 10 * scale
    placed = []
    candidates = [(0, 9), (9, 8), (-9, 8), (0, -10), (10, -9), (-10, -9),
                  (17, 5), (-17, 5), (0, 18), (0, -19)]
    for index, symbol in enumerate(symbols):
        px, py = pixels[index]
        width = len(symbol) * font_px * .62
        height = font_px * 1.1
        best = None
        for dx, dy in candidates:
            center_x, center_y = px + dx * scale, py + dy * scale
            rect = (center_x - width / 2, center_y - height / 2,
                    center_x + width / 2, center_y + height / 2)
            overlap = sum(max(0, min(rect[2], other[2]) - max(rect[0], other[0])) *
                          max(0, min(rect[3], other[3]) -
                              max(rect[1], other[1]))
                          for other in placed)
            marker_overlap = sum(1 for other, (mx, my) in enumerate(pixels)
                                 if other != index and rect[0] - 5 < mx < rect[2] + 5
                                 and rect[1] - 5 < my < rect[3] + 5)
            outside = (max(0, ax.bbox.x0 - rect[0]) + max(0, rect[2] - ax.bbox.x1) +
                       max(0, ax.bbox.y0 - rect[1]) + max(0, rect[3] - ax.bbox.y1))
            score = overlap * 8 + marker_overlap * \
                140 + outside * 50 + abs(dx) + abs(dy)
            if best is None or score < best[0]:
                best = (score, (dx, dy), rect)
        _, offset, rect = best
        placed.append(rect)
        label = ax.annotate(symbol, coords[index, :2], xytext=offset,
                            textcoords="offset points", fontsize=10,
                            ha="center", va="center", color=NAVY)
        label.set_path_effects(
            [path_effects.withStroke(linewidth=1.5, foreground="white")])


def save_svg(figure, digest):
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("wb", dir=OUTPUT.parent, prefix="pca-clusters-",
                                     suffix=".tmp", delete=False) as output:
        temporary = Path(output.name)
    try:
        figure.savefig(temporary, format="svg", facecolor="white",
                       metadata={"Date": None, "Creator": "Citizens Bank Fund"})
        svg = temporary.read_text(encoding="utf-8")
        svg = svg.replace(
            "<svg ", f"<!-- portfolio-analysis-sha256:{digest} -->\n<svg ", 1)
        temporary.write_text(svg, encoding="utf-8", newline="\n")
        os.replace(temporary, OUTPUT)
    finally:
        temporary.unlink(missing_ok=True)
        plt.close(figure)


def render():
    holdings = json.loads(HOLDINGS.read_text(encoding="utf-8"))
    symbols = sorted({position["symbol"] for position in holdings["positions"]
                      if position["assetType"] != "cash"})
    if len(symbols) < 3:
        print("PCA figure needs at least three securities; no figure to render.")
        return
    source = CACHE.read_bytes()
    analysis = json.loads(source)
    if symbols != analysis["symbols"]:
        raise ValueError("Cluster cache does not match current holdings")
    coords = np.asarray(analysis["coordinates"], dtype=float)
    groups = analysis["groups"]
    if coords.shape != (len(symbols), 3) or len(groups) != len(symbols) or not np.isfinite(coords).all():
        raise ValueError("Invalid PCA scores in cluster cache")
    digest = hashlib.sha256(source).hexdigest()
    colors = [COLORS[group % len(COLORS)] for group in groups]

    add_page_font()
    render_figure(coords, symbols, colors, digest)
    print(
        f"Rendered the original PCA subplot layout for {len(symbols)} current securities.")


def render_figure(coords, symbols, colors, digest):
    with plt.rc_context({
        "font.family": "Inter", "font.size": 10,
        "text.color": NAVY, "axes.labelcolor": NAVY, "axes.edgecolor": "#c8d7e5",
        "xtick.color": MUTED, "ytick.color": MUTED,
        "svg.fonttype": "path", "svg.hashsalt": digest,
    }):
        fig = plt.figure(figsize=(14, 6))
        fig.patch.set_facecolor("white")

        ax1 = fig.add_subplot(121)
        points_2d = ax1.scatter(coords[:, 0], coords[:, 1], c=colors, s=100)
        np.testing.assert_allclose(points_2d.get_offsets(), coords[:, :2])
        ax1.set_title("Ticker Clusters (2D PCA)", fontsize=12,
                      fontfamily="Inter SemiBold")
        ax1.set_xlabel("PC1", fontsize=10)
        ax1.set_ylabel("PC2", fontsize=10)

        ax2 = fig.add_subplot(122, projection="3d")
        points_3d = ax2.scatter(
            coords[:, 0], coords[:, 1], coords[:, 2], c=colors, s=100)
        np.testing.assert_allclose(
            np.column_stack(points_3d._offsets3d), coords)
        for index, symbol in enumerate(symbols):
            label = ax2.text(coords[index, 0], coords[index, 1], coords[index, 2],
                             symbol, fontsize=9, color=NAVY)
            label.set_path_effects(
                [path_effects.withStroke(linewidth=1.5, foreground="white")])
        ax2.set_title("Ticker Clusters (3D PCA)", fontsize=12,
                      fontfamily="Inter SemiBold")
        ax2.set_xlabel("PC1", fontsize=10)
        ax2.set_ylabel("PC2", fontsize=10)
        ax2.set_zlabel("PC3", fontsize=10)
        for axis in (ax2.xaxis, ax2.yaxis, ax2.zaxis):
            axis._axinfo["grid"]["color"] = "#dfe7ef"

        fig.tight_layout()
        label_2d_points(ax1, fig, coords, symbols)
        save_svg(fig, digest)


if __name__ == "__main__":
    render()
