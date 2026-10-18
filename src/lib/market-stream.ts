export type ConnectionSource = 'binance' | 'bybit';
export type ConnectionSnapshot = { source: string; state: string; openSockets: number; lastError: string; lastMessageAt: number | null; failures: number };
type Options = { exchange?: ConnectionSource; purpose?: 'active' | 'markets'; subscription?: object; onFailure?: (failures: number) => void };
type Entry = { key: string; url: string; socket?: WebSocket; stopped: boolean; timer?: ReturnType<typeof setTimeout>; idle?: ReturnType<typeof setTimeout>; failures: number; state: string; lastError: string; lastMessageAt: number | null; stop: (reason: string) => void };

// This module is the only WebSocket owner. Retired sockets remain tracked until CLOSED.
class ConnectionManager {
  private entries = new Map<string, Entry>();
  private sockets = new Set<WebSocket>();
  snapshot(exchange: ConnectionSource = 'binance', purpose = 'active'): ConnectionSnapshot {
    this.prune();
    const entry = this.entries.get(`${exchange}:${purpose}`);
    return { source: exchange === 'binance' ? 'Binance' : 'Bybit', state: entry?.state ?? 'Offline', openSockets: this.sockets.size, lastError: entry?.lastError ?? 'None', lastMessageAt: entry?.lastMessageAt ?? null, failures: entry?.failures ?? 0 };
  }
  private prune() { for (const socket of this.sockets) if (socket.readyState === WebSocket.CLOSED) this.sockets.delete(socket); }
  connect(url: string, receive: (data: any) => void, status?: (live: boolean) => void, options: Options = {}) {
    const key = `${options.exchange ?? 'binance'}:${options.purpose ?? 'active'}`;
    this.entries.get(key)?.stop('replaced');
    const entry: Entry = { key, url, stopped: false, failures: 0, state: 'Connecting', lastError: 'None', lastMessageAt: null, stop: () => {} };
    this.entries.set(key, entry);
    const close = (reason: string) => {
      clearTimeout(entry.idle);
      const socket = entry.socket;
      delete entry.socket;
      if (!socket) return;
      socket.onopen = null; socket.onmessage = null; socket.onerror = null; socket.onclose = null;
      console.info(`[DepthLens] Socket close ${key}: ${reason}`);
      if (socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) socket.close(1000, reason);
      this.prune();
    };
    const failed = (reason: string) => {
      if (entry.stopped) return;
      close(reason);
      entry.state = 'Reconnecting'; entry.lastError = reason; entry.failures++;
      status?.(false); options.onFailure?.(entry.failures);
      if (!entry.stopped) entry.timer = setTimeout(open, Math.min(1000 * 2 ** (entry.failures - 1), 30000) + Math.floor(Math.random() * 250));
    };
    const idle = () => { clearTimeout(entry.idle); entry.idle = setTimeout(() => failed('20 seconds without messages'), 20000); };
    const open = () => {
      if (entry.stopped || this.entries.get(key) !== entry) return;
      this.prune();
      // Wait for the old close handshake, and never exceed three physical sockets.
      const blocked = [...this.sockets].some(socket => (socket as WebSocket & { depthLensKey?: string }).depthLensKey === key);
      if (blocked || this.sockets.size >= 3) { entry.timer = setTimeout(open, 25); return; }
      entry.state = 'Connecting';
      let socket: WebSocket;
      try { socket = new WebSocket(url); } catch { failed('Socket creation failed'); return; }
      (socket as WebSocket & { depthLensKey?: string }).depthLensKey = key;
      entry.socket = socket; this.sockets.add(socket); idle();
      socket.onopen = () => {
        if (entry.stopped || entry.socket !== socket) return;
        entry.state = 'Open';
        console.info(`[DepthLens] Socket open ${key}: ${url}`);
        if (options.subscription) socket.send(JSON.stringify(options.subscription));
      };
      socket.onmessage = event => {
        if (entry.stopped || entry.socket !== socket) return;
        entry.lastMessageAt = Date.now(); entry.failures = 0; entry.state = 'Live'; idle(); status?.(true);
        // Any frame resets the idle watchdog, even a non-JSON heartbeat.
        let data: unknown; try { data = JSON.parse(event.data); } catch { return; }
        receive(data);
      };
      socket.onerror = () => failed('Connection error');
      socket.onclose = event => failed(`Remote close (${event.code})`);
    };
    entry.stop = reason => {
      if (entry.stopped) return;
      entry.stopped = true; clearTimeout(entry.timer); close(reason); entry.state = 'Closed';
      if (this.entries.get(key) === entry) this.entries.delete(key);
    };
    open();
    return () => entry.stop('effect cleanup');
  }
  dispose() { for (const entry of this.entries.values()) entry.stop('hot reload'); this.entries.clear(); }
}
export const connectionManager: ConnectionManager = import.meta.hot?.data['connectionManager'] ?? new ConnectionManager();
export function marketStream(url: string, onMessage: (data: any) => void, onStatus?: (live: boolean) => void, options: Options = {}) {
  return connectionManager.connect(url, onMessage, onStatus, options);
}
if (import.meta.hot) import.meta.hot.dispose(data => { connectionManager.dispose(); data['connectionManager'] = connectionManager; });
