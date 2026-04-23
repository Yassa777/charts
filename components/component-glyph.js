/* Monochrome SVG glyphs per SLEPI component — reserves, FX, external balance, buffers.
   `color` drives stroke; defaults to currentColor so CSS can tint. */

export function ComponentGlyph({ kind, size = 20, color = "currentColor" }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  switch (kind) {
    case "reserves":
      /* Vault / coin-stack — stability cushion */
      return (
        <svg {...common}>
          <rect x="3.5" y="6.5" width="17" height="12" rx="1.5" />
          <line x1="3.5" y1="10" x2="20.5" y2="10" />
          <circle cx="12" cy="14" r="2.2" />
          <line x1="6.5" y1="18.5" x2="6.5" y2="20" />
          <line x1="17.5" y1="18.5" x2="17.5" y2="20" />
        </svg>
      );
    case "fx":
      /* Two arrows crossing — exchange-rate pressure */
      return (
        <svg {...common}>
          <path d="M4 8 L18 8" />
          <path d="M15 5 L18 8 L15 11" />
          <path d="M20 16 L6 16" />
          <path d="M9 13 L6 16 L9 19" />
        </svg>
      );
    case "external":
      /* Balance scales — current account vs buffers */
      return (
        <svg {...common}>
          <line x1="12" y1="4" x2="12" y2="20" />
          <line x1="7" y1="20" x2="17" y2="20" />
          <line x1="4" y1="8" x2="20" y2="8" />
          <path d="M4 8 L2 13 a3 3 0 0 0 4 0 Z" />
          <path d="M20 8 L18 13 a3 3 0 0 0 4 0 Z" />
        </svg>
      );
    case "buffer":
      /* Wave — inflows of remittances + tourism */
      return (
        <svg {...common}>
          <path d="M3 10 Q 7 6, 12 10 T 21 10" />
          <path d="M3 15 Q 7 11, 12 15 T 21 15" opacity="0.55" />
        </svg>
      );
    default:
      return null;
  }
}
