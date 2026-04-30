export const HEADLINE_DEFINITION =
  "Equal-weighted CBSL-compatible core: adjusted usable reserve adequacy, FX market pressure, external debt-service/rollover pressure, and a staged external-balance/current-account pressure block.";

export const COMPONENT_METHODS = [
  "Adjusted usable reserve adequacy: gross official reserves less reserve-template short-term drains and FX forward/swap short positions, scaled by trailing imports.",
  "FX market pressure: USD/LKR depreciation, NEER depreciation, and reserve-loss pressure.",
  "External financing pressure: short-term external debt relative to reserves plus debt-service rollover context.",
  "External balance pressure: official monthly current account over imports when available; otherwise a bias-adjusted ladder using trade, services, tourism, and remittances.",
];

export const AGGREGATION_METHODS = [
  "Each component is converted to a real-time z-score.",
  "The headline SLEPI score is the equal-weighted average of the four component z-scores when all headline blocks are available.",
];
