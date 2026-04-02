#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
from datetime import UTC, datetime
from io import StringIO
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, urlunparse

import numpy as np
import pandas as pd
import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "data" / "slepi"
RAW_DIR = OUTPUT_DIR / "raw"
MANIFEST_PATH = OUTPUT_DIR / "source_manifest.json"
PANEL_PATH = OUTPUT_DIR / "monthly_panel.csv"
INDEX_PATH = OUTPUT_DIR / "index_series.csv"
BACKTEST_PATH = OUTPUT_DIR / "backtest_metrics.json"
NOTE_PATH = OUTPUT_DIR / "methodology_assessment.md"
FRESHNESS_PATH = OUTPUT_DIR / "freshness.json"
SNAPSHOT_PATH = OUTPUT_DIR / "snapshot.json"

EXTERNAL_SECTOR_URL = "https://www.cbsl.gov.lk/en/statistics/statistical-tables/external-sector"
ADVANCE_RELEASE_CALENDAR_URL = "https://www.cbsl.gov.lk/en/advance-release-calendar-2026"
USD_SPOT_LOOKUP_URL = "https://www.cbsl.gov.lk/cbsl_custom/exrates/exrates_spot_mid.php"
USD_SPOT_RESULTS_URL = "https://www.cbsl.gov.lk/cbsl_custom/exrates/exrates_results_spot_mid.php"

SOURCE_LABELS = {
    "current_account": {
        "label": "Monthly Current Account Balance (2023 January to Latest)",
        "filename": "monthly_current_account_balance.xlsx",
    },
    "exports": {
        "label": "Exports - Monthly (2006 to Latest)",
        "filename": "exports_monthly.xlsx",
    },
    "imports": {
        "label": "Imports - Monthly (2006 to Latest)",
        "filename": "imports_monthly.xlsx",
    },
    "tourism": {
        "label": "Earnings from Tourism (2009 January to Latest)",
        "filename": "tourism_monthly.xlsx",
    },
    "remittances": {
        "label": "Workers Remittances (2009 January to Latest)",
        "filename": "remittances_monthly.xlsx",
    },
    "reserve_history": {
        "label": "Reserve Data Template - Historical",
        "filename": "reserve_data_template_historical.xlsx",
    },
    "services": {
        "label": "Monthly Services Sector Data (2023 January to Latest)",
        "filename": "services_monthly.xlsx",
    },
}

ENRICHMENT_SOURCE_KEYWORDS = {
    "bop_quarterly": {
        "keywords": ["balance of payments", "bpm6", "quarterly"],
        "filename": "bop_quarterly_bpm6.xlsx",
    },
}

LOCAL_BACKFILL_FILES = {
    "historical_fx": ROOT / "data" / "external" / "historical_fx.csv",
    "historical_reserves": ROOT / "data" / "external" / "D12_reserves_compiled.csv",
    "historical_exports": ROOT / "data" / "external" / "monthly_exports_usd.csv",
    "historical_imports": ROOT / "data" / "external" / "monthly_imports_usd.csv",
    "historical_tourism": ROOT / "data" / "external" / "tourism_earnings_monthly.csv",
    "historical_remittances": ROOT / "data" / "external" / "remittances_monthly.csv",
}

RELEASE_LAG_NOTES = {
    "external_sector_tables": {
        "description": (
            "CBSL's 2026 advance release calendar schedules the broad external-sector release "
            "(trade, current account, tourism, services, reserve template and related press "
            "release) on the last business day of the following month."
        ),
        "examples": [
            "January 2026 reference period -> February 27, 2026 release",
            "February 2026 reference period -> March 31, 2026 release",
        ],
        "source": ADVANCE_RELEASE_CALENDAR_URL,
    },
    "workers_remittances": {
        "description": (
            "CBSL's 2026 advance release calendar schedules workers' remittances around the "
            "first or second Friday of the following month."
        ),
        "examples": [
            "January 2026 reference period -> February 6, 2026 release",
            "February 2026 reference period -> March 6, 2026 release",
        ],
        "source": ADVANCE_RELEASE_CALENDAR_URL,
    },
    "fx_intervention": {
        "description": (
            "CBSL's 2026 advance release calendar schedules monthly FX intervention data on the "
            "first Friday of the following month."
        ),
        "examples": [
            "January 2026 reference period -> February 6, 2026 release",
            "February 2026 reference period -> March 6, 2026 release",
        ],
        "source": ADVANCE_RELEASE_CALENDAR_URL,
    },
    "bop_quarterly": {
        "description": (
            "CBSL publishes quarterly Balance of Payments (BPM6) data with approximately a "
            "one-quarter lag. The table includes portfolio investment flows and primary income "
            "(debt service interest) used for the enriched SLEPI variant."
        ),
        "examples": [
            "2025 Q3 reference period -> approximately December 2025 / January 2026 release",
            "2025 Q4 reference period -> approximately March / April 2026 release",
        ],
        "source": ADVANCE_RELEASE_CALENDAR_URL,
    },
}


def ensure_output_dirs() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def json_ready(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_ready(item) for item in value]
    if isinstance(value, tuple):
        return [json_ready(item) for item in value]
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    if isinstance(value, np.generic):
        return value.item()
    if pd.isna(value):
        return None
    return value


def write_json(path: Path, payload: Any) -> None:
    rendered = json.dumps(json_ready(payload), indent=2, sort_keys=True, allow_nan=False)
    if path.exists() and path.read_text() == rendered:
        return
    path.write_text(rendered)


def write_text(path: Path, content: str) -> None:
    if path.exists() and path.read_text() == content:
        return
    path.write_text(content)


def make_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36"
            )
        }
    )
    return session


def normalize_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    text = str(value).strip().lower()
    text = text.replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text)
    return text


