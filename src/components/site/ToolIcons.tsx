import type { ReactElement, SVGProps } from 'react';

/** Custom 24px line icons for each order-flow tool (stroke = currentColor, soft fills at low opacity). */
type P = SVGProps<SVGSVGElement>;
const base = (p: P): P => ({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...p });

export const HeatmapIcon = (p: P) => (<svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 9h18M3 14h18" opacity=".35" /><rect x="6" y="5.5" width="7" height="2.4" rx="1" fill="currentColor" opacity=".35" stroke="none" /><rect x="10" y="15.4" width="9" height="2.4" rx="1" fill="currentColor" opacity=".6" stroke="none" /><path d="M5 13l3-2 3 1.5 3-3.5 3 1.5 2-1" /></svg>);
export const FootprintIcon = (p: P) => (<svg {...base(p)}><path d="M12 2.5v2M12 19.5v2" /><rect x="5" y="4.5" width="14" height="15" rx="2" /><path d="M12 4.5v15M5 9.5h14M5 14.5h14" opacity=".45" /><rect x="7" y="10.8" width="3.5" height="2.4" rx=".6" fill="currentColor" opacity=".55" stroke="none" /><rect x="13.5" y="10.8" width="2" height="2.4" rx=".6" fill="currentColor" opacity=".3" stroke="none" /><rect x="5" y="9.5" width="14" height="5" rx="1" strokeWidth="1.2" /></svg>);
export const DomIcon = (p: P) => (<svg {...base(p)}><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M4 12h16" strokeDasharray="2 2" /><path d="M13 5.5h4.5M11 7.8h6.5M14.5 10h3" /><path d="M6.5 14h6M6.5 16.2h3.5M6.5 18.5h8" /></svg>);
export const CvdIcon = (p: P) => (<svg {...base(p)}><path d="M3 12h18" opacity=".45" /><path d="M6 12V8M9.5 12V5.5M13 12v2.5M16.5 12V9" strokeWidth="2.4" /><path d="M13 12v4.5M20 12v6" strokeWidth="2.4" opacity=".5" /><path d="M3.5 18.5 8 15l4 1.5 4-5 4.5-3" /></svg>);
export const ProfileIcon = (p: P) => (<svg {...base(p)}><path d="M4 3v18" /><path d="M4 5h4M4 7.8h7M4 10.6h11M4 16.2h8M4 19h4" /><path d="M4 13.4h15" strokeWidth="2.4" /><path d="M20 6.5v13" strokeDasharray="1.5 2" opacity=".5" /></svg>);
export const WhaleIcon = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="3" fill="currentColor" opacity=".55" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="9.2" opacity=".4" /><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" opacity=".6" /></svg>);
export const LiquidationIcon = (p: P) => (<svg {...base(p)}><path d="M13.5 2.5 6 13h5l-1.5 8.5L18 10.5h-5z" fill="currentColor" fillOpacity=".18" /><circle cx="18.5" cy="18.5" r="2.2" /><circle cx="5" cy="19" r="1.3" opacity=".6" /></svg>);
export const PressureIcon = (p: P) => (<svg {...base(p)}><path d="M3 9h7M7 6l3 3-3 3" /><path d="M21 15h-7M17 12l-3 3 3 3" /><path d="M12 3v18" strokeDasharray="2 2.2" opacity=".5" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /></svg>);
export const RadarIcon = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.5" opacity=".5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><path d="M12 12 18.4 5.6" /><path d="M12 3a9 9 0 0 1 6.4 2.6L12 12z" fill="currentColor" opacity=".18" stroke="none" /><circle cx="15.5" cy="15" r="1.3" fill="currentColor" stroke="none" /><circle cx="7.5" cy="9" r="1" fill="currentColor" opacity=".6" stroke="none" /></svg>);
export const FuturesIcon = (p: P) => (<svg {...base(p)}><path d="M6 3v3M6 15v3M12 6v2.5M12 17v3M18 4v3.5M18 14v3" /><rect x="4" y="6" width="4" height="9" rx="1" fill="currentColor" fillOpacity=".18" /><rect x="10" y="8.5" width="4" height="8.5" rx="1" /><rect x="16" y="7.5" width="4" height="6.5" rx="1" fill="currentColor" fillOpacity=".18" /></svg>);
export const ForexIcon = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.5 3.8 5.5 3.8 9S14.6 18.5 12 21c-2.6-2.5-3.8-5.5-3.8-9S9.4 5.5 12 3z" opacity=".55" /><path d="M16.5 4.5 19 3l.5 2.8" /></svg>);

export const TOOL_ICONS: Record<string, (p: P) => ReactElement> = {
  heatmap: HeatmapIcon, footprint: FootprintIcon, dom: DomIcon, cvd: CvdIcon, profile: ProfileIcon,
  whales: WhaleIcon, liquidations: LiquidationIcon, pressure: PressureIcon, radar: RadarIcon,
};
