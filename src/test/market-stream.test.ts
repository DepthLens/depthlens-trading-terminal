import { afterEach, describe, expect, it, vi } from 'vitest';
import { marketStream } from '@/lib/market-stream';
class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  close = vi.fn(() => this.onclose?.());
  constructor(public url: string) { FakeSocket.instances.push(this); }
}
afterEach(() => { vi.unstubAllGlobals();vi.useRealTimers();FakeSocket.instances=[]; });
describe('Market connections', () => {
  it('reconnects a dropped socket and stops reconnecting on cleanup', () => {
    vi.useFakeTimers();vi.stubGlobal('WebSocket', FakeSocket);
    const receive=vi.fn();const stop=marketStream('wss://fstream.binance.com/ws/btcusdt@aggTrade',receive);
    const socket=FakeSocket.instances[0];if(!socket)throw new Error('No socket');
    socket.onmessage?.({data:'{"e":"aggTrade","p":"100"}'});expect(receive).toHaveBeenCalledWith({e:'aggTrade',p:'100'});
    socket.onclose?.();vi.advanceTimersByTime(1000);expect(FakeSocket.instances).toHaveLength(2);
    stop();vi.advanceTimersByTime(60000);expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances[1]?.close).toHaveBeenCalledOnce();
  });
});
