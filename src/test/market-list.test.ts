import { expect, it } from 'vitest';
import { visibleMarketRange } from '@/lib/market-list';
it('renders only visible 48px market rows regardless of total pair count', () => {
  expect(visibleMarketRange(1000, 0, 480)).toEqual({ start: 0, end: 10 });
  expect(visibleMarketRange(1000, 4800, 480)).toEqual({ start: 100, end: 110 });
  expect(visibleMarketRange(103, 4800, 480)).toEqual({ start: 100, end: 103 });
});