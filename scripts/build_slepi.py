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
MONETARY_SECTOR_URL = "https://www.cbsl.gov.lk/en/statistics/statistical-tables/monetary-sector"
EXCHANGE_RATES_URL = "https://www.cbsl.gov.lk/en/rates-and-indicators/exchange-rates"
ECONOMIC_SOCIAL_CHAPTER4_URL = "https://www.cbsl.gov.lk/en/statistics/economic-and-social-statistics/chapter-4"
ADVANCE_RELEASE_CALENDAR_URL = "https://www.cbsl.gov.lk/en/advance-release-calendar-2026"
USD_SPOT_LOOKUP_URL = "https://www.cbsl.gov.lk/cbsl_custom/exrates/exrates_spot_mid.php"
USD_SPOT_RESULTS_URL = "https://www.cbsl.gov.lk/cbsl_custom/exrates/exrates_results_spot_mid.php"

SOURCE_LABELS = {
    "current_account": {
        "source_page": EXTERNAL_SECTOR_URL,
        "label": "Monthly Current Account Balance (2023 January to Latest)",
        "filename": "monthly_current_account_balance.xlsx",
    },
    "exports": {
        "source_page": EXTERNAL_SECTOR_URL,
        "label": "Exports - Monthly (2006 to Latest)",
        "filename": "exports_monthly.xlsx",
    },
    "imports": {
        "source_page": EXTERNAL_SECTOR_URL,
        "label": "Imports - Monthly (2006 to Latest)",
        "filename": "imports_monthly.xlsx",
    },
    "tourism": {
        "source_page": EXTERNAL_SECTOR_URL,
        "label": "Earnings from Tourism (2009 January to Latest)",
        "filename": "tourism_monthly.xlsx",
    },
    "remittances": {
        "source_page": EXTERNAL_SECTOR_URL,
        "label": "Workers Remittances (2009 January to Latest)",
        "filename": "remittances_monthly.xlsx",
    },
    "reserve_latest": {
        "source_page": EXTERNAL_SECTOR_URL,
        "label": "Reserve Data Template - Latest",
        "filename": "reserve_data_template_latest.xlsx",
    },
    "reserve_history": {
        "source_page": EXTERNAL_SECTOR_URL,
        "label": "Reserve Data Template - Historical",
        "filename": "reserve_data_template_historical.xlsx",
    },
    "services": {
        "source_page": EXTERNAL_SECTOR_URL,
        "label": "Monthly Services Sector Data (2023 January to Latest)",
        "filename": "services_monthly.xlsx",
    },
    "external_debt_quarterly": {
        "source_page": EXTERNAL_SECTOR_URL,
        "label": "Outstanding External Debt and Banking Sector External Liabilities (2012 Q4 to Latest)",
        "filename": "external_debt_quarterly.xlsx",
    },
    "monetary_survey_monthly": {
        "source_page": MONETARY_SECTOR_URL,
        "label": "Monetary Survey - Monthly (Dec 1995 to Latest) and Sectoral Private Sector Credit Survey",
        "filename": "monetary_survey_monthly.xlsx",
    },
    "neer_reer": {
        "source_page": EXCHANGE_RATES_URL,
        "label": "Real Effective Exchange Rates (REER)",
        "filename": "neer_reer_monthly.xlsx",
    },
    "external_debt_service_annual": {
        "source_page": ECONOMIC_SOCIAL_CHAPTER4_URL,
        "label": "External Debt and Debt Service Payments",
        "filename": "external_debt_service_annual.xlsx",
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
    "monetary_sector_tables": {
        "description": (
            "CBSL monetary-sector spreadsheets are updated independently from the external-sector "
            "monthly release and are used here for M2b and monetary-system NFA shadow indicators."
        ),
        "examples": [
            "M2b and NFA are monthly, but are not forced into the headline SLEPI core.",
        ],
        "source": MONETARY_SECTOR_URL,
    },
    "external_debt_tables": {
        "description": (
            "CBSL external-debt workbooks are quarterly; the pipeline step-holds the latest "
            "quarterly value across monthly SLEPI observations."
        ),
        "examples": [
            "Outstanding external debt and banking-sector external liabilities are available from 2012 Q4.",
        ],
        "source": EXTERNAL_SECTOR_URL,
    },
    "annual_debt_service_tables": {
        "description": (
            "The debt-service, amortisation and interest series are annual in the Economic and "
            "Social Statistics chapter and are therefore treated as slow-moving rollover context."
        ),
        "examples": [
            "Annual debt-service data are forward-filled until the next annual release is available.",
        ],
        "source": ECONOMIC_SOCIAL_CHAPTER4_URL,
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


def parse_table_number(value: Any) -> float | None:
    if pd.isna(value):
        return None
    if isinstance(value, (int, float, np.integer, np.floating)):
        return float(value)
    text = str(value).strip().replace(",", "")
    text = re.sub(r"\([a-z]+\)", "", text, flags=re.I).strip()
    if re.fullmatch(r"-?\d+(?:\.\d+)?", text):
        return float(text)
    return None


def discover_source_urls(session: requests.Session) -> dict[str, dict[str, Any]]:
    pages: dict[str, BeautifulSoup] = {}

    discovered: dict[str, dict[str, Any]] = {}
    for key, spec in SOURCE_LABELS.items():
        source_page = spec["source_page"]
        if source_page not in pages:
            response = session.get(source_page, timeout=60)
            response.raise_for_status()
            pages[source_page] = BeautifulSoup(response.text, "html.parser")

        soup = pages[source_page]
        target_label = normalize_text(spec["label"])
        link = None
        for candidate in soup.find_all("a"):
            if normalize_text(candidate.get_text(" ", strip=True)) == target_label:
                link = candidate
                break
        if link is None or not link.get("href"):
            raise RuntimeError(f"Unable to discover CBSL link for: {spec['label']}")
        url = requests.compat.urljoin(source_page, link["href"])
        discovered[key] = {
            "label": spec["label"],
            "source_page": source_page,
            "url": url,
            "filename": spec["filename"],
        }
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

    discovered = discover_source_urls(session)
    manifest_sources: dict[str, Any] = {}
    changed_sources: list[str] = []

    for key, spec in discovered.items():
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
        "changed_sources": changed_sources,
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


def find_value_by_first_cell(df: pd.DataFrame, patterns: list[str]) -> float | None:
    normalized_patterns = [normalize_text(pattern) for pattern in patterns]
    for idx in range(df.shape[0]):
        first_text = first_nonempty_value(df.iloc[idx])
        if all(pattern in first_text for pattern in normalized_patterns):
            for value in reversed(df.iloc[idx].tolist()):
                parsed = parse_number(value)
                if parsed is not None:
                    return parsed
    return None


def first_numeric_value(row: pd.Series) -> float | None:
    for value in row.tolist():
        parsed = parse_table_number(value)
        if parsed is not None:
            return parsed
    return None


def find_total_value_by_first_cell(df: pd.DataFrame, patterns: list[str]) -> float | None:
    normalized_patterns = [normalize_text(pattern) for pattern in patterns]
    for idx in range(df.shape[0]):
        first_text = first_nonempty_value(df.iloc[idx])
        if all(pattern in first_text for pattern in normalized_patterns):
            return first_numeric_value(df.iloc[idx])
    return None


def find_total_value_after_heading(
    df: pd.DataFrame,
    heading_pattern: str,
    row_patterns: list[str],
) -> float | None:
    try:
        heading_idx = find_row_containing(df, heading_pattern)
    except ValueError:
        heading_idx = -1

    normalized_patterns = [normalize_text(pattern) for pattern in row_patterns]
    for idx in range(max(heading_idx + 1, 0), df.shape[0]):
        row_text = " | ".join(normalize_text(value) for value in df.iloc[idx].tolist())
        if all(pattern in row_text for pattern in normalized_patterns):
            return first_numeric_value(df.iloc[idx])
    return None


def parse_total_series_sheet(path: Path, sheet_name: str, total_label: str, value_name: str) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name=sheet_name, header=None)
    header_row = find_row_by_first_value(df, "Category")
    total_row = find_row_by_first_value(df, total_label)

    rows: list[dict[str, Any]] = []
    for column in range(df.shape[1]):
        date_value = parse_month_start(df.iloc[header_row, column])
        if date_value is None:
            continue
        numeric_value = parse_number(df.iloc[total_row, column])
        if numeric_value is None:
            continue
        rows.append(
            {
                "date": date_value,
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


def parse_quarter_month(value: Any) -> pd.Timestamp | None:
    if pd.isna(value):
        return None
    text = normalize_text(value)
    year = parse_year_token(value)
    if year is None:
        return None
    quarter_match = re.search(r"([1-4])(?:st|nd|rd|th)?\s*quarter|q([1-4])", text)
    if not quarter_match:
        return None
    quarter = int(next(group for group in quarter_match.groups() if group))
    return pd.Timestamp(year=year, month=quarter * 3, day=1)


def parse_month_start(value: Any) -> pd.Timestamp | None:
    if isinstance(value, (pd.Timestamp, datetime)):
        return pd.to_datetime(value).normalize().replace(day=1)
    if pd.isna(value):
        return None

    text = str(value).strip()
    if not text:
        return None

    text = re.sub(r"\s*\([^)]+\)\s*$", "", text).strip()
    for fmt in ("%b-%y", "%b-%Y", "%B-%y", "%B-%Y", "%Y-%m-%d", "%b %Y", "%B %Y"):
        try:
            return pd.to_datetime(datetime.strptime(text, fmt)).normalize().replace(day=1)
        except ValueError:
            continue

    parsed = pd.to_datetime(text, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.normalize().replace(day=1)


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
        date = parse_month_start(sheet_name)
        if date is None:
            continue

        df = pd.read_excel(path, sheet_name=sheet_name, header=None)
        rows.append(
            {
                "date": date,
                "gross_reserves_usd_m": find_value_by_first_cell(df, ["a.", "official reserve assets"]),
                "fx_reserves_usd_m": find_value_by_first_cell(df, ["(1)", "foreign currency reserves"]),
                "imf_position_usd_m": (
                    find_value_by_first_cell(df, ["(2)", "imf reserve position"])
                    or find_value_by_first_cell(df, ["(2)", "reserve position in the imf"])
                ),
                "sdrs_usd_m": find_value_by_first_cell(df, ["(3)", "sdrs"]),
                "gold_usd_m": find_value_by_first_cell(df, ["(4)", "gold"]),
                "other_reserves_usd_m": find_value_in_sheet(df, ["Other reserve assets"]),
                "predetermined_short_term_net_drains_usd_m": find_total_value_by_first_cell(
                    df, ["foreign currency loans", "securities", "deposits"]
                ),
                "fx_forward_short_positions_usd_m": find_total_value_after_heading(
                    df,
                    "aggregate short and long positions in forwards",
                    ["short positions"],
                ),
            }
        )

    result = pd.DataFrame(rows).sort_values("date").drop_duplicates("date")
    if result.empty:
        raise ValueError(f"Failed to parse reserve history workbook: {path.name}")
    return result


def parse_reserve_latest(path: Path) -> pd.DataFrame:
    workbook = pd.ExcelFile(path)
    rows: list[dict[str, Any]] = []

    for sheet_name in workbook.sheet_names:
        date = parse_month_start(sheet_name.replace("RDT", "").replace("(", "").replace(")", "").strip())
        if date is None:
            df = pd.read_excel(path, sheet_name=sheet_name, header=None)
            date = None
            for row_idx in range(min(df.shape[0], 12)):
                for value in df.iloc[row_idx].tolist():
                    parsed = parse_month_start(value)
                    if parsed is not None:
                        date = parsed
                        break
                if date is not None:
                    break
            if date is None:
                continue
        else:
            df = pd.read_excel(path, sheet_name=sheet_name, header=None)

        rows.append(
            {
                "date": date,
                "gross_reserves_usd_m": find_value_by_first_cell(df, ["a.", "official reserve assets"]),
                "fx_reserves_usd_m": find_value_by_first_cell(df, ["(1)", "foreign currency reserves"]),
                "imf_position_usd_m": (
                    find_value_by_first_cell(df, ["(2)", "imf reserve position"])
                    or find_value_by_first_cell(df, ["(2)", "reserve position in the imf"])
                ),
                "sdrs_usd_m": find_value_by_first_cell(df, ["(3)", "sdrs"]),
                "gold_usd_m": find_value_by_first_cell(df, ["(4)", "gold"]),
                "other_reserves_usd_m": find_value_in_sheet(df, ["Other reserve assets"]),
                "predetermined_short_term_net_drains_usd_m": find_total_value_by_first_cell(
                    df, ["foreign currency loans", "securities", "deposits"]
                ),
                "fx_forward_short_positions_usd_m": find_total_value_after_heading(
                    df,
                    "aggregate short and long positions in forwards",
                    ["short positions"],
                ),
            }
        )

    result = pd.DataFrame(rows).sort_values("date").drop_duplicates("date")
    if result.empty:
        raise ValueError(f"Failed to parse reserve latest workbook: {path.name}")
    return result


def parse_services_sheet(path: Path) -> pd.DataFrame:
    workbook = pd.ExcelFile(path)
    sheet_map = {
        "Services - Inflows": "services_inflows_usd_m",
        "Services - Outflows ": "services_outflows_usd_m",
        "Services - Net": "services_balance_usd_m",
    }
    merged: pd.DataFrame | None = None

    for sheet_name, value_name in sheet_map.items():
        if sheet_name not in workbook.sheet_names:
            raise ValueError(f"Unable to find services sheet '{sheet_name}' in {path.name}")
        df = pd.read_excel(path, sheet_name=sheet_name, header=None)
        date_row = find_row_by_first_value(df, "Item")
        total_row = find_row_by_first_value(df, "Services")

        rows: list[dict[str, Any]] = []
        for column in range(df.shape[1]):
            date_value = parse_month_start(df.iloc[date_row, column])
            if date_value is None:
                continue
            numeric_value = parse_number(df.iloc[total_row, column])
            if numeric_value is None:
                continue
            rows.append({"date": date_value, value_name: numeric_value})

        parsed = pd.DataFrame(rows).sort_values("date").drop_duplicates("date")
        if parsed.empty:
            raise ValueError(f"Failed to parse services sheet '{sheet_name}' in {path.name}")
        merged = parsed if merged is None else merged.merge(parsed, on="date", how="outer")

    if merged is None or merged.empty:
        raise ValueError(f"Failed to parse services workbook: {path.name}")
    return merged.sort_values("date").drop_duplicates("date")


def row_label(df: pd.DataFrame, idx: int) -> str:
    values = [normalize_text(value) for value in df.iloc[idx].tolist()]
    return " ".join(value for value in values if value)


def find_row_with_label(
    df: pd.DataFrame,
    label: str,
    start_idx: int = 0,
    exact: bool = True,
) -> int:
    target = normalize_text(label)
    for idx in range(start_idx, df.shape[0]):
        cells = [normalize_text(value) for value in df.iloc[idx].tolist()]
        matched = any(cell == target for cell in cells) if exact else any(target in cell for cell in cells)
        if matched:
            return idx
    raise ValueError(f"Unable to find row for label: {label}")


def extract_quarterly_row(df: pd.DataFrame, row_idx: int, value_name: str) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for column in range(df.shape[1]):
        date = parse_quarter_month(df.iloc[1, column])
        if date is None:
            continue
        value = parse_number(df.iloc[row_idx, column])
        if value is None:
            continue
        rows.append({"date": date, value_name: value})
    return pd.DataFrame(rows).sort_values("date").drop_duplicates("date")


def extract_sum_of_quarterly_rows(df: pd.DataFrame, row_idxs: list[int], value_name: str) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for column in range(df.shape[1]):
        date = parse_quarter_month(df.iloc[1, column])
        if date is None:
            continue
        values = [parse_number(df.iloc[row_idx, column]) for row_idx in row_idxs]
        clean = [value for value in values if value is not None]
        if not clean:
            continue
        rows.append({"date": date, value_name: float(sum(clean))})
    return pd.DataFrame(rows).sort_values("date").drop_duplicates("date")


def parse_external_debt_quarterly(path: Path) -> pd.DataFrame:
    market = pd.read_excel(path, sheet_name=" Ext Debt (Market Value)", header=None)
    face = pd.read_excel(path, sheet_name="Ext Debt (Face Value)", header=None)

    maturity_heading = find_row_with_label(market, "Gross External Debt Position - Maturity wise Breakdown")
    market_rows = {
        "gross_external_debt_market_usd_m": find_row_with_label(market, "Gross External Debt Position"),
        "short_term_external_debt_market_usd_m": find_row_with_label(market, "Short-term", maturity_heading + 1),
        "long_term_external_debt_market_usd_m": find_row_with_label(market, "Long-term", maturity_heading + 1),
        "banking_sector_external_liabilities_market_usd_m": find_row_with_label(
            market, "3. Deposit-Taking Corporations, except the Central Bank", exact=False
        ),
    }
    face_rows = {
        "gross_external_debt_face_usd_m": find_row_with_label(face, "Gross External Debt Position"),
        "gross_external_debt_face_pct_gdp": find_row_with_label(face, "Gross  External Debt (face Value)", exact=False),
    }
    swap_labels = [
        "RBI swap arrangement",
        "Bank of Bangladesh swap arrangement",
        "PBOC swap arrangement",
        "RBI & ACU combined swap (Special Swap) Arrangement",
        "Accrued interest to applicable swap arrangements",
        "International Currency Swap Arrangements",
    ]
    swap_rows = []
    for label in swap_labels:
        try:
            swap_rows.append(find_row_with_label(market, label, exact=False))
        except ValueError:
            continue

    pieces = [extract_quarterly_row(market, row_idx, value_name) for value_name, row_idx in market_rows.items()]
    pieces.extend(extract_quarterly_row(face, row_idx, value_name) for value_name, row_idx in face_rows.items())
    if swap_rows:
        pieces.append(extract_sum_of_quarterly_rows(market, swap_rows, "central_bank_external_swap_liabilities_usd_m"))

    merged = pieces[0]
    for piece in pieces[1:]:
        merged = merged.merge(piece, on="date", how="outer")
    return merged.sort_values("date").drop_duplicates("date")


def parse_monetary_survey_sheet(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name="4.02", header=None)
    rows: list[dict[str, Any]] = []
    for idx in range(df.shape[0]):
        date = parse_month_start(df.iloc[idx, 1])
        if date is None:
            continue
        rows.append(
            {
                "date": date,
                "reserve_money_rs_m": parse_number(df.iloc[idx, 2]),
                "m2_rs_m": parse_number(df.iloc[idx, 3]),
                "m2b_rs_m": parse_number(df.iloc[idx, 9]),
                "nfa_monetary_authorities_rs_m": parse_number(df.iloc[idx, 11]),
                "nfa_commercial_banks_rs_m": parse_number(df.iloc[idx, 12]),
                "m2b_nfa_rs_m": parse_number(df.iloc[idx, 13]),
            }
        )
    result = pd.DataFrame(rows).sort_values("date").drop_duplicates("date")
    if result.empty:
        raise ValueError(f"Failed to parse monetary survey workbook: {path.name}")
    return result


def parse_neer_reer_sheet(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name="Monthly Average", header=None)
    rows: list[dict[str, Any]] = []
    for idx in range(df.shape[0]):
        date = parse_month_start(df.iloc[idx, 1])
        if date is None:
            continue
        rows.append(
            {
                "date": date,
                "neer_index": parse_number(df.iloc[idx, 2]),
                "reer_index": parse_number(df.iloc[idx, 3]),
            }
        )
    result = pd.DataFrame(rows).sort_values("date").drop_duplicates("date")
    if result.empty:
        raise ValueError(f"Failed to parse NEER/REER workbook: {path.name}")
    return result


def parse_external_debt_service_annual(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name=0, header=None)
    year_row = 3
    years = {
        column: parse_year_token(df.iloc[year_row, column])
        for column in range(df.shape[1])
        if parse_year_token(df.iloc[year_row, column]) is not None
    }
    label_rows = {
        "external_debt_service_payments_usd_m": find_row_by_first_value(df, "Debt Service Payments"),
        "external_debt_service_amortization_usd_m": find_row_by_first_value(df, "Amortization"),
        "external_debt_service_interest_usd_m": find_row_by_first_value(df, "Interest Payments"),
        "debt_service_to_exports_services_pct": find_row_by_first_value(
            df, "Debt Service as a % of Exports and Services"
        ),
        "debt_service_to_external_receipts_pct": find_row_by_first_value(
            df, "Debt Service as a % of Merchandise and Services, Income and Current Transfers"
        ),
    }

    records: list[dict[str, Any]] = []
    for column, year in years.items():
        if year is None:
            continue
        record: dict[str, Any] = {"date": pd.Timestamp(year=year, month=1, day=1)}
        for value_name, row_idx in label_rows.items():
            record[value_name] = parse_number(df.iloc[row_idx, column])
        records.append(record)

    result = pd.DataFrame(records).sort_values("date").drop_duplicates("date")
    if result.empty:
        raise ValueError(f"Failed to parse annual debt-service workbook: {path.name}")
    return result


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


def mean_if_min_available(df: pd.DataFrame, columns: list[str], min_count: int = 1) -> pd.Series:
    out = df[columns].mean(axis=1, skipna=True)
    out.loc[df[columns].notna().sum(axis=1) < min_count] = np.nan
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
    official_services = parse_services_sheet(raw_paths["services"])
    official_external_debt = parse_external_debt_quarterly(raw_paths["external_debt_quarterly"])
    official_monetary = parse_monetary_survey_sheet(raw_paths["monetary_survey_monthly"])
    official_neer_reer = parse_neer_reer_sheet(raw_paths["neer_reer"])
    official_debt_service = parse_external_debt_service_annual(raw_paths["external_debt_service_annual"])
    official_reserve_history = parse_reserve_history(raw_paths["reserve_history"])
    official_reserve_latest = parse_reserve_latest(raw_paths["reserve_latest"])
    reserve_columns = [
        "gross_reserves_usd_m",
        "fx_reserves_usd_m",
        "imf_position_usd_m",
        "sdrs_usd_m",
        "gold_usd_m",
        "predetermined_short_term_net_drains_usd_m",
        "fx_forward_short_positions_usd_m",
    ]
    official_reserves = combine_series(
        official_reserve_latest,
        official_reserve_history,
        reserve_columns,
    )
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
        reserve_columns,
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
        | set(official_services["date"])
        | set(official_external_debt["date"])
        | set(official_monetary["date"])
        | set(official_neer_reer["date"])
        | set(official_debt_service["date"])
    )
    panel = pd.DataFrame({"date": all_dates})

    for dataset in [reserves, exports, imports, tourism, remittances, fx, official_services, official_monetary, official_neer_reer]:
        panel = panel.merge(dataset, on="date", how="left")
    panel = panel.merge(
        official_current_account[["date", "current_account_usd_m", "current_account_plus_capital_usd_m"]],
        on="date",
        how="left",
    )
    for dataset in [official_external_debt, official_debt_service]:
        panel = panel.merge(dataset, on="date", how="left")

    panel = panel.sort_values("date").reset_index(drop=True)

    step_hold_columns = [
        *[column for column in official_external_debt.columns if column != "date"],
        *[column for column in official_debt_service.columns if column != "date"],
    ]
    panel[step_hold_columns] = panel[step_hold_columns].ffill()

    panel["imports_trailing_3m_avg_usd_m"] = panel["imports_usd_m"].rolling(3, min_periods=3).mean()
    panel["import_cover_months"] = panel["gross_reserves_usd_m"] / panel["imports_trailing_3m_avg_usd_m"]
    panel["reserve_net_drains_usd_m"] = panel[
        ["predetermined_short_term_net_drains_usd_m", "fx_forward_short_positions_usd_m"]
    ].fillna(0).sum(axis=1)
    panel["adjusted_usable_reserves_usd_m"] = panel["gross_reserves_usd_m"] + panel["reserve_net_drains_usd_m"]
    panel["adjusted_usable_reserve_cover_months"] = (
        panel["adjusted_usable_reserves_usd_m"] / panel["imports_trailing_3m_avg_usd_m"]
    )
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

    reserve_cover_for_log = panel["adjusted_usable_reserve_cover_months"].clip(lower=0.05)
    panel["reserve_block_raw"] = -np.log(reserve_cover_for_log)
    panel["usd_lkr_depreciation_raw"] = np.log(panel["usd_lkr"]).diff()
    panel["neer_depreciation_raw"] = -np.log(panel["neer_index"]).diff()
    panel["reserve_change_pressure_raw"] = -np.log(
        panel["gross_reserves_usd_m"] / panel["gross_reserves_usd_m"].shift(1)
    )
    panel["fx_market_pressure_raw"] = panel["usd_lkr_depreciation_raw"]
    panel["external_balance_pressure_user_raw"] = -panel["current_account_filled_usd_m"] / panel["imports_usd_m"]
    panel["external_balance_pressure_adjusted_raw"] = -panel["underlying_balance_filled_usd_m"] / panel["imports_usd_m"]
    panel["buffer_inflow_support_raw"] = -panel["buffer_inflows_share_imports"]
    panel["current_account_pressure_raw"] = panel["external_balance_pressure_user_raw"]
    panel["short_term_external_debt_to_reserves_raw"] = (
        panel["short_term_external_debt_market_usd_m"] / panel["gross_reserves_usd_m"]
    )
    panel["external_debt_to_reserves_raw"] = panel["gross_external_debt_market_usd_m"] / panel["gross_reserves_usd_m"]
    panel["debt_service_to_external_receipts_raw"] = panel["debt_service_to_external_receipts_pct"] / 100.0
    panel["gross_reserves_lkr_m"] = panel["gross_reserves_usd_m"] * panel["usd_lkr"]
    panel["adjusted_usable_reserves_lkr_m"] = panel["adjusted_usable_reserves_usd_m"] * panel["usd_lkr"]
    panel["m2b_to_adjusted_reserves_raw"] = panel["m2b_rs_m"] / panel["adjusted_usable_reserves_lkr_m"].where(
        panel["adjusted_usable_reserves_lkr_m"] > 0
    )
    panel["m2b_nfa_deterioration_raw"] = -panel["m2b_nfa_rs_m"].diff() / panel["m2b_rs_m"]

    for column in [
        "reserve_block_raw",
        "usd_lkr_depreciation_raw",
        "neer_depreciation_raw",
        "reserve_change_pressure_raw",
        "external_balance_pressure_user_raw",
        "external_balance_pressure_adjusted_raw",
        "buffer_inflow_support_raw",
        "current_account_pressure_raw",
        "short_term_external_debt_to_reserves_raw",
        "debt_service_to_external_receipts_raw",
        "m2b_to_adjusted_reserves_raw",
        "m2b_nfa_deterioration_raw",
    ]:
        panel[column.replace("_raw", "_z")] = realtime_zscore(panel[column].astype(float))

    panel["fx_market_pressure_z"] = mean_if_min_available(
        panel,
        ["usd_lkr_depreciation_z", "neer_depreciation_z", "reserve_change_pressure_z"],
        min_count=2,
    )
    panel["external_financing_pressure_z"] = mean_if_min_available(
        panel,
        ["short_term_external_debt_to_reserves_z", "debt_service_to_external_receipts_z"],
        min_count=1,
    )
    panel["resident_fx_liability_pressure_z"] = mean_if_min_available(
        panel,
        ["m2b_to_adjusted_reserves_z", "m2b_nfa_deterioration_z"],
        min_count=1,
    )

    legacy_user_columns = [
        "reserve_block_z",
        "usd_lkr_depreciation_z",
        "external_balance_pressure_user_z",
        "buffer_inflow_support_z",
    ]
    legacy_adjusted_columns = [
        "reserve_block_z",
        "usd_lkr_depreciation_z",
        "external_balance_pressure_adjusted_z",
        "buffer_inflow_support_z",
    ]
    headline_columns = [
        "reserve_block_z",
        "fx_market_pressure_z",
        "external_financing_pressure_z",
        "current_account_pressure_z",
    ]
    panel["slepi_user_spec"] = mean_if_complete(panel, legacy_user_columns)
    panel["slepi_legacy_adjusted"] = mean_if_complete(panel, legacy_adjusted_columns)
    panel["slepi_adjusted"] = mean_if_complete(panel, headline_columns)

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
    panel.attrs["latest_external_debt_actual"] = latest_non_null_month(
        official_external_debt, "gross_external_debt_market_usd_m"
    )
    panel.attrs["latest_debt_service_actual"] = latest_non_null_month(
        official_debt_service, "external_debt_service_payments_usd_m"
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
            "external_debt_quarterly_non_null_months": int(panel["gross_external_debt_market_usd_m"].notna().sum()),
            "monetary_survey_non_null_months": int(panel["m2b_rs_m"].notna().sum()),
            "neer_non_null_months": int(panel["neer_index"].notna().sum()),
            "services_balance_non_null_months": int(panel["services_balance_usd_m"].notna().sum()),
            "annual_debt_service_non_null_months": int(panel["external_debt_service_payments_usd_m"].notna().sum()),
            "long_backtest_start": panel["date"].min().strftime("%Y-%m-%d"),
            "long_backtest_end": panel["date"].max().strftime("%Y-%m-%d"),
        },
    }

    crisis_window = sample[
        (sample["date"] >= pd.Timestamp("2021-07-01")) & (sample["date"] <= pd.Timestamp("2022-06-01"))
    ].copy()

    for column in ["slepi_user_spec", "slepi_adjusted"]:
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

    latest_available = {
        "fx_market_pressure": latest_non_null_month(panel, "usd_lkr"),
        "neer": latest_non_null_month(panel, "neer_index"),
        "current_account": latest_non_null_month(panel, "current_account_filled_usd_m"),
        "gross_reserves": latest_non_null_month(panel, "gross_reserves_usd_m"),
        "adjusted_usable_reserves": latest_non_null_month(panel, "adjusted_usable_reserves_usd_m"),
        "external_financing": latest_non_null_month(panel, "external_financing_pressure_z"),
        "external_debt": panel.attrs.get("latest_external_debt_actual")
        or latest_non_null_month(panel, "gross_external_debt_market_usd_m"),
        "debt_service": panel.attrs.get("latest_debt_service_actual")
        or latest_non_null_month(panel, "external_debt_service_payments_usd_m"),
        "imports": latest_non_null_month(panel, "imports_usd_m"),
        "tourism": latest_non_null_month(panel, "tourism_earnings_usd_m"),
        "remittances": latest_non_null_month(panel, "remittances_usd_m"),
        "buffer_inflows": latest_non_null_month(panel, "buffer_inflows_usd_m"),
        "services_balance": latest_non_null_month(panel, "services_balance_usd_m"),
        "m2b_nfa": latest_non_null_month(panel, "m2b_nfa_rs_m"),
    }

    required_columns = {
        "adjusted_usable_reserve_adequacy": "reserve_block_z",
        "fx_market_pressure": "fx_market_pressure_z",
        "external_financing": "external_financing_pressure_z",
        "current_account": "current_account_pressure_z",
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

    return {
        "built_at": freshness["artifact_built_at"],
        "pipeline_checked_at": freshness["pipeline_checked_at"],
        "recommended_headline": "slepi_adjusted",
        "headline_definition": (
            "Equal-weighted CBSL-compatible core: adjusted usable reserve adequacy, FX market pressure, "
            "external debt-service/rollover pressure, and current account pressure."
        ),
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
        "metrics": metrics,
        "freshness": freshness,
    }


def write_outputs(panel: pd.DataFrame, metrics: dict[str, Any], freshness: dict[str, Any]) -> None:
    panel.to_csv(PANEL_PATH, index=False)

    index_columns = [
        "date",
        "gross_reserves_usd_m",
        "adjusted_usable_reserves_usd_m",
        "reserve_net_drains_usd_m",
        "adjusted_usable_reserve_cover_months",
        "imports_usd_m",
        "exports_usd_m",
        "usd_lkr",
        "neer_index",
        "reer_index",
        "import_cover_months",
        "current_account_usd_m",
        "current_account_filled_usd_m",
        "gross_external_debt_market_usd_m",
        "short_term_external_debt_market_usd_m",
        "short_term_external_debt_to_reserves_raw",
        "external_debt_service_payments_usd_m",
        "external_debt_service_amortization_usd_m",
        "external_debt_service_interest_usd_m",
        "debt_service_to_external_receipts_pct",
        "services_balance_usd_m",
        "buffer_inflows_usd_m",
        "m2b_rs_m",
        "m2b_nfa_rs_m",
        "m2b_to_adjusted_reserves_raw",
        "m2b_nfa_deterioration_raw",
        "reserve_block_z",
        "fx_market_pressure_z",
        "external_financing_pressure_z",
        "current_account_pressure_z",
        "resident_fx_liability_pressure_z",
        "slepi_user_spec",
        "slepi_legacy_adjusted",
        "slepi_adjusted",
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

    latest = panel.dropna(subset=["slepi_adjusted"]).tail(1)
    latest_line = "No complete CBSL-compatible SLEPI observation was produced."
    if not latest.empty:
        row = latest.iloc[0]
        latest_line = (
            f"The latest complete CBSL-compatible SLEPI observation is {row['date'].strftime('%Y-%m-%d')} "
            f"with a value of {row['slepi_adjusted']:.2f}."
        )

    return f"""# SLEPI methodology assessment

## Recommendation

Use `slepi_adjusted` as the headline series. It now implements the CBSL-compatible
core proposed in the latest specification:

1. adjusted usable reserve adequacy
2. FX market pressure
3. external financing / rollover pressure
4. current account pressure

M2b, monetary-system NFA, imports, remittances, tourism and the services balance
are kept in the panel as explanatory dashboard variables, not forced into the
headline index.

## Current design verdict

The current four-block structure is:

- adjusted usable reserve adequacy: gross official reserves from the reserve data template, less predetermined short-term net drains and FX forward/swap short positions, scaled by trailing monthly imports
- FX market pressure: USD/LKR depreciation, NEER depreciation and reserve-loss pressure
- external financing pressure: short-term external debt relative to reserves, with annual debt-service pressure as a slow-moving rollover context
- current account pressure: monthly current account balance scaled by imports

This is a cleaner external-pressure index than the previous buffer-inflow core:
remittances and tourism still matter, but mainly as explanatory flows around the
current-account block rather than a separate core pillar.

## Data sufficiency

- Official monthly current-account history starts in `2023-01`.
- Official reserve-template history starts in `2013-11`.
- Quarterly external debt and banking-sector external liabilities start in `2012-Q4`.
- Monthly NEER/REER starts in `2013-01`.
- Monthly M2b and monetary-system NFA start in `1995-12`.
- Monthly services balance starts in `2023-01`.
- Annual debt-service, amortisation and interest are available in the Economic and Social Statistics table and are step-held across months.
- The longer backtest still uses local backfill already present in this folder for pre-2023 current-account proxying and pre-2013 reserve history.
- Monthly exports and imports are available from `2007-01`.
- Monthly remittances and tourism earnings are available from `2009-01`.
- Monthly FX history is available from `2005-01`.

This means the folder is enough for a useful long proxy backtest from the reserve-template/external-debt era, but not for a purely official monthly-current-account backtest before 2023.

## CBSL source verdict

- Reliable automated core sources: reserve data template, monthly current account, exchange-rate/NEER workbooks, quarterly external debt, annual debt-service, monthly imports.
- Reliable explanatory overlays: M2b, monetary-system NFA, services balance, imports, remittances and tourism.
- Not yet promoted to headline: broad money / FX deposit pressure. The pipeline computes M2b-to-adjusted-reserves and M2b NFA deterioration, but leaves them as a shadow resident-pressure block pending predictive testing.

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

Source for all three timing notes: [{ADVANCE_RELEASE_CALENDAR_URL}]({ADVANCE_RELEASE_CALENDAR_URL})

## Backtest snapshot

- Sample used for headline metrics: `{metrics['sample_start']}` to `{metrics['sample_end']}`
- Legacy user-spec SLEPI correlation with future 3-month external stress: `{user_metrics['correlation_with_future_external_stress_3m']:.3f}`
- Legacy user-spec SLEPI AUC for top-15% future stress events: `{user_metrics['auc_for_top_15pct_future_stress_event']:.3f}`
- CBSL-compatible SLEPI correlation with future 3-month external stress: `{adjusted_metrics['correlation_with_future_external_stress_3m']:.3f}`
- CBSL-compatible SLEPI AUC for top-15% future stress events: `{adjusted_metrics['auc_for_top_15pct_future_stress_event']:.3f}`
- Proxy fit linking trade balance to the adjusted external-balance block over the official overlap: slope `{metrics['proxy_fit']['slope']:.3f}`, correlation `{metrics['proxy_fit']['overlap_correlation']:.3f}`, overlap months `{metrics['proxy_fit']['overlap_months']}`

Both variants spike into the 2021-2022 external crisis window, with crisis peaks on:

- Legacy user-spec SLEPI: `{user_metrics['crisis_window_peak_date']}` at `{user_metrics['crisis_window_peak_value']:.2f}`
- CBSL-compatible SLEPI: `{adjusted_metrics['crisis_window_peak_date']}` at `{adjusted_metrics['crisis_window_peak_value']:.2f}`

## Practical interpretation

- Publish `slepi_adjusted` as the least overfitted CBSL-compatible SLEPI v1.
- Keep `slepi_user_spec`, `slepi_legacy_adjusted` and `resident_fx_liability_pressure_z` as shadow diagnostics.
- The next research step is predictive testing of the resident-pressure shadow block before deciding whether it belongs in the headline index.

## Latest observation

{latest_line}
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