def parse_number(value: Any) -> float | None:
    if pd.isna(value):
        return None
    if isinstance(value, (int, float, np.integer, np.floating)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    text = text.replace(",", "")
    text = re.sub(r"\([a-z]+\)", "", text, flags=re.I)
    text = re.sub(r"[^\d.\-]", "", text)
    if not text or text in {"-", ".", "-."}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def fetch_external_sector_soup(session: requests.Session) -> BeautifulSoup:
    response = session.get(EXTERNAL_SECTOR_URL, timeout=60)
    response.raise_for_status()
    return BeautifulSoup(response.text, "html.parser")


def discover_source_urls(soup: BeautifulSoup) -> dict[str, dict[str, Any]]:
    discovered: dict[str, dict[str, Any]] = {}
    for key, spec in SOURCE_LABELS.items():
        link = soup.find("a", string=spec["label"])
        if link is None or not link.get("href"):
            raise RuntimeError(f"Unable to discover CBSL link for: {spec['label']}")
        url = requests.compat.urljoin(EXTERNAL_SECTOR_URL, link["href"])
        discovered[key] = {
            "label": spec["label"],
            "url": url,
            "filename": spec["filename"],
        }
    return discovered


def discover_enrichment_sources(soup: BeautifulSoup) -> dict[str, dict[str, Any]]:
    """Discover optional enrichment sources using keyword matching on link text."""
    discovered: dict[str, dict[str, Any]] = {}
    for key, spec in ENRICHMENT_SOURCE_KEYWORDS.items():
        for link in soup.find_all("a"):
            text = normalize_text(link.get_text())
            if all(kw in text for kw in spec["keywords"]) and link.get("href"):
                url = requests.compat.urljoin(EXTERNAL_SECTOR_URL, link["href"])
                discovered[key] = {
                    "label": link.get_text().strip(),
                    "url": url,
                    "filename": spec["filename"],
                }
                break
    return discovered


def head_metadata(session: requests.Session, url: str) -> dict[str, Any]:
    response = session.head(url, allow_redirects=True, timeout=60)
    if response.status_code >= 400:
        response = session.get(url, stream=True, timeout=60)
        response.raise_for_status()
        response.close()
    return {
        "etag": response.headers.get("etag"),
        "last_modified": response.headers.get("last-modified"),
        "content_length": response.headers.get("content-length"),
        "content_type": response.headers.get("content-type"),
        "status_code": response.status_code,
    }


def download_source(session: requests.Session, url: str, path: Path) -> None:
    response = session.get(url, timeout=120)
    response.raise_for_status()
    path.write_bytes(response.content)


def refresh_sources(session: requests.Session, force: bool) -> dict[str, Any]:
    previous = read_json(MANIFEST_PATH)
    previous_sources = previous.get("sources", {})
    checked_at = now_iso()

    soup = fetch_external_sector_soup(session)
    discovered = discover_source_urls(soup)
    enrichment = discover_enrichment_sources(soup)
    all_discovered = {**discovered, **enrichment}
    manifest_sources: dict[str, Any] = {}
    changed_sources: list[str] = []

    for key, spec in all_discovered.items():
        metadata = head_metadata(session, spec["url"])
        raw_path = RAW_DIR / spec["filename"]
        current_entry = {
            "label": spec["label"],
            "url": spec["url"],
            "download_path": str(raw_path.relative_to(ROOT)),
            **metadata,
        }
        manifest_sources[key] = current_entry

        previous_entry = previous_sources.get(key, {})
        changed = force or not raw_path.exists()
        for field in ["url", "etag", "last_modified", "content_length"]:
            if previous_entry.get(field) != current_entry.get(field):
                changed = True
                break

        if changed:
            download_source(session, spec["url"], raw_path)
            changed_sources.append(key)

    sources_changed = previous_sources != manifest_sources
    manifest = {
        "checked_at": checked_at,
        "built_at": checked_at if sources_changed or not previous else previous.get("built_at", checked_at),
        "external_sector_url": EXTERNAL_SECTOR_URL,
        "sources": manifest_sources,
        "changed_sources": changed_sources if sources_changed or not previous else previous.get("changed_sources", []),
        "release_lag_notes": RELEASE_LAG_NOTES,
    }
    write_json(MANIFEST_PATH, manifest)
    return manifest


def first_nonempty_value(row: pd.Series) -> str:
    for value in row.tolist():
        text = normalize_text(value)
        if text:
            return text
    return ""


def find_row_by_first_value(df: pd.DataFrame, target: str) -> int:
    target_norm = normalize_text(target)
    for idx in range(df.shape[0]):
        if first_nonempty_value(df.iloc[idx]) == target_norm:
            return idx
    raise ValueError(f"Unable to find row for '{target}'")


def find_row_containing(df: pd.DataFrame, needle: str) -> int:
    needle_norm = normalize_text(needle)
    for idx in range(df.shape[0]):
        row_text = " | ".join(normalize_text(value) for value in df.iloc[idx].tolist())
        if needle_norm in row_text:
            return idx
    raise ValueError(f"Unable to find row containing '{needle}'")


def find_value_in_sheet(df: pd.DataFrame, patterns: list[str]) -> float | None:
    normalized_patterns = [normalize_text(pattern) for pattern in patterns]
    for idx in range(df.shape[0]):
        row = df.iloc[idx]
        row_text = " | ".join(normalize_text(value) for value in row.tolist())
        if all(pattern in row_text for pattern in normalized_patterns):
            for value in reversed(row.tolist()):
                parsed = parse_number(value)
                if parsed is not None:
                    return parsed
    return None


def parse_total_series_sheet(path: Path, sheet_name: str, total_label: str, value_name: str) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name=sheet_name, header=None)
    header_row = find_row_by_first_value(df, "Category")
    total_row = find_row_by_first_value(df, total_label)

    rows: list[dict[str, Any]] = []
    for column in range(df.shape[1]):
        date_value = df.iloc[header_row, column]
        if not isinstance(date_value, (pd.Timestamp, datetime)):
            continue
        numeric_value = parse_number(df.iloc[total_row, column])
        if numeric_value is None:
            continue
        rows.append(
            {
                "date": pd.to_datetime(date_value).normalize().replace(day=1),
                value_name: numeric_value,
            }
        )
    return pd.DataFrame(rows).sort_values("date").drop_duplicates("date")


def parse_year_token(value: Any) -> int | None:
    if pd.isna(value):
        return None
    match = re.search(r"(19|20)\d{2}", str(value))
    if not match:
        return None
    return int(match.group(0))


def parse_month_token(value: Any) -> int | None:
    text = normalize_text(value)
    if not text:
        return None
    month_map = {
        "january": 1,
        "february": 2,
        "march": 3,
        "april": 4,
        "may": 5,
        "june": 6,
        "july": 7,
        "august": 8,
        "september": 9,
        "october": 10,
        "november": 11,
        "december": 12,
    }
    return month_map.get(text)


def find_year_header_row(df: pd.DataFrame) -> int:
    best_row = -1
    best_count = 0
    for idx in range(min(df.shape[0], 15)):
        count = sum(parse_year_token(value) is not None for value in df.iloc[idx].tolist())
        if count > best_count:
            best_count = count
            best_row = idx
    if best_row == -1 or best_count < 4:
        raise ValueError("Unable to locate year header row")
    return best_row


def parse_wide_month_year_sheet(path: Path, value_name: str) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name=0, header=None)
    year_row = find_year_header_row(df)
    years = {
        column: parse_year_token(df.iloc[year_row, column])
        for column in range(df.shape[1])
        if parse_year_token(df.iloc[year_row, column]) is not None
    }

    month_column = None
    for idx in range(year_row + 1, df.shape[0]):
        for column in range(df.shape[1]):
            if parse_month_token(df.iloc[idx, column]) is not None:
                month_column = column
                break
        if month_column is not None:
            break

    if month_column is None:
        raise ValueError(f"Unable to locate month column in {path.name}")

    rows: list[dict[str, Any]] = []
    for idx in range(year_row + 1, df.shape[0]):
        month_number = parse_month_token(df.iloc[idx, month_column])
        if month_number is None:
            continue
        for column, year in years.items():
            if year is None:
                continue
            numeric_value = parse_number(df.iloc[idx, column])
            if numeric_value is None:
                continue
            rows.append(
                {
                    "date": pd.Timestamp(year=year, month=month_number, day=1),
                    value_name: numeric_value,
                }
            )

    result = pd.DataFrame(rows)
    if result.empty:
        raise ValueError(f"Failed to parse wide month-year sheet: {path.name}")
    return result.sort_values("date").drop_duplicates("date")


