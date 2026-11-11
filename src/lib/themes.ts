// Single source of truth for the selectable colour presets. Tokens are emitted as CSS by themeCss() in the root
// head, so every page (terminal, /pressure, landing, auth) and every chart reading CSS tokens uses them.
// Signal colours (buy/sell, POC, heatmap scale, status, logo) are not part of the chrome palette except the
// light preset's slightly darker green/red for readability on white.
export type ThemePreset = { id: string; label: string; swatch: [string, string]; tokens: Record<string, string> };

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'royal', label: 'White & Royal Blue', swatch: ['#FFFFFF', '#2563EB'], tokens: {
    '--t-bg': '#FFFFFF', '--t-panel': '#F4F6FA', '--t-raised': '#E9EDF4', '--t-border': '#E2E8F0', '--t-control-border': '#CBD5E1', '--t-disabled': '#9CA3AF',
    '--t-text': '#1F2937', '--t-muted': '#6B7280', '--t-accent': '#2563EB', '--t-accent-hover': '#1D4ED8', '--t-accent-press': '#1E40AF',
    '--t-ring': '#2563EB', '--t-accent-fg': '#FFFFFF', '--t-accent-fg-sm': '#FFFFFF', '--t-grid': 'rgba(31,41,55,0.08)', '--t-crosshair': 'rgba(31,41,55,0.55)',
    '--t-up': '#16A34A', '--t-down': '#DC2626', '--fp-text': '#1F2937', '--fp-outline': '#374151', '--flow-text': '#1F2937', '--flow-shadow': '#FFFFFF', '--flow-value-area': '#2563EB',
  } },
  { id: 'bw', label: 'Black & White', swatch: ['#000000', '#FFFFFF'], tokens: {
    '--t-bg': '#000000', '--t-panel': '#0D0D0D', '--t-raised': '#1A1A1A', '--t-border': '#2A2A2A', '--t-control-border': '#3A3A3A', '--t-disabled': '#6B6B6B',
    '--t-text': '#FFFFFF', '--t-muted': '#A3A3A3', '--t-accent': '#FFFFFF', '--t-accent-hover': '#E5E5E5', '--t-accent-press': '#CFCFCF',
    '--t-ring': '#FFFFFF', '--t-accent-fg': '#000000', '--t-accent-fg-sm': '#000000', '--t-grid': 'rgba(255,255,255,0.06)', '--t-crosshair': 'rgba(255,255,255,0.6)',
  } },
  { id: 'navypink', label: 'Navy & Pink', swatch: ['#0F1B3D', '#FF3D8B'], tokens: {
    '--t-bg': '#0F1B3D', '--t-panel': '#162651', '--t-raised': '#1E3166', '--t-border': '#2A3B6E', '--t-control-border': '#3A4C82', '--t-disabled': '#6B7AA6',
    '--t-text': '#FFFFFF', '--t-muted': '#B8C2E0', '--t-accent': '#FF3D8B', '--t-accent-hover': '#FF5C9E', '--t-accent-press': '#E52F79',
    '--t-ring': '#FF3D8B', '--t-accent-fg': '#FFFFFF', '--t-accent-fg-sm': '#FFFFFF', '--t-grid': 'rgba(255,255,255,0.06)', '--t-crosshair': 'rgba(255,255,255,0.6)',
  } },
];
export const DEFAULT_THEME = 'royal';
export const PICKER_THEMES = THEME_PRESETS.map(t => t.id);
export const isPreset = (id: string | null | undefined) => !!id && PICKER_THEMES.includes(id);

export function themeCss(): string {
  const presets = THEME_PRESETS.map(p => `:root[data-theme="${p.id}"],[data-theme="${p.id}"]{--pp-bg:var(--t-bg);--pp-text:var(--t-text);--pp-muted:var(--t-muted);${Object.entries(p.tokens).map(([k, v]) => `${k}:${v}`).join(';')}}`).join('\n');
  const sel = (s: string) => PICKER_THEMES.map(id => `[data-theme="${id}"] ${s}`).join(',');
  return `${presets}
${PICKER_THEMES.map(id => `[data-theme="${id}"]`).join(',')}{--background:var(--t-bg);--foreground:var(--t-text);--card:var(--t-panel);--card-foreground:var(--t-text);--popover:var(--t-panel);--popover-foreground:var(--t-text);--primary:var(--t-accent);--primary-foreground:var(--t-accent-fg);--secondary:var(--t-raised);--secondary-foreground:var(--t-text);--muted:var(--t-raised);--muted-foreground:var(--t-muted);--accent:var(--t-raised);--accent-foreground:var(--t-text);--border:var(--t-border);--input:var(--t-border);--ring:var(--t-ring)}
${sel('[role="menuitem"][data-highlighted]')}{background:var(--t-accent);color:var(--t-accent-fg)}
${sel('[role="menuitemradio"][data-state="checked"]')}{color:var(--t-accent)}
${sel('[role="switch"][data-state="checked"]')}{background:var(--t-accent)}
[data-theme="royal"] .heatmap-surface{--flow-up:oklch(.78 .16 160);--flow-down:oklch(.72 .19 25);--fp-text:oklch(1 0 0);--flow-text:oklch(1 0 0);--flow-shadow:#050b18}`;
}

/** Inline pre-paint script: applies the saved preset to <html> before the first frame. */
export const themeBootScript = (key: string) => `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(key)})||'null'),t=s&&s.theme;document.documentElement.setAttribute('data-theme',${JSON.stringify(PICKER_THEMES)}.indexOf(t)>=0?t:${JSON.stringify(DEFAULT_THEME)})}catch(e){}`;
export const readSavedTheme = (key: string) => { try { const t = JSON.parse(localStorage.getItem(key) ?? 'null')?.theme; return isPreset(t) ? t : DEFAULT_THEME; } catch { return DEFAULT_THEME; } };
export const applyTheme = (id: string) => { if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', isPreset(id) ? id : DEFAULT_THEME); };
