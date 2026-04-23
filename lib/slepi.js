import "server-only";

import fs from "node:fs";
import path from "node:path";

const SNAPSHOT_PATH = path.join(process.cwd(), "data", "slepi", "snapshot.json");

function parseSnapshot(raw) {
  return JSON.parse(raw);
}

function getRemoteSnapshotUrl() {
  const baseUrl = process.env.SLEPI_PUBLIC_DATA_BASE_URL;
  if (!baseUrl) {
    return null;
  }

  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("snapshot.json", normalizedBase).toString();
}

async function readRemoteSnapshot() {
  const snapshotUrl = getRemoteSnapshotUrl();
  if (!snapshotUrl) {
    return null;
  }

  const response = await fetch(snapshotUrl, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch remote SLEPI snapshot: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function attachDataSource(snapshot, mode, url = null) {
  return {
    ...snapshot,
    dataSource: {
      mode,
      url,
    },
  };
}

function readLocalSnapshot() {
  return parseSnapshot(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
}

export async function getSlepiSnapshot() {
  const snapshotUrl = getRemoteSnapshotUrl();

  try {
    const remoteSnapshot = await readRemoteSnapshot();
    if (remoteSnapshot) {
      return attachDataSource(remoteSnapshot, "object-storage", snapshotUrl);
    }
  } catch (error) {
    if (!fs.existsSync(SNAPSHOT_PATH)) {
      throw error;
    }
  }

  return attachDataSource(readLocalSnapshot(), "local-file");
}

function monthLabel(dateString, opts = {}) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    ...opts,
  }).format(date);
}

function numberLabel(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function percentLabel(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return `${numberLabel(value * 100, digits)}%`;
}

export function formatMonth(dateString) {
  return monthLabel(dateString);
}

export function formatNumber(value, digits = 2) {
  return numberLabel(value, digits);
}

export function formatPercent(value, digits = 1) {
  return percentLabel(value, digits);
}

function readPanelRows() {
  const csvPath = path.join(process.cwd(), "data", "slepi", "monthly_panel.csv");
  if (!fs.existsSync(csvPath)) return { rows: [], headers: [] };

  const lines = fs.readFileSync(csvPath, "utf8").trim().split("\n");
  const headers = lines[0].split(",");
  const col = (name) => headers.indexOf(name);

  const rows = lines.slice(1).map((line) => {
    const c = line.split(",");
    const pickF = (name) => {
      const idx = col(name);
      return idx >= 0 ? parseFloat(c[idx]) : NaN;
    };
    return {
      date: c[col("date")]?.trim(),
      reserve_block_z: pickF("reserve_block_z"),
      fx_market_pressure_z: pickF("fx_market_pressure_z"),
      external_balance_pressure_adjusted_z: pickF("external_balance_pressure_adjusted_z"),
      buffer_inflow_support_z: pickF("buffer_inflow_support_z"),
      slepi_adjusted: pickF("slepi_adjusted"),
      usd_lkr: pickF("usd_lkr"),
      import_cover_months: pickF("import_cover_months"),
      current_account_filled_usd_m: pickF("current_account_filled_usd_m"),
      buffer_inflows_usd_m: pickF("buffer_inflows_usd_m"),
    };
  });

  return { rows, headers };
}

export function getComponentHistory(length = 24) {
  const { rows } = readPanelRows();
  return rows
    .filter((r) => r.date && Number.isFinite(r.slepi_adjusted))
    .slice(-length);
}

export function getScoreHistory(length = 60) {
  const { rows } = readPanelRows();
  return rows
    .filter((r) => r.date && Number.isFinite(r.slepi_adjusted))
    .slice(-length)
    .map((r) => ({ date: r.date, score: r.slepi_adjusted }));
}

export function getStatHistory(length = 18) {
  const { rows } = readPanelRows();
  return rows
    .filter((r) => r.date)
    .slice(-length)
    .map((r) => ({
      date: r.date,
      usd_lkr: r.usd_lkr,
      import_cover_months: r.import_cover_months,
      current_account_filled_usd_m: r.current_account_filled_usd_m,
      buffer_inflows_usd_m: r.buffer_inflows_usd_m,
    }));
}
