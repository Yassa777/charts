# SLEPI Pipeline + UI

This workspace now includes a small Python pipeline for a Sri Lanka External Pressure Index (SLEPI).

Run it from the project root:

```bash
python3 scripts/build_slepi.py
```

The script does four things in one pass:

- discovers the latest official CBSL external-sector workbooks from the live statistical tables page
- downloads and caches the source files in `data/slepi/raw/`
- rebuilds a monthly SLEPI panel and two index variants in `data/slepi/`
- writes a compact methodology and backtest note

Outputs:

- `data/slepi/source_manifest.json`
- `data/slepi/monthly_panel.csv`
- `data/slepi/index_series.csv`
- `data/slepi/backtest_metrics.json`
- `data/slepi/freshness.json`
- `data/slepi/snapshot.json`
- `data/slepi/methodology_assessment.md`

Optional publish step:

```bash
python3 scripts/build_slepi.py --publish-object-storage
```

That uploads the generated artifacts to S3-compatible object storage if the required environment
variables are set:

- `SLEPI_OBJECT_STORAGE_BUCKET`
- `SLEPI_OBJECT_STORAGE_REGION`
- `SLEPI_OBJECT_STORAGE_ACCESS_KEY_ID`
- `SLEPI_OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `SLEPI_OBJECT_STORAGE_ENDPOINT` optional, for non-AWS S3-compatible providers
- `SLEPI_OBJECT_STORAGE_SESSION_TOKEN` optional
- `SLEPI_OBJECT_STORAGE_KEY_PREFIX` optional, defaults to `slepi`
- `SLEPI_OBJECT_STORAGE_CACHE_CONTROL` optional, defaults to `public, max-age=300`

## UI

A minimal Vercel-ready Next.js frontend is included at the repo root.

Recommended stack:

- frontend: `Next.js` on Vercel, not Vite
- storage: `Cloudflare R2` with a public bucket or custom domain

Reason:

- Next.js fits the current app because the page already fetches server-side data at request time
- Vercel deployment and Next.js runtime data fetching work together cleanly
- R2 is S3-compatible, so the Python publisher can use the same upload path as AWS-style object storage
- `.env.example` includes the variables for both Vercel and the publishing workflow

## Cloudflare R2 setup

Use the existing bucket you created and wire it as follows.

### 1. Pick the public URL strategy

In the R2 bucket dashboard:

- production: `Settings -> Custom Domains -> Add`
- temporary testing only: `Settings -> Public Development URL -> Enable`

Recommendation:

- use a custom domain for production, for example `data.charts.lk`
- do not rely on the public development URL long term

If you keep the default `SLEPI_OBJECT_STORAGE_KEY_PREFIX=slepi`, your public snapshot URL will be:

```text
https://data.charts.lk/slepi/snapshot.json
```

That means your Vercel environment variable should be:

```bash
SLEPI_PUBLIC_DATA_BASE_URL=https://data.charts.lk/slepi
```

### 2. Copy the correct R2 API endpoint

In the bucket `Settings -> General`, Cloudflare shows an `S3 API` URL.

For the uploader config, use the account-level endpoint:

```text
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Important:

- if the dashboard shows a URL ending in `/<bucket-name>`, do not worry
- the pipeline now strips any bucket path automatically
- `SLEPI_OBJECT_STORAGE_BUCKET` must still be the bucket name by itself, for example `slepichart`

### 3. Create R2 API credentials

In Cloudflare:

- go to `R2 Object Storage`
- open `Manage R2 API tokens` or the account-level API token page for R2
- create a token with read and write access to this bucket
- copy the `Access Key ID`
- copy the `Secret Access Key`

Use these values:

```bash
SLEPI_OBJECT_STORAGE_ACCESS_KEY_ID=...
SLEPI_OBJECT_STORAGE_SECRET_ACCESS_KEY=...
SLEPI_OBJECT_STORAGE_REGION=auto
SLEPI_OBJECT_STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
SLEPI_OBJECT_STORAGE_BUCKET=slepichart
SLEPI_OBJECT_STORAGE_KEY_PREFIX=slepi
```

### 4. Dashboard settings you do and do not need

Use:

- `Custom Domains`: yes, for the production public URL
- `Public Development URL`: optional, only for quick testing before the custom domain is ready

Leave alone for now:

