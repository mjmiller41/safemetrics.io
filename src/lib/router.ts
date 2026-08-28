/**
 * Minimal client-side routing.
 *
 * The site has two pages, so a routing library would be more configuration than
 * code. Cloudflare serves `index.html` for any non-`/api/*` path
 * (`not_found_handling: single-page-application`), so deep links and refreshes on
 * `/stats` reach the app rather than 404ing.
 *
 * Note that `navigate` goes through `history.pushState`, which the tracker patches
 * to record a pageview — so moving between pages is counted, as it should be.
 */

import { useCallback, useEffect, useState } from 'react';

export const ROUTES = {
  home: '/',
  stats: '/stats',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

function currentPath(): string {
  // Trailing slashes are stripped so `/stats/` and `/stats` are the same page.
  const path = window.location.pathname.replace(/\/+$/, '');
  return path === '' ? '/' : path;
}

export function useRoute() {
  const [path, setPath] = useState<string>(currentPath);

  useEffect(() => {
    const onPopState = () => setPath(currentPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to === currentPath()) return;
    window.history.pushState({}, '', to);
    setPath(currentPath());
    window.scrollTo(0, 0);
  }, []);

  return { path, navigate };
}

/**
 * Anchor href that works from either page: an in-page hash while on the marketing
 * page, an absolute one from anywhere else.
 */
export function sectionHref(path: string, id: string): string {
  return path === ROUTES.home ? `#${id}` : `/#${id}`;
}
