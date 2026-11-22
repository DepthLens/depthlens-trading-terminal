import { createFileRoute } from '@tanstack/react-router';
import { TerminalView } from '@/components/TerminalView';
export const Route = createFileRoute('/_authenticated/terminal')({
  head:()=>({meta:[{title:'Terminal — DepthLens'},{name:'description',content:'Live Binance USDT futures charts, personalized tabs, and order flow tools.'},{property:'og:title',content:'Terminal — DepthLens'},{property:'og:description',content:'Follow live futures markets with DepthLens candlestick charts and order flow tools.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),component:()=><TerminalView/>,
});
