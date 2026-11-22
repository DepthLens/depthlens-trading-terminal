import { createFileRoute } from '@tanstack/react-router';
import { TerminalView } from '@/components/TerminalView';

export const Route = createFileRoute('/_authenticated/forex')({
  head: () => ({ meta: [{ title: 'Forex Terminal — DepthLens' }, { name: 'description', content: 'Forex and gold terminal with the same tabs, tools and windows as DepthLens Futures.' }, { property: 'og:title', content: 'Forex Terminal — DepthLens' }, { property: 'og:description', content: 'Spot forex candles plus full order flow on the XAUUSDT gold perpetual.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: () => <TerminalView forex />,
});