- `CORS Policy`: not needed for the current app, because Next.js fetches server-side
- `Object Lifecycle Rules`: not needed unless you want expiry/archival
- `Bucket Lock Rules`: not needed
- `Event Notifications`: not needed
- `R2 Data Catalog`: not needed

### 5. GitHub Actions secrets

Add these repository secrets in GitHub:

- `SLEPI_OBJECT_STORAGE_BUCKET`
- `SLEPI_OBJECT_STORAGE_REGION`
- `SLEPI_OBJECT_STORAGE_ENDPOINT`
- `SLEPI_OBJECT_STORAGE_ACCESS_KEY_ID`
- `SLEPI_OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `SLEPI_OBJECT_STORAGE_KEY_PREFIX`
- `SLEPI_OBJECT_STORAGE_CACHE_CONTROL`

Recommended values:

```text
SLEPI_OBJECT_STORAGE_REGION=auto
SLEPI_OBJECT_STORAGE_KEY_PREFIX=slepi
SLEPI_OBJECT_STORAGE_CACHE_CONTROL=public, max-age=300
```

### 6. Vercel environment variables

In Vercel, add:

```bash
SLEPI_PUBLIC_DATA_BASE_URL=https://data.charts.lk/slepi
```

You only need one redeploy after setting this so the app starts reading from R2.

### 7. First publish test

Run locally once:

```bash
python3 scripts/build_slepi.py --publish-object-storage
```

Then verify:

- `https://data.charts.lk/slepi/snapshot.json`
- `https://data.charts.lk/slepi/freshness.json`

After that, trigger the GitHub Actions workflow manually once and confirm the files update in R2.

Run locally:

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run start
```

Deploy to Vercel as a standard Next.js project.

Data-source modes:

- default: the UI reads `data/slepi/snapshot.json` from the repo or local workspace
- preferred for production: set `SLEPI_PUBLIC_DATA_BASE_URL` so the UI reads
  `snapshot.json` from object storage at request time, with no redeploy required

`SLEPI_PUBLIC_DATA_BASE_URL` should point at the public folder URL that contains the uploaded
artifacts, for example:

```bash
SLEPI_PUBLIC_DATA_BASE_URL=https://cdn.example.com/slepi
```

The app will then request:

```text
https://cdn.example.com/slepi/snapshot.json
```

For a new setup, copy `.env.example` into your local env file and set the real bucket values.

## GitHub Actions automation

A scheduled workflow is included at `.github/workflows/update-slepi.yml`.

What it does:

- runs `python3 scripts/build_slepi.py`
- rebuilds the generated SLEPI artifacts in `data/slepi/`
- uploads them to object storage when the storage secrets are configured
- runs `npm run build` as a safety check
- falls back to committing `data/slepi/*` only when object storage is not configured

Default schedule:

- `03:15 UTC` every day
- that is `08:45` in Sri Lanka (`Asia/Colombo`)

Deployment model:

- preferred: GitHub Actions publishes the latest artifacts to object storage, and the Vercel app
  reads them directly at runtime
- fallback: if object storage is not configured, GitHub Actions updates `data/slepi/*` in git and
  the push triggers a fresh Vercel deployment

Implementation notes:

- `slepi_user_spec` follows the raw four-block design exactly.
- `slepi_adjusted` is the recommended headline version because it avoids double-counting remittances and tourism inside both the current-account block and the support block.
- Official monthly current-account data only begins in `2023-01`, so the long backtest uses a calibrated historical proxy for the external-balance block.
- Official reserve-history coverage in the CBSL reserve-template workbook begins in `2013-11`; earlier reserve history is backfilled from the existing local compiled series already in this folder.

Daily automation:

```bash
0 7 * * * cd "/Users/dim/Desktop/DAV Lab Documents/Ceylon Data Strategy/Charts.lk" && python3 scripts/build_slepi.py >> /tmp/slepi.log 2>&1
```

The script is safe to run daily. It refreshes the source manifest each run and redownloads files only when the CBSL source URL or file headers change, unless `--force` is passed.

Object-storage deployment notes:

- use a public-read bucket or CDN path for the SLEPI artifact folder
- point Vercel at that folder with `SLEPI_PUBLIC_DATA_BASE_URL`
- configure the GitHub Actions secrets listed above so the daily workflow can publish without
  touching git
- if the remote snapshot is unavailable, the app falls back to the local `data/slepi/snapshot.json`
