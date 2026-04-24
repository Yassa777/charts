# SLEPI methodology assessment

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
- Legacy user-spec SLEPI correlation with future 3-month external stress: `0.297`
- Legacy user-spec SLEPI AUC for top-15% future stress events: `0.636`
- CBSL-compatible SLEPI correlation with future 3-month external stress: `0.219`
- CBSL-compatible SLEPI AUC for top-15% future stress events: `0.662`
- Proxy fit linking trade balance to the adjusted external-balance block over the official overlap: slope `1.099`, correlation `0.899`, overlap months `38`

Both variants spike into the 2021-2022 external crisis window, with crisis peaks on:

- Legacy user-spec SLEPI: `2022-04-01` at `2.56`
- CBSL-compatible SLEPI: `2022-04-01` at `1.87`

## Practical interpretation

- Publish `slepi_adjusted` as the least overfitted CBSL-compatible SLEPI v1.
- Keep `slepi_user_spec`, `slepi_legacy_adjusted` and `resident_fx_liability_pressure_z` as shadow diagnostics.
- The next research step is predictive testing of the resident-pressure shadow block before deciding whether it belongs in the headline index.

## Latest observation

The latest complete CBSL-compatible SLEPI observation is 2026-02-01 with a value of -0.43.
