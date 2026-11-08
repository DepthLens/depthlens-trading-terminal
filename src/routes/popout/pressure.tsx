import { createFileRoute, redirect } from '@tanstack/react-router';
import { parsePopoutQuery } from '@/lib/popout';

export const Route = createFileRoute('/popout/pressure')({
  validateSearch: (search: Record<string, unknown>) => parsePopoutQuery(search),
  beforeLoad: ({ search }) => { throw redirect({ to: '/pressure', search, statusCode: 301 }); },
  head: () => ({ meta: [{ title: 'Pressure moved — DepthLens' }, { name: 'description', content: 'The DepthLens Pressure tools now live on one page.' }, { property: 'og:title', content: 'Pressure moved — DepthLens' }, { property: 'og:description', content: 'Open the DepthLens Pressure page.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
});
