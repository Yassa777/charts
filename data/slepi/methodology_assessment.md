# SLEPI methodology assessment

## Recommendation

Use `slepi_adjusted` as the headline series. It now implements the CBSL-compatible
core proposed in the latest specification:

1. adjusted usable reserve adequacy
2. FX market pressure
3. external financing / rollover pressure
4. staged external-balance / current-account pressure

M2b, monetary-system NFA, imports, remittances, tourism and the services balance
are kept in the panel as explanatory dashboard variables, not forced into the
headline index.

## Current design verdict

The current four-block structure is:

- adjusted usable reserve adequacy: gross official reserves from the reserve data template, less predetermined short-term net drains and FX forward/swap short positions, scaled by trailing monthly imports
- FX market pressure: USD/LKR depreciation, NEER depreciation and reserve-loss pressure
- external financing pressure: short-term external debt relative to reserves, with annual debt-service pressure as a slow-moving rollover context
- external-balance/current-account pressure: official monthly current account scaled by imports when available; otherwise a provisional source ladder uses trade plus services and remittances, then trade plus tourism and remittances, then trade balance alone. Each provisional stage is adjusted by the rolling median gap to official current-account pressure over the previous official overlap.

This is a cleaner external-pressure index than the previous buffer-inflow core:
remittances and tourism still matter, but mainly as explanatory flows around the
external-balance block rather than a separate core pillar.

## External-balance source ladder

The current-account block now avoids waiting for the slowest official revision when faster
goods-trade data are already available:

1. `official_current_account`: official monthly current account / imports.
2. `goods_services_remittances_nowcast`: exports minus imports plus services balance plus remittances / imports. Tourism is not added here because it is already inside the services balance.
3. `trade_tourism_remittances_nowcast`: exports minus imports plus tourism earnings plus remittances / imports when full services data are not yet available.
4. `trade_balance_fast_signal`: exports minus imports / imports as the earliest fallback.

The staged design handles three main failure modes: double-counting tourism inside services,
overfitting a short post-2023 current-account overlap, and introducing look-ahead bias in the
live pipeline. The bias adjustment is deliberately simple: a rolling median residual against
official current-account pressure, shifted by one month so the current observation never uses
its own official current-account value.

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

- Reliable automated core sources: reserve data template, exports, imports, monthly current account, services balance, remittances, tourism, exchange-rate/NEER workbooks, quarterly external debt and annual debt-service.
- Reliable explanatory overlays: M2b, monetary-system NFA, services balance, imports, remittances and tourism.
- Not yet promoted to headline: broad money / FX deposit pressure. The pipeline computes M2b-to-adjusted-reserves and M2b NFA deterioration, but leaves them as a shadow resident-pressure block pending predictive testing.

## CBSL release cadence

- Broad external-sector release: CBSL's 2026 advance release calendar schedules the broad external-sector release (trade, current account, tourism, services, reserve template and related press release) on the last business day of the following month.
  - January 2026 reference period -> February 27, 2026 release
  - February 2026 reference period -> March 31, 2026 release
- Workers' remittances: CBSL's 2026 advance release calendar schedules workers' remittances around the first or second Friday of the following month.
  - January 2026 reference period -> February 6, 2026 release
  - February 2026 reference period -> March 6, 2026 release
- FX intervention disclosure: CBSL's 2026 advance release calendar schedules monthly FX intervention data on the first Friday of the following month.
  - January 2026 reference period -> February 6, 2026 release
  - February 2026 reference period -> March 6, 2026 release

Source for all three timing notes: [https://www.cbsl.gov.lk/en/advance-release-calendar-2026](https://www.cbsl.gov.lk/en/advance-release-calendar-2026)

## Backtest snapshot

- Sample used for headline metrics: `2014-01-01` to `2026-01-01`
- Legacy user-spec SLEPI correlation with future 3-month external stress: `0.278`
- Legacy user-spec SLEPI AUC for top-15% future stress events: `0.621`
- CBSL-compatible SLEPI correlation with future 3-month external stress: `0.193`
- CBSL-compatible SLEPI AUC for top-15% future stress events: `0.651`
- Source-ladder stage counts: `{'missing': 136, 'official_current_account': 38, 'trade_balance_fast_signal': 24, 'trade_tourism_remittances_nowcast': 167}`
- Trade-balance fallback overlap with official current-account pressure: correlation `0.770` over `38` months
- Tourism/remittances enriched fallback overlap: correlation `0.882` over `38` months
- Services/remittances enriched fallback overlap: correlation `0.914` over `38` months

Both variants spike into the 2021-2022 external crisis window, with crisis peaks on:

- Legacy user-spec SLEPI: `2022-04-01` at `2.41`
- CBSL-compatible SLEPI: `2022-03-01` at `1.76`

## Practical interpretation

- Publish `slepi_adjusted` as the least overfitted CBSL-compatible SLEPI v1.
- Keep `slepi_user_spec`, `slepi_legacy_adjusted` and `resident_fx_liability_pressure_z` as shadow diagnostics.
- The next research step is predictive testing of the resident-pressure shadow block before deciding whether it belongs in the headline index.

## Latest observation

The latest complete CBSL-compatible SLEPI observation is 2026-02-01 with a value of -0.33.