def parse_current_account_sheet(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name=0, header=None)
    title_row = find_row_containing(df, "Current and Capital Account")
    usd_row = find_row_by_first_value(df, "USD")
    current_account_row = find_row_by_first_value(df, "Current Account")
    current_capital_row = find_row_by_first_value(df, "Current Account + Capital Account")

    date_columns = [
        column
        for column in range(df.shape[1])
        if isinstance(df.iloc[title_row, column], (pd.Timestamp, datetime))
    ]
    dates = [pd.to_datetime(df.iloc[title_row, column]).normalize().replace(day=1) for column in date_columns]

    records: list[dict[str, Any]] = []
    for date_column, date in zip(date_columns, dates):
        records.append(
            {
                "date": date,
                "usd_lkr": parse_number(df.iloc[usd_row, date_column]),
                "current_account_usd_m": parse_number(df.iloc[current_account_row, date_column + 2]),
                "current_account_plus_capital_usd_m": parse_number(
                    df.iloc[current_capital_row, date_column + 2]
                ),
            }
        )
    return pd.DataFrame(records).sort_values("date").drop_duplicates("date")


def parse_reserve_history(path: Path) -> pd.DataFrame:
    workbook = pd.ExcelFile(path)
    rows: list[dict[str, Any]] = []

    for sheet_name in workbook.sheet_names:
        try:
            date = pd.to_datetime(sheet_name, format="%b-%Y").normalize().replace(day=1)
        except ValueError:
            continue

        df = pd.read_excel(path, sheet_name=sheet_name, header=None)
        rows.append(
            {
                "date": date,
                "gross_reserves_usd_m": find_value_in_sheet(df, ["Official Reserve Assets"]),
                "fx_reserves_usd_m": find_value_in_sheet(df, ["Foreign currency reserves"]),
                "imf_position_usd_m": find_value_in_sheet(df, ["Reserve position in the IMF"]),
                "sdrs_usd_m": find_value_in_sheet(df, ["SDRs"]),
                "gold_usd_m": find_value_in_sheet(df, ["Gold"]),
                "other_reserves_usd_m": find_value_in_sheet(df, ["Other reserve assets"]),
            }
        )

    result = pd.DataFrame(rows).sort_values("date").drop_duplicates("date")
    if result.empty:
        raise ValueError(f"Failed to parse reserve history workbook: {path.name}")
    return result


