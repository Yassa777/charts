# SLEPI methodology assessment

## Recommendation

Use `slepi_adjusted` as the headline series and keep `slepi_user_spec` as a shadow series.

Reason:

- the raw user specification counts remittances and tourism twice: once inside monthly current account balance and again inside the buffer-inflow support block
- the adjusted version strips those inflows out of the external-balance block first, which makes the four blocks economically cleaner
- in the rough historical backtest here, the adjusted variant is only marginally weaker than the raw variant, so the loss from de-duplication is small

## Current design verdict

The four-block structure is defensible, but the clean implementation is:

1. reserve adequacy via import cover
2. FX market pressure via monthly USD/LKR depreciation
3. underlying external-balance pressure via current account excluding remittances and tourism
4. buffer-inflow support via remittances plus tourism, scaled by imports

That preserves the intent of your design while reducing overlap.

## Data sufficiency

- Official monthly current-account history starts in `2023-01`.
- Official reserve-template history starts in `2013-11`.
- The longer backtest therefore uses local backfill already present in this folder for pre-2023 current-account proxying and pre-2013 reserve history.
- Monthly exports and imports are available from `2007-01`.
- Monthly remittances and tourism earnings are available from `2009-01`.
- Monthly FX history is available from `2005-01`.

This means the folder is enough for a useful long proxy backtest, but not for a purely official monthly-current-account backtest before 2023.

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
- Raw user-spec SLEPI correlation with future 3-month external stress: `0.243`
- Raw user-spec SLEPI AUC for top-15% future stress events: `0.535`
- Adjusted SLEPI correlation with future 3-month external stress: `0.214`
- Adjusted SLEPI AUC for top-15% future stress events: `0.547`
- Proxy fit linking trade balance to the adjusted external-balance block over the official overlap: slope `1.099`, correlation `0.899`, overlap months `38`

Both variants spike sharply into the 2021-2022 external crisis window, with crisis peaks on:

- Raw user-spec SLEPI: `2022-04-01` at `3.17`
- Adjusted SLEPI: `2022-04-01` at `2.79`

## Practical interpretation

- If you want a clean policy dashboard, publish `slepi_adjusted`.
- If you want a simple continuity check against the original idea, keep `slepi_user_spec` beside it.
- If you later want a true daily nowcast, the next upgrade should be a daily FX sub-index plus step-held monthly external blocks, rather than forcing all four blocks into a fake daily frequency.

## Latest observation

The latest complete adjusted SLEPI observation is 2026-02-01 with a value of -0.36.
