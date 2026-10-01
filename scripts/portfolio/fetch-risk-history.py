"""Cache 37 completed month-end adjusted closes and keyless FRED series."""

import csv
import io
import json
import math
import os
import sys
import tempfile
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import yfinance as yf


ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "content/portfolio/risk-history.json"
HOLDINGS = ROOT / "content/portfolio/holdings.json"


def month_start(year, month):
    return date(year + (month == 12), month % 12 + 1, 1)


def fred_series(series, start, end):
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}&cosd={start}&coed={end}"
    with urllib.request.urlopen(url, timeout=20) as response:
        text = response.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames != ["observation_date", series]:
        raise ValueError(f"Unexpected FRED {series} columns")
    rows = []
    for row in reader:
        observation = date.fromisoformat(row["observation_date"])
        if not start <= observation.isoformat() <= end:
            raise ValueError(f"Invalid FRED {series} date")
        value = row[series]
        if not value or value == ".":
            continue
        number = float(value)
        if (not math.isfinite(number) or (series == "SP500" and number <= 0)
                or (series == "DGS3MO" and not -100 < number < 100)):
            raise ValueError(f"Invalid FRED {series} value")
        rows.append({"date": row["observation_date"], "value": value})
    if not rows:
        raise ValueError(f"FRED {series} returned no observations")
    return rows


def fetch():
    holdings = json.loads(HOLDINGS.read_text(encoding="utf-8"))
    symbols = sorted({position["symbol"] for position in holdings["positions"] if position["assetType"] != "cash"})
    if not symbols:
        raise ValueError("No portfolio securities")
    today = datetime.now(ZoneInfo("America/New_York")).date()
    last_completed = date(today.year, today.month, 1)
    first = last_completed
    for _ in range(37):
        first = date(first.year - (first.month == 1), 12 if first.month == 1 else first.month - 1, 1)
    wanted = []
    cursor = first
    while cursor < last_completed:
        wanted.append(cursor.strftime("%Y-%m"))
        cursor = month_start(cursor.year, cursor.month)
    if CACHE.exists():
        try:
            cached = json.loads(CACHE.read_text(encoding="utf-8"))
            rows = cached["months"]
            index_months = {row["date"][:7]: row["date"] for row in cached["benchmark"]}
            yield_months = {row["date"][:7] for row in cached["treasury"]}
            if (len(rows) == 37 and [row["month"] for row in rows] == wanted
                    and all(sorted(row["adjustedCloses"]) == symbols
                            and all(math.isfinite(float(value)) and float(value) > 0
                                    for value in row["adjustedCloses"].values())
                            and index_months.get(row["month"]) == row["closeDate"] for row in rows)
                    and all(month in yield_months for month in wanted[:-1])):
                print("Risk history cache already covers the latest completed month.")
                return
        except (KeyError, IndexError, TypeError, ValueError, OverflowError):
            pass

    # Riley's notebook uses yf.download(..., auto_adjust=True)['Close'].
    history = yf.download(symbols, start=first.isoformat(), end=last_completed.isoformat(),
                          auto_adjust=True, progress=False, threads=True)["Close"]
    if history.empty:
        raise ValueError("Yahoo Finance returned no adjusted closes")
    months = {}
    for timestamp, prices in history.iterrows():
        day = timestamp.date()
        month = day.strftime("%Y-%m")
        if day >= last_completed:
            continue
        closes = {}
        for symbol in symbols:
            price = prices.get(symbol)
            if price is None or not math.isfinite(float(price)) or float(price) <= 0:
                raise ValueError(f"Missing adjusted close for {symbol} on {day}")
            closes[symbol] = str(float(price))
        months[month] = {"month": month, "closeDate": day.isoformat(), "adjustedCloses": closes}
    if len(wanted) != 37 or any(month not in months for month in wanted):
        raise ValueError("Fewer than 37 completed months of adjusted closes")
    benchmark = fred_series("SP500", first.isoformat(), today.isoformat())
    treasury = fred_series("DGS3MO", first.isoformat(), today.isoformat())
    index_months = {row["date"][:7]: row for row in benchmark if row["date"][:7] in wanted}
    yield_months = {row["date"][:7]: row for row in treasury if row["date"][:7] in wanted}
    if any(index_months.get(month, {}).get("date") != months[month]["closeDate"] for month in wanted):
        raise ValueError("FRED S&P 500 history does not align with security month ends")
    if any(month not in yield_months for month in wanted[:-1]):
        raise ValueError("FRED Treasury history has fewer than 36 aligned months")
    document = {"schemaVersion": 1, "priceBasis": "split-and-dividend-adjusted",
                "source": "Yahoo Finance adjusted close via yfinance; FRED SP500 and DGS3MO graph CSV",
                "fetchedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "months": [months[month] for month in wanted], "benchmark": benchmark, "treasury": treasury}
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="\n", dir=CACHE.parent,
                                     prefix="risk-history-", suffix=".tmp", delete=False) as output:
        json.dump(document, output, indent=2)
        output.write("\n")
        temporary = output.name
    os.replace(temporary, CACHE)
    print(f"Cached {len(symbols)} securities and {len(wanted)} completed month-end closes through {wanted[-1]}.")


if __name__ == "__main__":
    try:
        fetch()
    except Exception as error:
        print(f"Risk history refresh failed; using repository cache: {error}", file=sys.stderr)
        sys.exit(1)
