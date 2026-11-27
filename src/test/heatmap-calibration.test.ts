import { beforeEach, expect, it, vi } from 'vitest';

const persistence=vi.hoisted(()=>({load:vi.fn(),save:vi.fn().mockResolvedValue(undefined)}));
vi.mock('@/lib/heatmap-persist',()=>({loadHeatmapBuffer:persistence.load,saveHeatmapBuffer:persistence.save}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();});

it('restores calibrated two-USDT rows even after the sixty-minute history expires',async()=>{
  persistence.load.mockResolvedValue({savedAt:Date.now()-61*60000,bucket:2,calibrated:true,depthSpan:300,columns:[]});
  const {getHeatmapEntry,calibrateHeatmap}=await import('@/lib/heatmap-store');
  const entry=getHeatmapEntry('poll','BTCUSDT',73000);await vi.waitFor(()=>expect(entry.restored).toBe(true));
  expect(entry.buffer.bucket).toBe(2);expect(entry.depthSpan).toBe(300);expect(entry.calibrated).toBe(true);
  calibrateHeatmap('poll','BTCUSDT',entry,900,.1);expect(entry.buffer.bucket).toBe(2);expect(entry.buffer.columns).toHaveLength(0);
});

it('saves first synced depth calibration once per source and symbol',async()=>{
  persistence.load.mockResolvedValue(null);
  const {getHeatmapEntry,calibrateHeatmap}=await import('@/lib/heatmap-store');
  const entry=getHeatmapEntry('poll','BTCUSDT',68000);await vi.waitFor(()=>expect(entry.restored).toBe(true));
  calibrateHeatmap('poll','BTCUSDT',entry,300,.1);calibrateHeatmap('poll','BTCUSDT',entry,600,.1);
  expect(persistence.save).toHaveBeenCalledTimes(1);expect(persistence.save).toHaveBeenCalledWith('poll:BTCUSDT',2,[],true,300);
});

it('starts BTCUSDT on thin two-USDT rows before a snapshot arrives', async () => {
  persistence.load.mockResolvedValue(null);
  const { getHeatmapEntry } = await import('@/lib/heatmap-store');
  expect(getHeatmapEntry('poll', 'BTCUSDT', 62000).buffer.bucket).toBe(2);
});

it('replaces corrupted BTC browser calibration rather than restoring thousand-dollar rows', async () => {
  persistence.load.mockResolvedValue({ savedAt: Date.now(), bucket: 1000, calibrated: true, depthSpan: 11000, columns: [] });
  const { getHeatmapEntry } = await import('@/lib/heatmap-store');
  const entry = getHeatmapEntry('poll', 'BTCUSDT', 62000);
  await vi.waitFor(() => expect(entry.restored).toBe(true));
  expect(entry.buffer.bucket).toBe(2);
  expect(entry.calibrated).toBe(false);
  expect(persistence.save).toHaveBeenCalledWith('poll:BTCUSDT', 2, [], false, 0);
});

it('caps BTC depth at 500 USDT and keeps thin rows when the book contains remote orders', async () => {
  persistence.load.mockResolvedValue(null);
  const { getHeatmapEntry, calibrateHeatmap } = await import('@/lib/heatmap-store');
  const entry = getHeatmapEntry('poll', 'BTCUSDT', 62000);
  await vi.waitFor(() => expect(entry.restored).toBe(true));
  calibrateHeatmap('poll', 'BTCUSDT', entry, 11000, .1);
  expect(entry.depthSpan).toBe(500);
  expect(entry.buffer.bucket).toBe(2);
});

it('keeps valid recent BTC book history on restore', async () => {
  const time = Date.now() - 1000;
  const data = new Float32Array(1024); data[512] = 62000;
  persistence.load.mockResolvedValue({ savedAt: Date.now(), bucket: 2, calibrated: true, depthSpan: 300, columns: [{ time, origin: 30488, data, trades: new Map(), price: 62000, gap: false }] });
  const { getHeatmapEntry } = await import('@/lib/heatmap-store');
  const entry = getHeatmapEntry('poll', 'BTCUSDT', 62000);
  await vi.waitFor(() => expect(entry.restored).toBe(true));
  expect(entry.buffer.columns.find(col => col.time === time)?.data[512]).toBe(62000);
  expect(entry.buffer.bucket).toBe(2);
  expect(persistence.save).not.toHaveBeenCalled();
});

it('does not change other symbols calibration', async () => {
  persistence.load.mockResolvedValue({ savedAt: Date.now(), bucket: 5, calibrated: true, depthSpan: 750, columns: [] });
  const { getHeatmapEntry, heatDepthSpan } = await import('@/lib/heatmap-store');
  const entry = getHeatmapEntry('poll', 'ETHUSDT', 3000);
  await vi.waitFor(() => expect(entry.restored).toBe(true));
  expect(entry.buffer.bucket).toBe(5);
  expect(entry.depthSpan).toBe(750);
  expect(heatDepthSpan('ETHUSDT', 750)).toBe(750);
});