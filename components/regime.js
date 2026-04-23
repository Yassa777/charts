export function getRegime(score) {
  if (score === null || score === undefined || !Number.isFinite(score)) return "neutral";
  if (score >= 1.5)  return "acute";
  if (score >= 0.5)  return "elevated";
  if (score <= -0.5) return "supportive";
  return "neutral";
}

export function regimeLabel(regime) {
  return {
    acute: "Acute pressure",
    elevated: "Elevated pressure",
    neutral: "Calm",
    supportive: "Supportive",
  }[regime] ?? "Calm";
}

export function regimeColor(regime) {
  return {
    acute: "#b91c1c",
    elevated: "#d97706",
    neutral: "#64748b",
    supportive: "#059669",
  }[regime] ?? "#64748b";
}
