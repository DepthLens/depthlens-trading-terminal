import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Opens Flow Radar's existing options panel (queued if the radar is still mounting). */
export function openRadarSettings() {
  (window as { __radarOpen?: boolean }).__radarOpen = true;
  window.dispatchEvent(new Event('flow-radar-settings'));
}

export function FlowRadarGear({ onClick }: { onClick: () => void }) {
  return <Button type="button" onClick={onClick} variant="ghost" size="icon" aria-label="Flow Radar settings" title="Flow Radar settings" className="size-8 text-t-muted hover:bg-t-border mobile:size-10"><Settings className="size-4"/></Button>;
}
