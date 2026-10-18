import { useEffect, useState } from 'react';
import { orderBook } from '@/lib/order-book';
import { connectionManager } from '@/lib/market-stream';
import { formatPrice, type PriceSpec } from '@/lib/market-data';

export function BookDebug({ spec }: { spec?: PriceSpec }) {
  const [book, setBook] = useState(() => orderBook.debug());
  useEffect(() => { const timer = setInterval(() => setBook(orderBook.debug()), 250); return () => clearInterval(timer); }, []);
  const price = (n: number | null) => n === null ? '—' : spec ? formatPrice(n, spec) : String(n);
  const rows = [
    ['Source', book.source], ['Pair', book.symbol || '—'], ['State', book.enabled ? book.state : 'Off'],
    ['Best bid', price(book.bestBid)], ['Best ask', price(book.bestAsk)], ['Spread', price(book.spread)],
    ['Bid levels', String(book.bidLevels)], ['Ask levels', String(book.askLevels)],
    ['Total bid size', book.totalBidSize.toLocaleString('en-US', { maximumFractionDigits: 8 })],
    ['Total ask size', book.totalAskSize.toLocaleString('en-US', { maximumFractionDigits: 8 })],
    ['Updates / s', String(book.updatesPerSecond)], ['Open sockets', String(connectionManager.snapshot().openSockets)],
  ];
  return <section aria-label="Order book debug" data-testid="book-debug" className="absolute right-3 top-3 z-20 w-56 rounded-md border border-t-border bg-t-panel/95 p-3 text-xs tabular-nums shadow-sm">
    <h2 className="mb-2 font-semibold text-t-text">Book debug</h2>
    <dl className="space-y-1.5">{rows.map(([name, value]) => <div key={name} className="flex justify-between gap-2"><dt className="text-t-muted">{name}</dt><dd data-book-field={name} className={name === 'State' ? book.state === 'Synced' && book.enabled ? 'text-t-up' : 'text-t-warning' : 'text-t-text'}>{value}</dd></div>)}</dl>
  </section>;
}