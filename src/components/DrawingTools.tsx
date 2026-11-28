import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MousePointer2, Slash, Minus, MoveRight, Square, Rows3, Type, Ruler, TrendingUp, TrendingDown, Eraser, Magnet, Eye, EyeOff, Lock, LockOpen, Trash2, PencilRuler, X } from 'lucide-react';
import type { ProfileChart } from '@/components/VolumeProfile';
import type { PriceSpec } from '@/lib/market-data';
import { DrawingPrimitive, type Handle } from '@/lib/drawing-primitive';
import { DRAW_COLORS, ONE_POINT, defaultPosition, loadDrawings, loadPrefs, saveDrawings, savePrefs, shiftPoint, type DrawKind, type DrawPrefs, type Drawing, type Pt, type ToolId } from '@/lib/drawing-data';

type ToolDef = { id: ToolId; label: string; icon: ReactNode };
const GROUPS: ToolDef[][] = [
  [{ id: 'cursor', label: 'Cursor', icon: <MousePointer2 /> }],
  [{ id: 'trend', label: 'Trend line', icon: <Slash /> }, { id: 'hray', label: 'Horizontal ray', icon: <MoveRight /> }, { id: 'hline', label: 'Horizontal line', icon: <Minus /> }],
  [{ id: 'rect', label: 'Rectangle zone', icon: <Square /> }, { id: 'fib', label: 'Fib retracement', icon: <Rows3 /> }],
  [{ id: 'long', label: 'Long position', icon: <TrendingUp /> }, { id: 'short', label: 'Short position', icon: <TrendingDown /> }],
  [{ id: 'text', label: 'Text note', icon: <Type /> }, { id: 'measure', label: 'Measure', icon: <Ruler /> }, { id: 'eraser', label: 'Eraser', icon: <Eraser /> }],
];
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function DrawingTools({ chartRef, hostRef, symbol, minutes, spec, mobile, revision }: { chartRef: MutableRefObject<ProfileChart | null>; hostRef: MutableRefObject<HTMLDivElement | null>; symbol: string; minutes: number; spec: PriceSpec; mobile: boolean; revision: number }) {
  const [tool, setToolState] = useState<ToolId>('cursor');
  const [prefs, setPrefsState] = useState<DrawPrefs>({ magnet: false, hidden: false, locked: false });
  const [selected, setSelected] = useState<Drawing | null>(null);
  const [count, setCount] = useState(0);
  const [textEdit, setTextEdit] = useState<{ x: number; y: number; pt: Pt; id?: string; value: string } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const toolRef = useRef(tool); toolRef.current = tool;
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const primRef = useRef<DrawingPrimitive | null>(null);
  const listRef = useRef<Drawing[]>([]);

  useEffect(() => { setPrefsState(loadPrefs()); }, []);
  const setPrefs = (p: DrawPrefs) => { setPrefsState(p); savePrefs(p); const prim = primRef.current; if (prim) { prim.hidden = p.hidden; if (p.hidden || p.locked) { prim.selected = null; setSelected(null); } prim.update(); } };
  const setTool = (t: ToolId) => {
    setToolState(t); toolRef.current = t;
    const prim = primRef.current; if (prim) { prim.draft = null; if (t !== 'cursor') { prim.selected = null; setSelected(null); } prim.update(); }
    const host = hostRef.current; if (host) host.style.cursor = t === 'cursor' ? '' : t === 'eraser' ? 'not-allowed' : 'crosshair';
    chartRef.current?.chart.applyOptions({ handleScroll: { pressedMouseMove: t === 'cursor' || t === 'eraser', horzTouchDrag: t === 'cursor' || t === 'eraser', vertTouchDrag: false } });
  };
  const commit = (list: Drawing[]) => {
    listRef.current = list; setCount(list.length); saveDrawings(symbol, list);
    const prim = primRef.current; if (prim) { prim.drawings = list; setSelected(list.find(d => d.id === prim.selected) ?? null); prim.update(); }
  };
  const select = (id: string | null) => { const prim = primRef.current; if (!prim) return; prim.selected = id; setSelected(listRef.current.find(d => d.id === id) ?? null); prim.update(); };
  const remove = (id: string) => { if (primRef.current?.selected === id) select(null); commit(listRef.current.filter(d => d.id !== id)); };

  useEffect(() => {
    const api = chartRef.current, host = hostRef.current;
    if (!api || !host) return;
    setPortal(host.parentElement);
    const prim = new DrawingPrimitive(api, minutes, spec, api.colors, mobile);
    prim.hidden = prefsRef.current.hidden;
    const list = loadDrawings(symbol); listRef.current = list; prim.drawings = list; setCount(list.length); setSelected(null);
    api.series.attachPrimitive(prim); api.probes.add(prim); primRef.current = prim;
    setTool(toolRef.current);
    let pressed: { x: number; y: number } | null = null, waiting = false, consumed = false;
    let drag: { id: string; handle: Handle; start: Pt; startL: number; orig: Drawing } | null = null;
    const local = (e: { clientX: number; clientY: number }) => { const r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const inPane = (x: number, y: number) => { const s = api.chart.paneSize(); return x >= 0 && y >= 0 && x <= s.width && y <= s.height; };
    const point = (x: number, y: number) => prim.toPoint(x, y, prefsRef.current.magnet);
    const finishDraft = () => {
      const d = prim.draft; prim.draft = null; pressed = null; waiting = false;
      if (!d || !d.b) return;
      let out: Drawing = d;
      if (d.kind === 'long' || d.kind === 'short') { const pos = defaultPosition(d.kind, d.a.p, d.b.p); out = { ...d, b: { t: d.b.t === d.a.t ? d.a.t + prim.step * 20 : d.b.t, p: pos.target }, c: { t: d.b.t, p: pos.stop } }; }
      commit([...listRef.current, out]); setTool('cursor'); select(out.id);
    };
    const consume = (e: Event) => { e.preventDefault(); e.stopPropagation(); consumed = true; };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const { x, y } = local(e); if (!inPane(x, y)) return;
      const t = toolRef.current;
      if (t === 'cursor') {
        if (prim.measure && !pressed) { prim.measure = null; prim.update(); }
        if (prefsRef.current.locked || prefsRef.current.hidden) return;
        const hit = prim.hit(x, y);
        if (!hit) { if (prim.selected) select(null); return; }
        consume(e); select(hit.id);
        const orig = listRef.current.find(d => d.id === hit.id), start = point(x, y), l = prim.logicalAt(x);
        if (orig && start && l !== null) drag = { id: hit.id, handle: hit.handle, start, startL: l, orig };
        return;
      }
      if (t === 'eraser') { const hit = prefsRef.current.hidden ? null : prim.hit(x, y); if (hit) { consume(e); remove(hit.id); } return; }
      consume(e);
      const pt = point(x, y); if (!pt) return;
      if (t === 'measure') {
        if (waiting && prim.measure) { prim.measure = { ...prim.measure, b: pt }; waiting = false; pressed = null; setTool('cursor'); prim.update(); return; }
        prim.measure = { a: pt, b: pt }; pressed = { x, y }; prim.update(); return;
      }
      if (waiting && prim.draft) { prim.draft = { ...prim.draft, b: pt }; finishDraft(); return; }
      const kind = t as DrawKind;
      if (kind === 'text') { const r = host.getBoundingClientRect(), pr = host.parentElement?.getBoundingClientRect(); setTextEdit({ x: x + r.left - (pr?.left ?? 0), y: y + r.top - (pr?.top ?? 0), pt, value: '' }); setTool('cursor'); return; }
      const d: Drawing = { id: newId(), kind, a: pt, color: DRAW_COLORS[0] };
      if (ONE_POINT.includes(kind)) { commit([...listRef.current, d]); setTool('cursor'); select(d.id); return; }
      prim.draft = { ...d, b: pt }; pressed = { x, y }; prim.update();
    };
    const move = (e: PointerEvent) => {
      const { x, y } = local(e);
      if (drag) {
        const pt = point(x, y), l = prim.logicalAt(x); if (!pt || l === null) return;
        const o = drag.orig, times = prim.times(); let next: Drawing;
        if (drag.handle === 'body') {
          const dl = Math.round(l - drag.startL), dp = pt.p - drag.start.p, sh = (p: Pt) => shiftPoint(times, prim.step, p, dl, dp);
          next = { ...o, a: sh(o.a), ...(o.b ? { b: sh(o.b) } : {}), ...(o.c ? { c: sh(o.c) } : {}) };
        } else if (drag.handle === 'c') next = { ...o, ...(o.c ? { c: { ...o.c, p: pt.p } } : {}) };
        else next = { ...o, [drag.handle]: pt };
        listRef.current = listRef.current.map(d => d.id === next.id ? next : d); prim.drawings = listRef.current; prim.update(); return;
      }
      if (prim.draft && (pressed || waiting)) { const pt = point(x, y); if (pt) { prim.draft = { ...prim.draft, b: pt }; prim.update(); } return; }
      if (prim.measure && (pressed || waiting)) { const pt = point(x, y); if (pt) { prim.measure = { ...prim.measure, b: pt }; prim.update(); } return; }
      if (toolRef.current === 'cursor' && e.pointerType === 'mouse' && !prefsRef.current.locked) { const hit = inPane(x, y) ? prim.hit(x, y) : null; host.style.cursor = hit ? (hit.handle === 'body' ? 'move' : 'pointer') : ''; }
    };
    const up = (e: PointerEvent) => {
      consumed = false;
      if (drag) { drag = null; commit(listRef.current); return; }
      if (!pressed) return;
      const { x, y } = local(e), moved = Math.hypot(x - pressed.x, y - pressed.y) > 5; pressed = null;
      if (prim.draft) { if (moved) finishDraft(); else waiting = true; return; }
      if (prim.measure) { if (moved) { setTool('cursor'); waiting = false; } else waiting = true; }
    };
    const block = (e: Event) => { if (consumed || drag || (toolRef.current !== 'cursor' && toolRef.current !== 'eraser')) { const t = e as MouseEvent; if ('clientX' in t && !inPane(local(t).x, local(t).y)) return; e.stopPropagation(); } };
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === 'Escape') { prim.draft = null; prim.measure = null; pressed = null; waiting = false; drag = null; select(null); setTool('cursor'); prim.update(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && prim.selected) { e.preventDefault(); remove(prim.selected); }
    };
    host.addEventListener('pointerdown', down, true);
    host.addEventListener('mousedown', block, true);
    host.addEventListener('touchstart', block, true);
    host.addEventListener('pointermove', move);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key);
    return () => {
      host.removeEventListener('pointerdown', down, true); host.removeEventListener('mousedown', block, true); host.removeEventListener('touchstart', block, true);
      host.removeEventListener('pointermove', move); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('keydown', key);
      api.probes.delete(prim); if (!api.disposed) api.series.detachPrimitive(prim);
      host.style.cursor = ''; if (primRef.current === prim) primRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, symbol, minutes, spec.precision, spec.minMove, mobile]);

  const saveText = () => {
    const edit = textEdit; setTextEdit(null); if (!edit) return;
    const value = edit.value.trim();
    if (edit.id) { if (!value) remove(edit.id); else commit(listRef.current.map(d => d.id === edit.id ? { ...d, text: value } : d)); return; }
    if (!value) return;
    const d: Drawing = { id: newId(), kind: 'text', a: edit.pt, color: DRAW_COLORS[4], text: value };
    commit([...listRef.current, d]); select(d.id);
  };
  const editText = (d: Drawing) => {
    const prim = primRef.current, host = hostRef.current; if (!prim || !host) return;
    const x = prim.x(d.a.t) ?? 20, y = prim.y(d.a.p) ?? 20;
    setTextEdit({ x: x + host.offsetLeft, y: y + host.offsetTop, pt: d.a, id: d.id, value: d.text ?? '' });
  };
  const clearAll = () => { if (!listRef.current.length) return; if (window.confirm(`Remove all ${listRef.current.length} drawings on ${symbol}?`)) { select(null); commit([]); } };

  const btn = (active: boolean) => `grid size-8 shrink-0 place-items-center rounded-md transition-colors [&_svg]:size-[18px] ${active ? 'bg-t-border text-t-text' : 'text-t-muted hover:bg-t-border/60 hover:text-t-text'}`;
  const rail = <div role="toolbar" aria-label="Drawing tools" aria-orientation="vertical" data-testid="drawing-toolbar" className={mobile ? 'flex max-h-[calc(100%-6rem)] flex-col items-center gap-0.5 overflow-y-auto rounded-md border border-t-border bg-t-panel/95 p-1' : 'flex w-10 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-t-border bg-t-panel py-1.5'}>
    {GROUPS.map((group, i) => <div key={i} className={`flex flex-col items-center gap-0.5 ${i ? 'border-t border-t-border pt-1' : ''}`}>
      {group.map(t => <button key={t.id} type="button" title={t.label} aria-label={t.label} aria-pressed={tool === t.id} className={btn(tool === t.id)} onClick={() => setTool(tool === t.id && t.id !== 'cursor' ? 'cursor' : t.id)}>{t.icon}</button>)}
    </div>)}
    <div className="mt-auto flex flex-col items-center gap-0.5 border-t border-t-border pt-1">
      <button type="button" title="Magnet: snap to candle open, high, low, close" aria-label="Magnet" aria-pressed={prefs.magnet} className={btn(prefs.magnet)} onClick={() => setPrefs({ ...prefs, magnet: !prefs.magnet })}><Magnet /></button>
      <button type="button" title={prefs.locked ? 'Unlock drawings' : 'Lock all drawings'} aria-label={prefs.locked ? 'Unlock drawings' : 'Lock all drawings'} aria-pressed={prefs.locked} className={btn(prefs.locked)} onClick={() => setPrefs({ ...prefs, locked: !prefs.locked })}>{prefs.locked ? <Lock /> : <LockOpen />}</button>
      <button type="button" title={prefs.hidden ? 'Show drawings' : 'Hide drawings'} aria-label={prefs.hidden ? 'Show drawings' : 'Hide drawings'} aria-pressed={prefs.hidden} className={btn(prefs.hidden)} onClick={() => setPrefs({ ...prefs, hidden: !prefs.hidden })}>{prefs.hidden ? <EyeOff /> : <Eye />}</button>
      <button type="button" title="Remove all drawings" aria-label="Remove all drawings" disabled={!count} className={`${btn(false)} disabled:opacity-40`} onClick={clearAll}><Trash2 /></button>
    </div>
  </div>;

  const overlays = portal && createPortal(<>
    {mobile && <div className="absolute left-1.5 top-14 z-20 flex max-h-[calc(100%-4rem)] flex-col items-start gap-1">
      <button type="button" aria-label={mobileOpen ? 'Close drawing tools' : 'Drawing tools'} aria-expanded={mobileOpen} className="grid size-10 place-items-center rounded-md border border-t-border bg-t-panel/90 text-t-text [&_svg]:size-5" onClick={() => setMobileOpen(o => !o)}>{mobileOpen ? <X /> : <PencilRuler />}</button>
      {mobileOpen && rail}
    </div>}
    {selected && !textEdit && <div role="toolbar" aria-label="Selected drawing" className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-md border border-t-border bg-t-panel/95 p-1 shadow-lg">
      {selected.kind !== 'long' && selected.kind !== 'short' && DRAW_COLORS.map(c => <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={selected.color === c} className={`size-5 rounded-full border-2 ${selected.color === c ? 'border-t-text' : 'border-transparent'}`} style={{ background: c }} onClick={() => commit(listRef.current.map(d => d.id === selected.id ? { ...d, color: c } : d))} />)}
      {selected.kind === 'text' && <button type="button" className="rounded px-2 py-0.5 text-xs text-t-text hover:bg-t-border" onClick={() => editText(selected)}>Edit text</button>}
      <button type="button" aria-label="Delete drawing" title="Delete (Del)" className="grid size-6 place-items-center rounded text-t-muted hover:bg-t-border hover:text-t-text [&_svg]:size-4" onClick={() => remove(selected.id)}><Trash2 /></button>
    </div>}
    {textEdit && <input autoFocus aria-label="Note text" placeholder="Type a note, Enter to save" value={textEdit.value} maxLength={80}
      onChange={e => setTextEdit({ ...textEdit, value: e.target.value })}
      onKeyDown={e => { if (e.key === 'Enter') saveText(); else if (e.key === 'Escape') setTextEdit(null); e.stopPropagation(); }}
      onBlur={saveText}
      className="absolute z-30 h-7 w-52 rounded border border-t-border bg-t-panel px-2 text-xs text-t-text outline-hidden focus:border-t-text"
      style={{ left: textEdit.x, top: textEdit.y - 28 }} />}
  </>, portal);

  return <>{!mobile && rail}{overlays}</>;
}
