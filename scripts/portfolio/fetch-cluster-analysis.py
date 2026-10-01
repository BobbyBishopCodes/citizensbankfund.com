"""Refresh daily-return correlation and cluster data for the current holdings."""

"""Original code from Riley Murray and updated by Robert Bishop"""
import os
import json
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import numpy as np
import scipy.cluster.hierarchy as hierarchy
import yfinance as yf
from sklearn.decomposition import PCA
from sklearn.cluster import AgglomerativeClustering


ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "content/portfolio/cluster-analysis.json"
HOLDINGS = ROOT / "content/portfolio/holdings.json"


def refresh():
    holdings = json.loads(HOLDINGS.read_text(encoding="utf-8"))
    symbols = sorted({position["symbol"] for position in holdings["positions"]
                      if position["assetType"] != "cash"})
    if len(symbols) < 3:
        print("Cluster analysis needs at least three securities; no charts to refresh.")
        return

    today = datetime.now(ZoneInfo("America/New_York")).date()
    if CACHE.exists():
        cached = json.loads(CACHE.read_text(encoding="utf-8"))
        if cached.get("refreshedDate") == today.isoformat() and cached.get("symbols") == symbols:
            print("Portfolio cluster cache already covers today's holdings.")
            return

    start = today - timedelta(days=3 * 365 + 6)
    # Riley's calculations use Close and daily percentage returns. Downloading
    # serially avoids the intermittent yfinance cache lock on this symbol set.
    raw = yf.download(symbols, start=start.isoformat(), end=today.isoformat(),
                      auto_adjust=True, threads=False, progress=False)["Close"]
    if raw.empty or set(raw.columns) != set(symbols):
        raise ValueError(
            "Daily history is missing one or more current holdings")
    raw = raw[symbols]
    returns = raw.pct_change(fill_method=None).dropna()
    if len(returns) < 120:
        raise ValueError("Fewer than 120 shared daily returns")
    corr = returns.corr()
    if not np.isfinite(corr.to_numpy()).all():
        raise ValueError("One or more holdings have undefined correlations")

    distance = np.sqrt(0.5 ** (1 - corr.to_numpy()))
    linkage = hierarchy.linkage(distance, method="ward")
    tree = hierarchy.dendrogram(linkage, no_plot=True, labels=symbols)
    count = min(8, len(symbols))
    groups = AgglomerativeClustering(n_clusters=count, metric="precomputed",
                                     linkage="average").fit_predict(distance)
    coords = PCA(n_components=3).fit_transform(corr.to_numpy())
    document = {
        "schemaVersion": 1,
        "symbols": symbols,
        "startDate": returns.index[0].date().isoformat(),
        "endDate": returns.index[-1].date().isoformat(),
        "refreshedDate": today.isoformat(),
        "observations": len(returns),
        "correlation": corr.to_numpy().tolist(),
        "leafOrder": tree["leaves"],
        "branches": [{"x": xs, "y": ys} for xs, ys in zip(tree["dcoord"], tree["icoord"])],
        "groups": groups.tolist(),
        "coordinates": coords.tolist(),
    }
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="\n", dir=CACHE.parent,
                                     prefix="cluster-analysis-", suffix=".tmp", delete=False) as output:
        json.dump(document, output, indent=2)
        output.write("\n")
        temporary = output.name
    os.replace(temporary, CACHE)
    print(
        f"Cached {len(symbols)} holdings and {len(returns)} shared daily returns through {document['endDate']}.")


if __name__ == "__main__":
    refresh()
