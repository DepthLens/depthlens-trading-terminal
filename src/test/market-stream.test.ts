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
it('cleans up StrictMode-style mounting and hot reload without stale delivery or retries', () => {
  const receive = vi.fn();
  const firstStop = marketStream('wss://first', receive);
  const first = FakeSocket.instances[0]; if (!first) throw new Error();
  const stale = first.onmessage;
  firstStop(); const secondStop = marketStream('wss://second', receive);
  stale?.({data:'{"price":100}'}); expect(receive).not.toHaveBeenCalled();
  first.readyState = 3; vi.advanceTimersByTime(25); expect(FakeSocket.instances).toHaveLength(2);
  connectionManager.dispose(); secondStop();
  vi.advanceTimersByTime(120000); expect(FakeSocket.instances).toHaveLength(2);
});
it('adds a small random delay to exponential retries', () => {
  vi.mocked(Math.random).mockReturnValue(0.5);
  const stop = marketStream('wss://jitter', vi.fn());
  const socket = FakeSocket.instances[0]; if (!socket) throw new Error();
  socket.onerror?.(); socket.readyState = 3;
  vi.advanceTimersByTime(1124); expect(FakeSocket.instances).toHaveLength(1);
  vi.advanceTimersByTime(1); expect(FakeSocket.instances).toHaveLength(2); stop();
});
it('multiplexes book subscriptions onto existing sockets without opening an extra socket', () => {
  const receive = vi.fn(), connection = vi.fn();
  const unsubscribe = connectionManager.subscribe('bybit', 'orderbook.200.BTCUSDT', receive, connection);
  expect(FakeSocket.instances).toHaveLength(0);
  const stop = marketStream('wss://bybit', vi.fn(), undefined, { exchange: 'bybit' });
  const socket = FakeSocket.instances[0]; if (!socket) throw new Error();
  socket.readyState = 1; socket.onopen?.();
  expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ op: 'subscribe', args: ['orderbook.200.BTCUSDT'] }));
  const data = { topic: 'orderbook.200.BTCUSDT', type: 'snapshot', data: { b: [], a: [] } };
  socket.onmessage?.({ data: JSON.stringify(data) }); expect(receive).toHaveBeenCalledWith(data);
  unsubscribe(); expect(socket.send).toHaveBeenLastCalledWith(JSON.stringify({ op: 'unsubscribe', args: ['orderbook.200.BTCUSDT'] }));
  socket.onmessage?.({ data: JSON.stringify(data) }); expect(receive).toHaveBeenCalledTimes(1);
  expect(FakeSocket.instances).toHaveLength(1); stop();
});
it('replays Binance depth subscription after reconnect and uses SUBSCRIBE/UNSUBSCRIBE', () => {
  const connection = vi.fn();
  const stop = marketStream('wss://binance', vi.fn());
  const socket = FakeSocket.instances[0]; if (!socket) throw new Error(); socket.readyState = 1; socket.onopen?.();
  const unsubscribe = connectionManager.subscribe('binance', 'btcusdt@depth@100ms', vi.fn(), connection);
  expect(JSON.parse(socket.send.mock.calls.at(-1)?.[0] ?? '{}')).toMatchObject({ method: 'SUBSCRIBE', params: ['btcusdt@depth@100ms'] });
  socket.onerror?.(); socket.readyState = 3; vi.advanceTimersByTime(1000);
  const next = FakeSocket.instances.at(-1); if (!next) throw new Error(); next.readyState = 1; next.onopen?.();
  expect(JSON.parse(next.send.mock.calls.at(-1)?.[0] ?? '{}')).toMatchObject({ method: 'SUBSCRIBE', params: ['btcusdt@depth@100ms'] });
  expect(connection).toHaveBeenLastCalledWith(true);
  unsubscribe(); expect(JSON.parse(next.send.mock.calls.at(-1)?.[0] ?? '{}')).toMatchObject({ method: 'UNSUBSCRIBE' }); stop();
});
