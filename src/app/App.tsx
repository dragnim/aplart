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
          <WorkspacePage presetId={route.presetId} sharedState={route.sharedState} />
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