def parse_quarter_token(value: Any) -> pd.Timestamp | None:
    """Parse a quarter identifier into a Timestamp for the first month of that quarter."""
    if pd.isna(value):
        return None
    if isinstance(value, (pd.Timestamp, datetime)):
        dt = pd.to_datetime(value)
        quarter_month = ((dt.month - 1) // 3) * 3 + 1
        return pd.Timestamp(year=dt.year, month=quarter_month, day=1)
    text = str(value).strip()
    # Match "2012 Q1", "2012Q1", "2012 1Q", "2012-Q1", etc.
    m = re.match(r"(\d{4})\s*[-]?\s*Q?(\d)\s*Q?", text, re.I)
    if m and 1 <= int(m.group(2)) <= 4:
        year, q = int(m.group(1)), int(m.group(2))
        return pd.Timestamp(year=year, month=(q - 1) * 3 + 1, day=1)
    # Match "Q1 2012", "1Q 2012", etc.
    m = re.match(r"Q?(\d)\s*Q?\s*(\d{4})", text, re.I)
    if m and 1 <= int(m.group(1)) <= 4:
        q, year = int(m.group(1)), int(m.group(2))
        return pd.Timestamp(year=year, month=(q - 1) * 3 + 1, day=1)
    return None


def find_quarter_header_row(df: pd.DataFrame) -> int:
    best_row = -1
    best_count = 0
    for idx in range(min(df.shape[0], 15)):
        count = sum(parse_quarter_token(value) is not None for value in df.iloc[idx].tolist())
        if count > best_count:
            best_count = count
            best_row = idx
    if best_row == -1 or best_count < 4:
        raise ValueError("Unable to locate quarter header row in BOP table")
    return best_row


def find_bop_row(df: pd.DataFrame, primary_needle: str, secondary_needle: str | None = None) -> int:
    """Find a BOP row by keyword.  If secondary_needle is given, find primary first then
    search below it for the secondary keyword."""
    primary_norm = normalize_text(primary_needle)
    if secondary_needle is None:
        return find_row_containing(df, primary_needle)

    secondary_norm = normalize_text(secondary_needle)
    primary_idx = None
    for idx in range(df.shape[0]):
        row_text = " | ".join(normalize_text(v) for v in df.iloc[idx].tolist())
        if primary_norm in row_text:
            primary_idx = idx
            break
    if primary_idx is None:
        raise ValueError(f"Unable to find '{primary_needle}' in BOP table")

    for idx in range(primary_idx + 1, min(primary_idx + 10, df.shape[0])):
        first_val = normalize_text(df.iloc[idx, 0]) if df.shape[1] > 0 else ""
        row_text = " | ".join(normalize_text(v) for v in df.iloc[idx].tolist())
        if secondary_norm in row_text or secondary_norm in first_val:
            return idx
    raise ValueError(f"Unable to find '{secondary_needle}' below '{primary_needle}' in BOP table")


def parse_bop_quarterly(path: Path) -> pd.DataFrame:
    """Parse CBSL BOP (BPM6) quarterly Excel to extract portfolio investment and primary income debit."""
    df = pd.read_excel(path, sheet_name=0, header=None)
    quarter_row = find_quarter_header_row(df)

    quarters: dict[int, pd.Timestamp] = {}
    for col in range(df.shape[1]):
        q = parse_quarter_token(df.iloc[quarter_row, col])
        if q is not None:
            quarters[col] = q

    portfolio_row = find_row_containing(df, "Portfolio Investment")
    primary_income_debit_row = find_bop_row(df, "Primary Income", "Debit")

    records: list[dict[str, Any]] = []
    for col, quarter_date in quarters.items():
        portfolio = parse_number(df.iloc[portfolio_row, col])
        pi_debit = parse_number(df.iloc[primary_income_debit_row, col])
        records.append(
            {
                "date": quarter_date,
                "portfolio_investment_usd_m": portfolio,
                "primary_income_debit_usd_m": abs(pi_debit) if pi_debit is not None else None,
            }
        )

    result = pd.DataFrame(records).sort_values("date").drop_duplicates("date")
    if result.empty:
        raise ValueError(f"Failed to parse BOP quarterly workbook: {path.name}")
    return result


def expand_quarterly_to_monthly(df: pd.DataFrame, value_columns: list[str]) -> pd.DataFrame:
    """Expand quarterly flow data to monthly by distributing evenly (dividing by 3)."""
    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        quarter_start = pd.Timestamp(row["date"])
        for month_offset in range(3):
            month_date = quarter_start + pd.DateOffset(months=month_offset)
            monthly_row: dict[str, Any] = {"date": month_date}
            for col in value_columns:
                val = row[col]
                monthly_row[col] = val / 3.0 if pd.notna(val) else None
            rows.append(monthly_row)
    return pd.DataFrame(rows).sort_values("date").drop_duplicates("date")


def combine_series(
    official_df: pd.DataFrame,
    fallback_df: pd.DataFrame | None,
    columns: list[str],
) -> pd.DataFrame:
    official = official_df.set_index("date") if not official_df.empty else pd.DataFrame(index=pd.Index([], name="date"))
    if fallback_df is None or fallback_df.empty:
        combined = official.copy()
        return combined.reset_index()[["date", *columns]]

    fallback = fallback_df.set_index("date")
    union_index = official.index.union(fallback.index).sort_values()
    combined = pd.DataFrame(index=union_index)

    for column in columns:
        official_series = official[column] if column in official.columns else pd.Series(index=official.index, dtype=float)
        fallback_series = fallback[column] if column in fallback.columns else pd.Series(index=fallback.index, dtype=float)
        combined[column] = official_series.reindex(union_index).combine_first(fallback_series.reindex(union_index))

    return combined.reset_index().rename(columns={"index": "date"})


def fetch_daily_usd_spot_rates(
    session: requests.Session,
    start_date: str,
    end_date: str,
) -> pd.DataFrame:
    session.get(USD_SPOT_LOOKUP_URL, timeout=60).raise_for_status()
    payload = {
        "lookupPage": "lookup_daily_exchange_rates.php",
        "startRange": "2006-11-11",
        "rangeType": "dates",
        "txtStart": start_date,
        "txtEnd": end_date,
        "chk_cur[]": "USD~US Dollar",
        "submit_button": "Submit",
    }
    response = session.post(USD_SPOT_RESULTS_URL, data=payload, timeout=120)
    response.raise_for_status()

    tables = pd.read_html(StringIO(response.text))
    if not tables:
        raise RuntimeError("CBSL USD spot-rate query returned no tables")

    daily = tables[0].copy()
    if "Date" not in daily.columns:
        raise RuntimeError("CBSL USD spot-rate query returned an unexpected table layout")

    rate_column = next((column for column in daily.columns if "USD" in str(column) and "LKR" in str(column)), None)
    if rate_column is None:
        raise RuntimeError("Unable to identify the USD/LKR column in the CBSL FX table")

    daily = daily.rename(columns={rate_column: "usd_lkr"})
    daily["date"] = pd.to_datetime(daily["Date"])
    daily["usd_lkr"] = pd.to_numeric(daily["usd_lkr"], errors="coerce")
    daily = daily[["date", "usd_lkr"]].dropna().sort_values("date").reset_index(drop=True)
    daily.to_csv(RAW_DIR / "usd_spot_daily.csv", index=False)
    return daily


def load_local_backfill() -> dict[str, pd.DataFrame]:
    reserves = pd.read_csv(LOCAL_BACKFILL_FILES["historical_reserves"], parse_dates=["date"])[
        ["date", "gross_reserves_usd_m", "fx_reserves_usd_m", "imf_position_usd_m", "sdrs_usd_m", "gold_usd_m"]
    ]
    exports = pd.read_csv(LOCAL_BACKFILL_FILES["historical_exports"], parse_dates=["date"])
    imports = pd.read_csv(LOCAL_BACKFILL_FILES["historical_imports"], parse_dates=["date"])
    tourism = pd.read_csv(LOCAL_BACKFILL_FILES["historical_tourism"], parse_dates=["date"])
    remittances = pd.read_csv(LOCAL_BACKFILL_FILES["historical_remittances"], parse_dates=["date"])
    fx = pd.read_csv(LOCAL_BACKFILL_FILES["historical_fx"], parse_dates=["date"])
    return {
        "reserves": reserves,
        "exports": exports,
        "imports": imports,
        "tourism": tourism,
        "remittances": remittances,
        "fx": fx,
    }


def realtime_zscore(series: pd.Series, min_obs: int = 24, clip_at: float = 5.0) -> pd.Series:
    mean = series.expanding(min_obs).mean().shift(1)
    std = series.expanding(min_obs).std(ddof=0).shift(1).replace(0, np.nan)
    zscore = (series - mean) / std
    return zscore.clip(-clip_at, clip_at)


def mean_if_complete(df: pd.DataFrame, columns: list[str]) -> pd.Series:
    out = df[columns].mean(axis=1)
    out.loc[~df[columns].notna().all(axis=1)] = np.nan
    return out


def auc_score(y_true: pd.Series, score: pd.Series) -> float | None:
    frame = pd.DataFrame({"y": y_true, "score": score}).dropna()
    if frame["y"].nunique() < 2:
        return None
    ranks = frame["score"].rank(method="average").to_numpy()
    y = frame["y"].to_numpy()
    positives = int(y.sum())
    negatives = len(y) - positives
    rank_sum_positive = ranks[y == 1].sum()
    auc = (rank_sum_positive - positives * (positives + 1) / 2) / (positives * negatives)
    return float(auc)


def build_panel(session: requests.Session, manifest: dict[str, Any]) -> pd.DataFrame:
    raw_paths = {
        key: ROOT / entry["download_path"]
        for key, entry in manifest["sources"].items()
    }

    official_exports = parse_total_series_sheet(
        raw_paths["exports"], "2.02 In USD 2007-2026", "Total exports", "exports_usd_m"
    )
    official_imports = parse_total_series_sheet(
        raw_paths["imports"], "2.04 In USD 2007-2026", "Total imports", "imports_usd_m"
    )
    official_tourism = parse_wide_month_year_sheet(raw_paths["tourism"], "tourism_earnings_usd_m")
    official_remittances = parse_wide_month_year_sheet(raw_paths["remittances"], "remittances_usd_m")
    official_current_account = parse_current_account_sheet(raw_paths["current_account"])
    official_reserves = parse_reserve_history(raw_paths["reserve_history"])
    official_daily_fx = fetch_daily_usd_spot_rates(session, "2025-01-01", datetime.now().strftime("%Y-%m-%d"))
    official_monthly_fx = (
        official_daily_fx.assign(date=official_daily_fx["date"].values.astype("datetime64[M]"))
        .groupby("date", as_index=False)["usd_lkr"]
        .mean()
    )

    local = load_local_backfill()

    reserves = combine_series(
        official_reserves,
        local["reserves"],
        ["gross_reserves_usd_m", "fx_reserves_usd_m", "imf_position_usd_m", "sdrs_usd_m", "gold_usd_m"],
    )
    exports = combine_series(official_exports, local["exports"], ["exports_usd_m"])
    imports = combine_series(official_imports, local["imports"], ["imports_usd_m"])
    tourism = combine_series(official_tourism, local["tourism"], ["tourism_earnings_usd_m"])
    remittances = combine_series(official_remittances, local["remittances"], ["remittances_usd_m"])
    fx = combine_series(
        official_monthly_fx,
        local["fx"],
        ["usd_lkr"],
    )

    all_dates = sorted(
        set(reserves["date"])
        | set(exports["date"])
        | set(imports["date"])
        | set(tourism["date"])
        | set(remittances["date"])
        | set(fx["date"])
        | set(official_current_account["date"])
    )
    panel = pd.DataFrame({"date": all_dates})

    for dataset in [reserves, exports, imports, tourism, remittances, fx]:
        panel = panel.merge(dataset, on="date", how="left")
    panel = panel.merge(
        official_current_account[["date", "current_account_usd_m", "current_account_plus_capital_usd_m"]],
        on="date",
        how="left",
    )

    # Enrichment: debt service and portfolio flows from BOP quarterly (optional)
    if "bop_quarterly" in raw_paths:
        try:
            bop_quarterly = parse_bop_quarterly(raw_paths["bop_quarterly"])
            bop_monthly = expand_quarterly_to_monthly(
                bop_quarterly,
                ["portfolio_investment_usd_m", "primary_income_debit_usd_m"],
            )
            panel = panel.merge(bop_monthly, on="date", how="left")
        except Exception as exc:
            print(f"Warning: Failed to parse BOP quarterly data: {exc}")
            panel["portfolio_investment_usd_m"] = np.nan
            panel["primary_income_debit_usd_m"] = np.nan
    else:
        panel["portfolio_investment_usd_m"] = np.nan
        panel["primary_income_debit_usd_m"] = np.nan

    panel = panel.sort_values("date").reset_index(drop=True)

    panel["imports_trailing_3m_avg_usd_m"] = panel["imports_usd_m"].rolling(3, min_periods=3).mean()
    panel["import_cover_months"] = panel["gross_reserves_usd_m"] / panel["imports_trailing_3m_avg_usd_m"]
    panel["trade_balance_usd_m"] = panel["exports_usd_m"] - panel["imports_usd_m"]
    panel["buffer_inflows_usd_m"] = panel["tourism_earnings_usd_m"] + panel["remittances_usd_m"]
    panel["buffer_inflows_share_imports"] = panel["buffer_inflows_usd_m"] / panel["imports_usd_m"]
    panel["underlying_balance_official_usd_m"] = panel["current_account_usd_m"] - panel["buffer_inflows_usd_m"]

    fit = panel.dropna(subset=["underlying_balance_official_usd_m", "trade_balance_usd_m"]).copy()
    if len(fit) >= 12:
        x = np.c_[np.ones(len(fit)), fit["trade_balance_usd_m"].to_numpy()]
        y = fit["underlying_balance_official_usd_m"].to_numpy()
        intercept, slope = np.linalg.lstsq(x, y, rcond=None)[0]
        overlap_corr = float(fit[["trade_balance_usd_m", "underlying_balance_official_usd_m"]].corr().iloc[0, 1])
    else:
        intercept, slope, overlap_corr = 0.0, 1.0, None

    panel["underlying_balance_proxy_usd_m"] = intercept + slope * panel["trade_balance_usd_m"]
    panel["current_account_proxy_usd_m"] = panel["underlying_balance_proxy_usd_m"] + panel["buffer_inflows_usd_m"]
    panel["current_account_filled_usd_m"] = panel["current_account_usd_m"].combine_first(panel["current_account_proxy_usd_m"])
    panel["underlying_balance_filled_usd_m"] = panel["underlying_balance_official_usd_m"].combine_first(
        panel["underlying_balance_proxy_usd_m"]
    )

    panel["reserve_block_raw"] = -np.log(panel["import_cover_months"])
    panel["fx_market_pressure_raw"] = np.log(panel["usd_lkr"]).diff()
    panel["external_balance_pressure_user_raw"] = -panel["current_account_filled_usd_m"] / panel["imports_usd_m"]
    panel["external_balance_pressure_adjusted_raw"] = -panel["underlying_balance_filled_usd_m"] / panel["imports_usd_m"]
    panel["buffer_inflow_support_raw"] = -panel["buffer_inflows_share_imports"]

    # Enrichment block raw indicators (quarterly BOP data distributed to monthly)
    panel["debt_service_pressure_raw"] = panel["primary_income_debit_usd_m"] / panel["imports_usd_m"]
    panel["net_portfolio_pressure_raw"] = -panel["portfolio_investment_usd_m"] / panel["imports_usd_m"]

    for column in [
        "reserve_block_raw",
        "fx_market_pressure_raw",
        "external_balance_pressure_user_raw",
        "external_balance_pressure_adjusted_raw",
        "buffer_inflow_support_raw",
        "debt_service_pressure_raw",
        "net_portfolio_pressure_raw",
    ]:
        panel[column.replace("_raw", "_z")] = realtime_zscore(panel[column].astype(float))

    user_columns = [
        "reserve_block_z",
        "fx_market_pressure_z",
        "external_balance_pressure_user_z",
        "buffer_inflow_support_z",
    ]
    adjusted_columns = [
        "reserve_block_z",
        "fx_market_pressure_z",
        "external_balance_pressure_adjusted_z",
        "buffer_inflow_support_z",
    ]
    enriched_columns = [
        "reserve_block_z",
        "fx_market_pressure_z",
        "external_balance_pressure_adjusted_z",
        "buffer_inflow_support_z",
        "debt_service_pressure_z",
        "net_portfolio_pressure_z",
    ]
    panel["slepi_user_spec"] = mean_if_complete(panel, user_columns)
    panel["slepi_adjusted"] = mean_if_complete(panel, adjusted_columns)
    panel["slepi_enriched"] = mean_if_complete(panel, enriched_columns)

    panel.attrs["proxy_intercept"] = float(intercept)
    panel.attrs["proxy_slope"] = float(slope)
    panel.attrs["proxy_overlap_corr"] = overlap_corr
    panel.attrs["proxy_overlap_n"] = int(len(fit))
    panel.attrs["official_current_account_start"] = (
        fit["date"].min().strftime("%Y-%m-%d") if not fit.empty else None
    )
    panel.attrs["official_current_account_end"] = (
        fit["date"].max().strftime("%Y-%m-%d") if not fit.empty else None
    )
    return panel


def run_backtest(panel: pd.DataFrame) -> dict[str, Any]:
    backtest = panel.copy()
    backtest["future_fx_depreciation_3m"] = np.log(backtest["usd_lkr"].shift(-3) / backtest["usd_lkr"])
    backtest["future_reserve_loss_3m"] = -np.log(
        backtest["gross_reserves_usd_m"].shift(-3) / backtest["gross_reserves_usd_m"]
    )
    backtest["future_import_cover_loss_3m"] = -(backtest["import_cover_months"].shift(-3) - backtest["import_cover_months"])

    target_columns = [
        "future_fx_depreciation_3m",
        "future_reserve_loss_3m",
        "future_import_cover_loss_3m",
    ]
    for column in target_columns:
        series = backtest[column]
        backtest[f"{column}_z_full"] = (series - series.mean()) / series.std(ddof=0)

    backtest["future_external_stress_3m"] = backtest[
        [f"{column}_z_full" for column in target_columns]
    ].mean(axis=1)
    stress_threshold = float(backtest["future_external_stress_3m"].quantile(0.85))
    backtest["future_stress_event_3m"] = (backtest["future_external_stress_3m"] >= stress_threshold).astype(int)

    sample = backtest[
        (backtest["date"] >= pd.Timestamp("2014-01-01"))
        & (backtest["date"] <= backtest["date"].max() - pd.DateOffset(months=3))
    ].copy()

    metrics: dict[str, Any] = {
        "sample_start": sample["date"].min().strftime("%Y-%m-%d"),
        "sample_end": sample["date"].max().strftime("%Y-%m-%d"),
        "stress_event_quantile": 0.85,
        "stress_event_threshold": stress_threshold,
        "proxy_fit": {
            "intercept": panel.attrs.get("proxy_intercept"),
            "slope": panel.attrs.get("proxy_slope"),
            "overlap_correlation": panel.attrs.get("proxy_overlap_corr"),
            "overlap_months": panel.attrs.get("proxy_overlap_n"),
            "official_overlap_start": panel.attrs.get("official_current_account_start"),
            "official_overlap_end": panel.attrs.get("official_current_account_end"),
        },
        "data_sufficiency": {
            "official_current_account_non_null_months": int(panel["current_account_usd_m"].notna().sum()),
            "official_reserve_non_null_months": int(
                panel.loc[panel["date"] >= pd.Timestamp("2013-11-01"), "gross_reserves_usd_m"].notna().sum()
            ),
            "long_backtest_start": panel["date"].min().strftime("%Y-%m-%d"),
            "long_backtest_end": panel["date"].max().strftime("%Y-%m-%d"),
        },
    }

    crisis_window = sample[
        (sample["date"] >= pd.Timestamp("2021-07-01")) & (sample["date"] <= pd.Timestamp("2022-06-01"))
    ].copy()

    for column in ["slepi_user_spec", "slepi_adjusted", "slepi_enriched"]:
        valid = sample[[column, "future_external_stress_3m", "future_stress_event_3m"]].dropna()
        peak_row = crisis_window.loc[crisis_window[column].idxmax()] if crisis_window[column].notna().any() else None
        metrics[column] = {
            "correlation_with_future_external_stress_3m": float(
                valid[[column, "future_external_stress_3m"]].corr().iloc[0, 1]
            )
            if len(valid) >= 3
            else None,
            "auc_for_top_15pct_future_stress_event": auc_score(
                valid["future_stress_event_3m"], valid[column]
            ),
            "available_months": int(valid.shape[0]),
            "crisis_window_peak_date": peak_row["date"].strftime("%Y-%m-%d") if peak_row is not None else None,
            "crisis_window_peak_value": float(peak_row[column]) if peak_row is not None else None,
        }

    return metrics


def latest_non_null_month(panel: pd.DataFrame, column: str) -> str | None:
    valid = panel.loc[panel[column].notna(), "date"]
    if valid.empty:
        return None
    return pd.to_datetime(valid.iloc[-1]).strftime("%Y-%m-%d")


def build_freshness_summary(panel: pd.DataFrame, manifest: dict[str, Any]) -> dict[str, Any]:
    latest_complete = panel.loc[panel["slepi_adjusted"].notna()].tail(1)
    latest_complete_date = (
        pd.to_datetime(latest_complete["date"].iloc[0]).strftime("%Y-%m-%d")
        if not latest_complete.empty
        else None
    )
    latest_complete_value = float(latest_complete["slepi_adjusted"].iloc[0]) if not latest_complete.empty else None

    latest_enriched = panel.loc[panel["slepi_enriched"].notna()].tail(1)
    latest_enriched_date = (
        pd.to_datetime(latest_enriched["date"].iloc[0]).strftime("%Y-%m-%d")
        if not latest_enriched.empty
        else None
    )
    latest_enriched_value = float(latest_enriched["slepi_enriched"].iloc[0]) if not latest_enriched.empty else None

    latest_available = {
        "fx_market_pressure": latest_non_null_month(panel, "usd_lkr"),
        "current_account": latest_non_null_month(panel, "current_account_filled_usd_m"),
        "gross_reserves": latest_non_null_month(panel, "gross_reserves_usd_m"),
        "imports": latest_non_null_month(panel, "imports_usd_m"),
        "tourism": latest_non_null_month(panel, "tourism_earnings_usd_m"),
        "remittances": latest_non_null_month(panel, "remittances_usd_m"),
        "buffer_inflows": latest_non_null_month(panel, "buffer_inflows_usd_m"),
        "debt_service": latest_non_null_month(panel, "primary_income_debit_usd_m"),
        "portfolio_flows": latest_non_null_month(panel, "portfolio_investment_usd_m"),
    }

    required_columns = {
        "fx_market_pressure": "usd_lkr",
        "import_cover": "import_cover_months",
        "current_account": "current_account_filled_usd_m",
        "buffer_inflows": "buffer_inflows_usd_m",
    }
    lag_summary: list[dict[str, Any]] = []
    if latest_complete_date is not None:
        trailing = panel.loc[pd.to_datetime(panel["date"]) > pd.Timestamp(latest_complete_date)].copy()
        for _, row in trailing.iterrows():
            missing = [
                label
                for label, column in required_columns.items()
                if pd.isna(row[column])
            ]
            if missing:
                lag_summary.append(
                    {
                        "date": pd.to_datetime(row["date"]).strftime("%Y-%m-%d"),
                        "missing_requirements": missing,
                    }
                )

    return {
        "artifact_built_at": manifest["built_at"],
        "pipeline_checked_at": manifest.get("checked_at", manifest["built_at"]),
        "latest_complete_month": {
            "date": latest_complete_date,
            "slepi_adjusted": latest_complete_value,
        },
        "latest_enriched_month": {
            "date": latest_enriched_date,
            "slepi_enriched": latest_enriched_value,
        },
        "latest_available_months": latest_available,
        "latest_partial_month": max((value for value in latest_available.values() if value is not None), default=None),
        "blocking_months_after_latest_complete": lag_summary,
        "source_last_modified": {
            key: value.get("last_modified")
            for key, value in manifest["sources"].items()
        },
    }


def row_to_dict(row: pd.Series | None) -> dict[str, Any] | None:
    if row is None:
        return None
    payload: dict[str, Any] = {}
    for key, value in row.to_dict().items():
        if key == "date" and not pd.isna(value):
            payload[key] = pd.to_datetime(value).strftime("%Y-%m-%d")
        else:
            payload[key] = json_ready(value)
    return payload


def build_snapshot(panel: pd.DataFrame, metrics: dict[str, Any], freshness: dict[str, Any]) -> dict[str, Any]:
    complete = panel.loc[panel["slepi_adjusted"].notna()].copy()
    latest = complete.iloc[-1] if not complete.empty else None
    previous = complete.iloc[-2] if len(complete) >= 2 else None
    sparkline_rows = complete.tail(24)

    delta = None
    if latest is not None and previous is not None:
        delta = float(latest["slepi_adjusted"] - previous["slepi_adjusted"])

    # Enriched sparkline (may be shorter due to quarterly BOP lag)
    enriched_complete = panel.loc[panel["slepi_enriched"].notna()].copy()
    enriched_sparkline_rows = enriched_complete.tail(24)
    enriched_latest = enriched_complete.iloc[-1] if not enriched_complete.empty else None
    enriched_previous = enriched_complete.iloc[-2] if len(enriched_complete) >= 2 else None
    enriched_delta = None
    if enriched_latest is not None and enriched_previous is not None:
        enriched_delta = float(enriched_latest["slepi_enriched"] - enriched_previous["slepi_enriched"])

    return {
        "built_at": freshness["artifact_built_at"],
        "pipeline_checked_at": freshness["pipeline_checked_at"],
        "recommended_headline": "slepi_adjusted",
        "latest": row_to_dict(latest),
        "previous": row_to_dict(previous),
        "delta": delta,
        "sparklineValues": [json_ready(value) for value in sparkline_rows["slepi_adjusted"].tolist()],
        "sparklineStart": (
            pd.to_datetime(sparkline_rows["date"].iloc[0]).strftime("%Y-%m-%d")
            if not sparkline_rows.empty
            else None
        ),
        "sparklineEnd": (
            pd.to_datetime(sparkline_rows["date"].iloc[-1]).strftime("%Y-%m-%d")
            if not sparkline_rows.empty
            else None
        ),
        "enriched": {
            "latest": row_to_dict(enriched_latest),
            "previous": row_to_dict(enriched_previous),
            "delta": enriched_delta,
            "sparklineValues": [json_ready(v) for v in enriched_sparkline_rows["slepi_enriched"].tolist()],
            "sparklineStart": (
                pd.to_datetime(enriched_sparkline_rows["date"].iloc[0]).strftime("%Y-%m-%d")
                if not enriched_sparkline_rows.empty
                else None
            ),
            "sparklineEnd": (
                pd.to_datetime(enriched_sparkline_rows["date"].iloc[-1]).strftime("%Y-%m-%d")
                if not enriched_sparkline_rows.empty
                else None
            ),
        },
        "metrics": metrics,
        "freshness": freshness,
    }


def write_outputs(panel: pd.DataFrame, metrics: dict[str, Any], freshness: dict[str, Any]) -> None:
    panel.to_csv(PANEL_PATH, index=False)

    index_columns = [
        "date",
        "gross_reserves_usd_m",
        "imports_usd_m",
        "exports_usd_m",
        "usd_lkr",
        "import_cover_months",
        "current_account_usd_m",
        "current_account_filled_usd_m",
        "underlying_balance_filled_usd_m",
        "buffer_inflows_usd_m",
        "portfolio_investment_usd_m",
        "primary_income_debit_usd_m",
        "slepi_user_spec",
        "slepi_adjusted",
        "slepi_enriched",
    ]
    panel[index_columns].to_csv(INDEX_PATH, index=False)
    write_json(BACKTEST_PATH, metrics)
    write_json(FRESHNESS_PATH, freshness)
    write_json(SNAPSHOT_PATH, build_snapshot(panel, metrics, freshness))


def object_storage_config_from_env() -> dict[str, str] | None:
    bucket = os.environ.get("SLEPI_OBJECT_STORAGE_BUCKET")
    if not bucket:
        return None

    config = {
        "bucket": bucket,
        "region": os.environ.get("SLEPI_OBJECT_STORAGE_REGION") or os.environ.get("AWS_REGION") or "us-east-1",
        "access_key_id": (
            os.environ.get("SLEPI_OBJECT_STORAGE_ACCESS_KEY_ID") or os.environ.get("AWS_ACCESS_KEY_ID")
        ),
        "secret_access_key": (
            os.environ.get("SLEPI_OBJECT_STORAGE_SECRET_ACCESS_KEY") or os.environ.get("AWS_SECRET_ACCESS_KEY")
        ),
        "session_token": (
            os.environ.get("SLEPI_OBJECT_STORAGE_SESSION_TOKEN") or os.environ.get("AWS_SESSION_TOKEN")
        ),
        "endpoint_url": os.environ.get("SLEPI_OBJECT_STORAGE_ENDPOINT"),
        "key_prefix": os.environ.get("SLEPI_OBJECT_STORAGE_KEY_PREFIX", "slepi").strip("/"),
        "cache_control": os.environ.get("SLEPI_OBJECT_STORAGE_CACHE_CONTROL", "public, max-age=300"),
    }

    missing = [
        field
        for field in ["access_key_id", "secret_access_key"]
        if not config.get(field)
    ]
    if missing:
        raise RuntimeError(
            "Object storage publishing is enabled but credentials are incomplete. "
            f"Missing: {', '.join(missing)}"
        )
    return config


def normalize_object_storage_endpoint(endpoint_url: str | None) -> str | None:
    if not endpoint_url:
        return None

    candidate = endpoint_url.strip()
    if not candidate:
        return None

    if "://" not in candidate:
        candidate = f"https://{candidate}"

    parsed = urlparse(candidate)
    if not parsed.netloc:
        raise RuntimeError(f"Invalid object storage endpoint: {endpoint_url}")

    normalized = parsed._replace(path="", params="", query="", fragment="")
    return urlunparse(normalized).rstrip("/")


def publish_to_object_storage() -> list[str]:
    config = object_storage_config_from_env()
    if config is None:
        raise RuntimeError("Object storage publishing requested, but SLEPI_OBJECT_STORAGE_BUCKET is not set.")

    import boto3

    client = boto3.client(
        "s3",
        region_name=config["region"],
        endpoint_url=normalize_object_storage_endpoint(config["endpoint_url"]),
        aws_access_key_id=config["access_key_id"],
        aws_secret_access_key=config["secret_access_key"],
        aws_session_token=config["session_token"] or None,
    )

    artifacts = {
        "monthly_panel.csv": PANEL_PATH,
        "index_series.csv": INDEX_PATH,
        "backtest_metrics.json": BACKTEST_PATH,
        "freshness.json": FRESHNESS_PATH,
        "snapshot.json": SNAPSHOT_PATH,
        "methodology_assessment.md": NOTE_PATH,
        "source_manifest.json": MANIFEST_PATH,
    }
    content_types = {
        ".csv": "text/csv; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".md": "text/markdown; charset=utf-8",
    }

    uploaded_keys: list[str] = []
    for filename, path in artifacts.items():
        key = f"{config['key_prefix']}/{filename}" if config["key_prefix"] else filename
        client.put_object(
            Bucket=config["bucket"],
            Key=key,
            Body=path.read_bytes(),
            ContentType=content_types.get(path.suffix, "application/octet-stream"),
            CacheControl=config["cache_control"],
        )
        uploaded_keys.append(key)

    return uploaded_keys


def build_methodology_note(panel: pd.DataFrame, metrics: dict[str, Any]) -> str:
    user_metrics = metrics["slepi_user_spec"]
    adjusted_metrics = metrics["slepi_adjusted"]
    enriched_metrics = metrics.get("slepi_enriched", {})

    latest = panel.dropna(subset=["slepi_adjusted"]).tail(1)
    latest_line = "No complete adjusted SLEPI observation was produced."
    if not latest.empty:
        row = latest.iloc[0]
        latest_line = (
            f"The latest complete adjusted SLEPI observation is {row['date'].strftime('%Y-%m-%d')} "
            f"with a value of {row['slepi_adjusted']:.2f}."
        )

    enriched_latest = panel.dropna(subset=["slepi_enriched"]).tail(1)
    enriched_line = "No complete enriched SLEPI observation was produced (BOP quarterly data may not be available)."
    if not enriched_latest.empty:
        erow = enriched_latest.iloc[0]
        enriched_line = (
            f"The latest complete enriched SLEPI observation is {erow['date'].strftime('%Y-%m-%d')} "
            f"with a value of {erow['slepi_enriched']:.2f}."
        )

    enriched_backtest_block = ""
    if enriched_metrics:
        corr = enriched_metrics.get("correlation_with_future_external_stress_3m")
        auc = enriched_metrics.get("auc_for_top_15pct_future_stress_event")
        peak_date = enriched_metrics.get("crisis_window_peak_date")
        peak_val = enriched_metrics.get("crisis_window_peak_value")
        if corr is not None and auc is not None:
            enriched_backtest_block = f"""- Enriched SLEPI correlation with future 3-month external stress: `{corr:.3f}`
- Enriched SLEPI AUC for top-15% future stress events: `{auc:.3f}`"""
            if peak_date and peak_val is not None:
                enriched_backtest_block += f"\n- Enriched SLEPI crisis window peak: `{peak_date}` at `{peak_val:.2f}`"

    return f"""# SLEPI methodology assessment

## Recommendation

Use `slepi_adjusted` as the headline series and keep `slepi_user_spec` as a shadow series.
Use `slepi_enriched` as the extended variant when debt service and portfolio flow data is available.

Reason:

- the raw user specification counts remittances and tourism twice: once inside monthly current account balance and again inside the buffer-inflow support block
- the adjusted version strips those inflows out of the external-balance block first, which makes the four blocks economically cleaner
- the enriched version adds debt service pressure and net portfolio flow pressure from CBSL's quarterly BOP (BPM6), extending the adjusted variant to six blocks
- in the rough historical backtest here, the adjusted variant is only marginally weaker than the raw variant, so the loss from de-duplication is small

## Current design verdict

The four-block structure is defensible, and the enriched six-block version adds:

1. reserve adequacy via import cover
2. FX market pressure via monthly USD/LKR depreciation
3. underlying external-balance pressure via current account excluding remittances and tourism
4. buffer-inflow support via remittances plus tourism, scaled by imports
5. debt service pressure via primary income debit (interest payments) from BOP, scaled by imports
6. net portfolio flow pressure via portfolio investment outflows from BOP, scaled by imports

Blocks 5 and 6 are sourced from CBSL's quarterly Balance of Payments (BPM6) table and converted to
monthly frequency by distributing quarterly flows evenly across the three constituent months.

## Data sufficiency

- Official monthly current-account history starts in `2023-01`.
- Official reserve-template history starts in `2013-11`.
- The longer backtest therefore uses local backfill already present in this folder for pre-2023 current-account proxying and pre-2013 reserve history.
- Monthly exports and imports are available from `2007-01`.
- Monthly remittances and tourism earnings are available from `2009-01`.
- Monthly FX history is available from `2005-01`.
- Quarterly BOP (BPM6) data starts from `2012 Q1`, providing portfolio investment and primary income debit.

This means the folder is enough for a useful long proxy backtest, but not for a purely official monthly-current-account backtest before 2023.

## CBSL release cadence

- Broad external-sector release: {RELEASE_LAG_NOTES['external_sector_tables']['description']}
  - {RELEASE_LAG_NOTES['external_sector_tables']['examples'][0]}
  - {RELEASE_LAG_NOTES['external_sector_tables']['examples'][1]}
- Workers' remittances: {RELEASE_LAG_NOTES['workers_remittances']['description']}
  - {RELEASE_LAG_NOTES['workers_remittances']['examples'][0]}
  - {RELEASE_LAG_NOTES['workers_remittances']['examples'][1]}
- FX intervention disclosure: {RELEASE_LAG_NOTES['fx_intervention']['description']}
  - {RELEASE_LAG_NOTES['fx_intervention']['examples'][0]}
  - {RELEASE_LAG_NOTES['fx_intervention']['examples'][1]}
- BOP quarterly: {RELEASE_LAG_NOTES['bop_quarterly']['description']}
  - {RELEASE_LAG_NOTES['bop_quarterly']['examples'][0]}
  - {RELEASE_LAG_NOTES['bop_quarterly']['examples'][1]}

Source for all timing notes: [{ADVANCE_RELEASE_CALENDAR_URL}]({ADVANCE_RELEASE_CALENDAR_URL})

## Backtest snapshot

- Sample used for headline metrics: `{metrics['sample_start']}` to `{metrics['sample_end']}`
- Raw user-spec SLEPI correlation with future 3-month external stress: `{user_metrics['correlation_with_future_external_stress_3m']:.3f}`
- Raw user-spec SLEPI AUC for top-15% future stress events: `{user_metrics['auc_for_top_15pct_future_stress_event']:.3f}`
- Adjusted SLEPI correlation with future 3-month external stress: `{adjusted_metrics['correlation_with_future_external_stress_3m']:.3f}`
- Adjusted SLEPI AUC for top-15% future stress events: `{adjusted_metrics['auc_for_top_15pct_future_stress_event']:.3f}`
{enriched_backtest_block}
- Proxy fit linking trade balance to the adjusted external-balance block over the official overlap: slope `{metrics['proxy_fit']['slope']:.3f}`, correlation `{metrics['proxy_fit']['overlap_correlation']:.3f}`, overlap months `{metrics['proxy_fit']['overlap_months']}`

Both variants spike sharply into the 2021-2022 external crisis window, with crisis peaks on:

- Raw user-spec SLEPI: `{user_metrics['crisis_window_peak_date']}` at `{user_metrics['crisis_window_peak_value']:.2f}`
- Adjusted SLEPI: `{adjusted_metrics['crisis_window_peak_date']}` at `{adjusted_metrics['crisis_window_peak_value']:.2f}`

## Practical interpretation

- If you want a clean policy dashboard, publish `slepi_adjusted`.
- If you want a simple continuity check against the original idea, keep `slepi_user_spec` beside it.
- If you want the fullest picture including debt service and portfolio flows, use `slepi_enriched` (note: it lags `slepi_adjusted` by roughly one quarter due to BOP release cadence).
- If you later want a true daily nowcast, the next upgrade should be a daily FX sub-index plus step-held monthly external blocks, rather than forcing all four blocks into a fake daily frequency.

## Latest observation

{latest_line}

{enriched_line}
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the Sri Lanka External Pressure Index (SLEPI).")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Redownload all CBSL sources even if the source manifest looks unchanged.",
    )
    parser.add_argument(
        "--publish-object-storage",
        action="store_true",
        help="Upload the generated SLEPI artifacts to S3-compatible object storage using environment variables.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    ensure_output_dirs()
    session = make_session()

    manifest = refresh_sources(session, force=args.force)
    panel = build_panel(session, manifest)
    metrics = run_backtest(panel)
    freshness = build_freshness_summary(panel, manifest)
    write_outputs(panel, metrics, freshness)
    write_text(NOTE_PATH, build_methodology_note(panel, metrics))
    uploaded_keys: list[str] = []
    if args.publish_object_storage:
        uploaded_keys = publish_to_object_storage()

    print(
        json.dumps(
            {
                "changed_sources": manifest["changed_sources"],
                "monthly_panel": str(PANEL_PATH.relative_to(ROOT)),
                "index_series": str(INDEX_PATH.relative_to(ROOT)),
                "backtest_metrics": str(BACKTEST_PATH.relative_to(ROOT)),
                "methodology_note": str(NOTE_PATH.relative_to(ROOT)),
                "snapshot": str(SNAPSHOT_PATH.relative_to(ROOT)),
                "recommended_headline": "slepi_adjusted",
                "object_storage_keys": uploaded_keys,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
