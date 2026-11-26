import { describe, expect, it } from 'vitest';
import { detectWalls, restoreWallSettings, DEFAULT_WALLS, type WallSettings } from '@/lib/heatmap-walls';
import { ROWS, type Column } from '@/lib/heatmap-data';

// One column per second, bucket 1, background liquidity 1 on rows 80..120; walls add a big size on one row.
const BUCKET = 1;
function col(t: number, price: number, walls: Record<number, number> = {}, low = price, high = price): Column {
  const origin = 100 - ROWS / 2, data = new Float32Array(ROWS);
  for (let i = 80; i <= 120; i++) data[i - origin] = 1;
  for (const [i, v] of Object.entries(walls)) data[Number(i) - origin] = v;
  return { time: t * 1000, origin, data, trades: new Map(), price, gap: false, pricePath: [low, high, price] };
}
const run = (cols: Column[], s: WallSettings = DEFAULT_WALLS) => detectWalls(cols, BUCKET, 80, 120, s, cols.at(-1)!.time).walls;
const seconds = (n: number, f: (t: number) => Column) => Array.from({ length: n }, (_, t) => f(t));

describe('heatmap wall lines', () => {
  it('turns a large order resting for two minutes into a bid wall with its size and age', () => {
    const walls = run(seconds(200, t => col(t, 100.5, { 90: 500 })));
    expect(walls).toHaveLength(1);
    expect(walls[0]).toMatchObject({ side: 'bid', index: 90, status: 'active', size: 500, start: 0 });
  });
  it('ignores flickering orders that never stay two minutes', () => {
    expect(run(seconds(300, t => col(t, 100.5, t % 60 < 50 ? { 110: 500 } : {})))).toHaveLength(0);
    expect(run(seconds(100, t => col(t, 100.5, { 110: 500 })))).toHaveLength(0);
  });
  it('honours the 30 second minimum time setting', () => {
    expect(run(seconds(40, t => col(t, 100.5, { 110: 500 })), { ...DEFAULT_WALLS, minMs: 30000 })[0]).toMatchObject({ side: 'ask', status: 'active' });
  });
  it('marks a wall Pulled when it disappears before price reaches it', () => {
    const walls = run(seconds(220, t => col(t, 100.5, t < 150 ? { 110: 500 } : {})));
    expect(walls[0]).toMatchObject({ side: 'ask', status: 'pulled' });
  });
  it('marks a wall Broken when price trades through it', () => {
    const walls = run(seconds(200, t => t < 150 ? col(t, 100.5, { 95: 500 }) : col(t, 94.5, { 95: 500 }, 94.2, 94.8)));
    expect(walls[0]).toMatchObject({ side: 'bid', status: 'broken' });
  });
  it('marks a wall Held when price touches it and moves away without trading through', () => {
    const walls = run(seconds(220, t => t < 150 ? col(t, 100.5, { 95: 500 }) : t < 160 ? col(t, 95.8, { 95: 500 }, 95.5, 96) : col(t, 100.5, { 95: 500 })));
    expect(walls[0]).toMatchObject({ side: 'bid', status: 'held' });
  });
  it('restores saved settings and falls back to defaults', () => {
    expect(restoreWallSettings(JSON.stringify({ on: false, percentile: 2, minMs: 300000 }))).toMatchObject({ on: false, percentile: 2, minMs: 300000, fadeMs: 3600000 });
    expect(restoreWallSettings('nonsense')).toEqual(DEFAULT_WALLS);
    expect(restoreWallSettings(JSON.stringify({ percentile: 7 })).percentile).toBe(1);
  });
});
