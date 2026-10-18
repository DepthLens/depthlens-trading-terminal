// Browser APIs are only accessed when callers start a stream from an effect.
export function marketStream(url: string, onMessage: (data: any) => void, onStatus?: (live: boolean) => void, idleMs?: number) {
  let socket: WebSocket | undefined;
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let delay = 1000;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const armIdle = () => {
    clearTimeout(idle);
    if (idleMs) idle = setTimeout(() => { console.info('[DepthLens] Stream idle, reconnecting', url); socket?.close(); }, idleMs);
  };
  const connect = () => {
    if (stopped) return;
    console.info('[DepthLens] Connecting', url);
    socket = new WebSocket(url);
    armIdle();
    socket.onopen = () => { console.info('[DepthLens] Connected', url); delay = 1000; onStatus?.(true); };
    socket.onmessage = event => {
      if (stopped) return;
      let data: unknown;
      try { data = JSON.parse(event.data); } catch { return; }
      armIdle();
      onMessage(data);
    };
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      if (stopped) return;
      clearTimeout(idle);
      console.info('[DepthLens] Disconnected, retrying', url);
      onStatus?.(false);
      retry = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 15000);
    };
  };
  connect();
  return () => { stopped = true; clearTimeout(retry); clearTimeout(idle); console.info('[DepthLens] Stopped', url); if (socket) { socket.onmessage = null; socket.onopen = null; socket.onerror = null; socket.onclose = null; socket.close(); } };
}
