import { createFileRoute, redirect } from '@tanstack/react-router';
import { parsePopoutQuery } from '@/lib/popout';

export const Route = createFileRoute('/popout/price-pressure')({
  validateSearch: (search: Record<string, unknown>) => parsePopoutQuery(search),
  beforeLoad: ({ search }) => { throw redirect({ to: '/popout/pressure', search, statusCode: 301 }); },
  head: () => ({ meta: [{ title: 'Price Pressure moved — DepthLens' }, { name: 'description', content: 'Price Pressure now lives in the DepthLens Pressure window.' }, { property: 'og:title', content: 'Price Pressure moved — DepthLens' }, { property: 'og:description', content: 'Open the unified DepthLens Pressure window.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
});
