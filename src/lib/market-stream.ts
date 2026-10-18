// Browser APIs are only accessed when callers start a stream from an effect.
export function marketStream(url: string, onMessage: (data: any) => void, onStatus?: (live: boolean) => void) {
  let socket: WebSocket | undefined;
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let delay = 1000;
  const connect = () => {
    if (stopped) return;
    socket = new WebSocket(url);
    socket.onopen = () => { delay = 1000; onStatus?.(true); };
    socket.onmessage = event => {
      if (stopped) return;
      let data: unknown;
      try { data = JSON.parse(event.data); } catch { return; }
      onMessage(data);
    };
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      if (stopped) return;
      onStatus?.(false);
      retry = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 15000);
    };
  };
  connect();
  return () => { stopped = true; clearTimeout(retry); if (socket) { socket.onmessage = null; socket.onopen = null; socket.onerror = null; socket.onclose = null; socket.close(); } };
}
