import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { connectionManager, marketStream } from '@/lib/market-stream';
class FakeSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  static instances: FakeSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((e: {code: number}) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: {data: string}) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = 2; });
  constructor(public url: string) { FakeSocket.instances.push(this); }
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('WebSocket', FakeSocket); vi.spyOn(Math, 'random').mockReturnValue(0); });
afterEach(() => { for (const socket of FakeSocket.instances) socket.readyState = 3; connectionManager.dispose(); connectionManager.snapshot(); FakeSocket.instances = []; vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
it('serializes replacements until the old close handshake completes and removes every listener', () => {
  const oldStop = marketStream('wss://old', vi.fn());
  const old = FakeSocket.instances[0]; if (!old) throw new Error();
  const stop = marketStream('wss://new', vi.fn());
  expect(old.close).toHaveBeenCalledOnce();
  expect([old.onopen, old.onmessage, old.onerror, old.onclose]).toEqual([null, null, null, null]);
  expect(FakeSocket.instances).toHaveLength(1);
  oldStop(); old.readyState = 3; vi.advanceTimersByTime(25);
  expect(FakeSocket.instances).toHaveLength(2);
  stop(); vi.advanceTimersByTime(60000); expect(FakeSocket.instances).toHaveLength(2);
});
it('waits 20 seconds since ANY frame, including heartbeat, and cleans up retries', () => {
  const failure = vi.fn(); const stop = marketStream('wss://idle', vi.fn(), undefined, { onFailure: failure });
  const socket = FakeSocket.instances[0]; if (!socket) throw new Error();
  vi.advanceTimersByTime(19999); expect(socket.close).not.toHaveBeenCalled();
  socket.onmessage?.({data:'heartbeat'});
  vi.advanceTimersByTime(19999); expect(socket.close).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(failure).toHaveBeenCalledWith(1);
  socket.readyState = 3; vi.advanceTimersByTime(999); expect(FakeSocket.instances).toHaveLength(1);
  vi.advanceTimersByTime(1); expect(FakeSocket.instances).toHaveLength(2);
  stop(); vi.advanceTimersByTime(120000); expect(FakeSocket.instances).toHaveLength(2);
});
it('backs off 1, 2, 4 seconds up to 30 seconds, resetting only on a message', () => {
  const stop = marketStream('wss://retry', vi.fn());
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    const socket = FakeSocket.instances.at(-1); if (!socket) throw new Error();
    socket.onerror?.(); socket.readyState = 3;
    const count = FakeSocket.instances.length;
    vi.advanceTimersByTime(delay - 1); expect(FakeSocket.instances).toHaveLength(count);
    vi.advanceTimersByTime(1); expect(FakeSocket.instances).toHaveLength(count + 1);
  }
  FakeSocket.instances.at(-1)?.onmessage?.({data:'{}'});
  expect(connectionManager.snapshot().failures).toBe(0); stop();
});
it('never exceeds three sockets across the two exchanges and purposes', () => {
  const stops = [marketStream('wss://a', vi.fn()), marketStream('wss://b', vi.fn(), undefined, {purpose:'markets'}), marketStream('wss://c', vi.fn(), undefined, {exchange:'bybit'}), marketStream('wss://d', vi.fn(), undefined, {exchange:'bybit',purpose:'markets'})];
  vi.advanceTimersByTime(100); expect(FakeSocket.instances).toHaveLength(3);
  expect(connectionManager.snapshot().openSockets).toBe(3); stops.forEach(stop => stop());
});
