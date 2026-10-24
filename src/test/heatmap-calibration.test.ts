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