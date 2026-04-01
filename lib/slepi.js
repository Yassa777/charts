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
