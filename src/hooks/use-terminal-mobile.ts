import { useEffect, useState } from 'react';

// Phones: narrower than 768px, plus touch phones held in landscape (short screens).
export const TERMINAL_MOBILE_QUERY = '(max-width: 767px), (pointer: coarse) and (max-height: 500px)';

export function useTerminalMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(TERMINAL_MOBILE_QUERY);
    const update = () => setMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  return mobile;
}
