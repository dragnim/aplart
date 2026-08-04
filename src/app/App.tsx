import { Suspense, lazy, useEffect } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { SiteFooter } from '@/components/SiteFooter/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader/SiteHeader';
import { GalleryPage } from '@/gallery/GalleryPage';
import { AboutPage } from '@/pages/AboutPage';
import { HelpPage } from '@/pages/HelpPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { useRoute, type Route } from './router';
import styles from './App.module.css';

/*
 * The workspace pulls in CodeMirror, which is by far the largest thing this
 * application depends on. Loading it lazily keeps it out of the gallery — the
 * page most visitors see first, and often on a phone — at the cost of a brief
 * placeholder when a piece is opened.
 */
const WorkspacePage = lazy(async () => ({
  default: (await import('@/workspace/WorkspacePage')).WorkspacePage,
}));

const SITE_NAME = 'APL Art';

function titleFor(route: Route): string {
  switch (route.name) {
    case 'gallery':
      return `${SITE_NAME} — tiny programs, infinite patterns`;
    case 'artwork':
      return `${route.presetId} — ${SITE_NAME}`;
    case 'about':
      return `About — ${SITE_NAME}`;
    case 'help':
      return `Help — ${SITE_NAME}`;
    case 'notFound':
      return `Not found — ${SITE_NAME}`;
  }
}

/**
 * What counts as a different page for scrolling.
 *
 * The artwork's identity is part of it, so moving from one piece to another starts
 * at the top; the shared-state and handoff payloads are not, because they arrive
 * with the same navigation and would otherwise scroll twice.
 */
function keyFor(route: Route): string {
  return route.name === 'artwork' ? `artwork:${route.presetId}` : route.name;
}

/**
 * The last scroll offset seen on each page, for Back and Forward.
 *
 * Module scope, not component state: it must outlive the unmount that happens on
 * every navigation, and it is deliberately not persisted — a fresh visit should
 * start at the top of the page, not wherever the last session ended.
 */
const rememberedOffsets = new Map<string, number>();

function headerSelection(route: Route): 'gallery' | 'about' | 'help' | null {
  switch (route.name) {
    case 'gallery':
      return 'gallery';
    case 'about':
      return 'about';
    case 'help':
      return 'help';
    case 'artwork':
    case 'notFound':
      return null;
  }
}

export function App() {
  const route = useRoute();

  // A single-page application does not update the document title on its own,
  // and the title is how screen reader users know the page changed.
  useEffect(() => {
    document.title = titleFor(route);
  }, [route]);

  /*
   * Where a page starts.
   *
   * A hash change scrolls nowhere on its own, so following a link from a scrolled
   * gallery left the new page at the old offset — the artwork opened halfway down
   * itself. The browser had been hiding this: the workspace loads lazily, and its
   * brief placeholder made the document short enough that the offset was clamped
   * away. Once the chunk was cached the placeholder stopped appearing and the
   * offset survived.
   *
   * Both cases are handled here rather than left to the browser, because neither
   * browser gets this right on a same-document hash navigation. Chromium restores
   * a remembered position on Back but fires `popstate` for link clicks too, so
   * that event cannot tell a new page from a revisit. WebKit does not restore at
   * all — Back arrived at the gallery still holding the *artwork's* offset, which
   * is the same fault wearing a different hat. So: remember the offset per page,
   * return to it on a revisit, and start at the top otherwise.
   *
   * A new history entry carries no state; an entry reached by Back or Forward
   * carries the mark left when it was first visited. That is what separates them.
   */
  const routeKey = keyFor(route);

  useEffect(() => {
    // Ours to manage, so the browser does not also try and disagree.
    window.history.scrollRestoration = 'manual';
  }, []);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        rememberedOffsets.set(routeKey, window.scrollY);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [routeKey]);

  useEffect(() => {
    const state: unknown = window.history.state;
    const revisited =
      typeof state === 'object' && state !== null && (state as { aplart?: unknown }).aplart === 'visited';

    if (revisited) {
      window.scrollTo(0, rememberedOffsets.get(routeKey) ?? 0);
      return;
    }

    window.history.replaceState({ ...(typeof state === 'object' ? state : {}), aplart: 'visited' }, '');
    window.scrollTo(0, 0);
  }, [routeKey]);

  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <SiteHeader current={headerSelection(route)} />

      <main id="main" className={styles.main} tabIndex={-1}>
        <ErrorBoundary area={route.name === 'artwork' ? 'this artwork' : 'this page'}>
          <RouteView route={route} />
        </ErrorBoundary>
      </main>

      <SiteFooter />
    </div>
  );
}

function RouteView({ route }: { readonly route: Route }) {
  switch (route.name) {
    case 'gallery':
      return <GalleryPage />;
    case 'artwork':
      return (
        <Suspense fallback={<p className={styles.loading}>Loading the workspace…</p>}>
          <WorkspacePage presetId={route.presetId} sharedState={route.sharedState} handoff={route.handoff} />
        </Suspense>
      );
    case 'about':
      return <AboutPage />;
    case 'help':
      return <HelpPage />;
    case 'notFound':
      return <NotFoundPage what={`There is no page at “${route.path}”.`} />;
  }
}
