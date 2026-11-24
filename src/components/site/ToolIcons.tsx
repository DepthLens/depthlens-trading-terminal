import type { ReactElement, SVGProps } from 'react';

/** Custom 24px line icons for each order-flow tool (stroke = currentColor, soft fills at low opacity). */
type P = SVGProps<SVGSVGElement>;
const base = (p: P): P => ({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...p });
const F = { fill: 'currentColor', stroke: 'none' } as const;

/** Heatmap: liquidity bands of varying intensity over time with the price path cutting through. */
export const HeatmapIcon = (p: P) => (<svg {...base(p)}><rect x="3" y="3.5" width="18" height="17" rx="2.5" /><rect x="5.5" y="6" width="5" height="2" rx=".5" {...F} opacity=".3" /><rect x="11.5" y="6" width="7" height="2" rx=".5" {...F} opacity=".75" /><rect x="5.5" y="11" width="3" height="2" rx=".5" {...F} opacity=".45" /><rect x="13.5" y="11" width="5" height="2" rx=".5" {...F} opacity=".25" /><rect x="5.5" y="16" width="8" height="2" rx=".5" {...F} opacity=".9" /><rect x="14.5" y="16" width="4" height="2" rx=".5" {...F} opacity=".4" /><path d="M4 14.5 8 13l3.5 1.2L16 9.8l4 .9" strokeWidth="1.6" /></svg>);
/** Footprint: one candle split into bid × ask cells, point of control highlighted. */
export const FootprintIcon = (p: P) => (<svg {...base(p)}><path d="M12 2.5V5M12 19v2.5" /><rect x="5.5" y="5" width="13" height="14" rx="1.5" /><path d="M12 5v14" opacity=".55" /><path d="M5.5 8.5h13M5.5 15.5h13" opacity=".35" /><rect x="5.5" y="12" width="13" height="3.5" {...F} opacity=".28" /><path d="M7.5 10.25h2.5M14 10.25h1.5M7.5 13.75h3M14 13.75h3M7.5 17.25h1.5M14 17.25h2" strokeWidth="1.3" /></svg>);
/** DOM: price ladder with asks stacked above and bids below the spread. */
export const DomIcon = (p: P) => (<svg {...base(p)}><path d="M12 3v18" opacity=".45" /><path d="M13.5 5h4M13.5 7.5H20M13.5 10H16" strokeWidth="2" /><path d="M10.5 14H6M10.5 16.5H4M10.5 19H8" strokeWidth="2" /><path d="M5 12h14" strokeDasharray="1.5 2" opacity=".6" /></svg>);
/** CVD: delta histogram around a zero line with the cumulative line rising through it. */
export const CvdIcon = (p: P) => (<svg {...base(p)}><path d="M3 14.5h18" opacity=".4" /><path d="M5.5 14.5v-3M9 14.5v-5M12.5 14.5v3.5M16 14.5v-4M19.5 14.5v-6.5" strokeWidth="2.2" opacity=".55" /><path d="M3.5 12 7.5 9.5l3.5 2 4-4.5 5.5-3" /><circle cx="20.5" cy="4" r="1.3" {...F} /></svg>);
/** Volume Profile: horizontal volume distribution with POC bar and value-area bounds. */
export const ProfileIcon = (p: P) => (<svg {...base(p)}><path d="M3.5 3v18" /><path d="M3.5 5.5h4M3.5 8h7M3.5 15.5h9M3.5 18h5" strokeWidth="1.8" opacity=".6" /><path d="M3.5 10.5h12M3.5 13h10" strokeWidth="1.8" /><circle cx="18.5" cy="11.75" r="1.4" {...F} /></svg>);
/** Whale Trades: candles with a large executed trade circled at its price. */
export const WhaleIcon = (p: P) => (<svg {...base(p)}><path d="M5 5v14M10 8v11" opacity=".55" /><rect x="3.75" y="8" width="2.5" height="6" rx=".5" {...F} opacity=".45" /><rect x="8.75" y="11" width="2.5" height="5" rx=".5" {...F} opacity=".45" /><circle cx="16.5" cy="9.5" r="4.75" {...F} fillOpacity=".16" /><circle cx="16.5" cy="9.5" r="4.75" /><circle cx="16.5" cy="9.5" r="1.4" {...F} /><path d="M16.5 14.25V20" opacity=".55" /></svg>);
/** Liquidations: forced-exit bolt breaking through a dashed liquidation level. */
export const LiquidationIcon = (p: P) => (<svg {...base(p)}><path d="M3 12h4M17 12h4" strokeDasharray="1.5 2" opacity=".6" /><path d="M13.5 2.5 7.5 13h4.5l-1.5 8.5 6-10.5H12z" fill="currentColor" fillOpacity=".2" /><path d="M4.5 5.5 6 7M19.5 18.5 18 17M19.5 5.5 18 7M4.5 18.5 6 17" opacity=".55" /></svg>);
/** Price Pressure: force gauge between sellers and buyers with the needle showing control. */
export const PressureIcon = (p: P) => (<svg {...base(p)}><path d="M3.5 16.5a8.5 8.5 0 0 1 17 0" /><path d="M3.5 16.5a8.5 8.5 0 0 1 4.2-7.35" strokeWidth="2.6" opacity=".35" /><path d="M16.3 9.15a8.5 8.5 0 0 1 4.2 7.35" strokeWidth="2.6" /><path d="M12 8v1.5M7.2 10.4l.9.9M16.8 10.4l-.9.9" opacity=".6" /><path d="M12 16.5 15.6 11" strokeWidth="1.7" /><circle cx="12" cy="16.5" r="1.6" {...F} /><path d="M3.5 20h17" opacity=".4" /></svg>);
/** Flow Radar: target-lock brackets around a candle where a setup was detected. */
export const RadarIcon = (p: P) => (<svg {...base(p)}><path d="M3.5 8V3.5H8M16 3.5h4.5V8M20.5 16v4.5H16M8 20.5H3.5V16" /><path d="M12 6v12" /><rect x="10" y="9" width="4" height="6" rx=".6" {...F} opacity=".35" /><rect x="10" y="9" width="4" height="6" rx=".6" /><circle cx="17.5" cy="12" r="1.2" {...F} /><circle cx="6.5" cy="12" r="1.2" {...F} opacity=".5" /></svg>);
export const FuturesIcon = (p: P) => (<svg {...base(p)}><path d="M6 3v3M6 15v3M12 6v2.5M12 17v3M18 4v3.5M18 14v3" /><rect x="4" y="6" width="4" height="9" rx="1" fill="currentColor" fillOpacity=".18" /><rect x="10" y="8.5" width="4" height="8.5" rx="1" /><rect x="16" y="7.5" width="4" height="6.5" rx="1" fill="currentColor" fillOpacity=".18" /></svg>);
export const ForexIcon = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.5 3.8 5.5 3.8 9S14.6 18.5 12 21c-2.6-2.5-3.8-5.5-3.8-9S9.4 5.5 12 3z" opacity=".55" /><path d="M16.5 4.5 19 3l.5 2.8" /></svg>);

export const TOOL_ICONS: Record<string, (p: P) => ReactElement> = {
  heatmap: HeatmapIcon, footprint: FootprintIcon, dom: DomIcon, cvd: CvdIcon, profile: ProfileIcon,
  whales: WhaleIcon, liquidations: LiquidationIcon, pressure: PressureIcon, radar: RadarIcon,
};
