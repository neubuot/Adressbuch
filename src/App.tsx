/**
 * App-Gerüst: Titel, Navigation und die jeweils gewählte Ansicht
 */

import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { href, useRoute } from './router';
import { ContactsView } from './views/ContactsView';
import { ContactView } from './views/ContactView';
import { MyCardView } from './views/MyCardView';
import { MoreView } from './views/MoreView';
import { NewsView } from './views/NewsView';
import { countUnseen, getActivitySeenAt } from './model/activity';
import { OnboardingView } from './views/OnboardingView';
import { Page } from './ui/Page';
import './styles/tokens.css';
import './styles/app.css';

// Selten gebrauchte Ansichten werden erst beim Öffnen geladen.
// Der Service Worker hält sie vor, sie stehen also auch offline bereit.
const ShareView = lazy(() => import('./views/ShareView').then((m) => ({ default: m.ShareView })));
const ConnectView = lazy(() => import('./views/ConnectView').then((m) => ({ default: m.ConnectView })));
const TagsView = lazy(() => import('./views/TagsView').then((m) => ({ default: m.TagsView })));
const ExportView = lazy(() => import('./views/ExportView').then((m) => ({ default: m.ExportView })));
const ImportView = lazy(() => import('./views/ImportView').then((m) => ({ default: m.ImportView })));
const BackupView = lazy(() => import('./views/BackupView').then((m) => ({ default: m.BackupView })));
const DuplicatesView = lazy(() => import('./views/DuplicatesView').then((m) => ({ default: m.DuplicatesView })));
const SourcesView = lazy(() => import('./views/SourcesView').then((m) => ({ default: m.SourcesView })));
const NetCheckView = lazy(() => import('./views/NetCheckView').then((m) => ({ default: m.NetCheckView })));

function buildAppTitle(firstName: string | undefined, lastName: string | undefined): string {
  const name = [firstName, lastName]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' ');
  return name ? `P2P Adressbuch von ${name}` : 'P2P Adressbuch';
}

type NavId = 'kontakte' | 'aktuelles' | 'karte' | 'mehr';

const NAV: Array<{ id: NavId; label: string; segments: string[] }> = [
  { id: 'kontakte', label: 'Kontakte', segments: [] },
  { id: 'aktuelles', label: 'Aktuelles', segments: ['aktuelles'] },
  { id: 'karte', label: 'Meine Karte', segments: ['karte'] },
  { id: 'mehr', label: 'Mehr', segments: ['mehr'] },
];

function navOf(route: string[]): NavId {
  if (route[0] === 'karte') return 'karte';
  if (route[0] === 'aktuelles') return 'aktuelles';
  if (route[0] === 'mehr') return 'mehr';
  return 'kontakte';
}

function renderView(route: string[]): React.ReactNode {
  const [first, second, third] = route;
  switch (first) {
    case undefined:
      return <ContactsView />;
    case 'kontakt':
      if (!second) return <ContactsView />;
      return third === 'freigabe' ? (
        <ShareView key={second} connectionId={second} />
      ) : (
        <ContactView key={second} connectionId={second} />
      );
    case 'verbinden':
      if (second === 'fuer' && third) return <ConnectView key={third} forContactId={third} />;
      return <ConnectView key={second ?? 'neu'} code={second} />;
    case 'aktuelles':
      return <NewsView />;
    case 'karte':
      return <MyCardView />;
    case 'mehr':
      if (second === 'tags') return <TagsView />;
      if (second === 'export') return <ExportView />;
      if (second === 'import') return <ImportView />;
      if (second === 'sicherung') return <BackupView />;
      if (second === 'doppelt') return <DuplicatesView />;
      if (second === 'quellen') return <SourcesView />;
      if (second === 'verbindung') return <NetCheckView />;
      return <MoreView />;
    default:
      return (
        <Page title="Seite nicht gefunden" back={{ href: href(), label: 'Kontakte' }}>
          <p>Diese Seite gibt es nicht.</p>
        </Page>
      );
  }
}

function AppContent() {
  const { appState, isLoaded, block } = useAppContext();
  const route = useRoute();
  const mainRef = useRef<HTMLElement>(null);
  const routeKey = route.join('/');
  const [onboarded, setOnboarded] = useState(false);
  const [seenAt, setSeenAt] = useState(getActivitySeenAt);

  useEffect(() => {
    const update = () => setSeenAt(getActivitySeenAt());
    window.addEventListener('adressbuch:activity-seen', update);
    return () => window.removeEventListener('adressbuch:activity-seen', update);
  }, []);

  const appTitle = buildAppTitle(appState.myCard.firstName, appState.myCard.lastName);

  useEffect(() => {
    document.title = appTitle;
  }, [appTitle]);

  // Nach einem Seitenwechsel den Fokus an den Anfang des Inhalts setzen
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [routeKey]);

  if (!isLoaded) {
    return (
      <div className="welcome" aria-busy="true">
        <h1 className="app-title">P2P Adressbuch</h1>
        <p className="muted">Wird geladen …</p>
      </div>
    );
  }

  if (block) {
    return (
      <div className="welcome">
        <h1 className="app-title">P2P Adressbuch</h1>
        <div className="note note-danger section" role="alert">
          <p className="note-title">
            {block === 'newer'
              ? 'Diese App-Version ist zu alt für deine Daten'
              : 'Deine gespeicherten Daten konnten nicht gelesen werden'}
          </p>
          <p className="small">
            {block === 'newer'
              ? 'Dein Adressbuch wurde mit einer neueren Version gespeichert. Damit nichts verloren geht, wurde nichts verändert. Lade die Seite neu, um die aktuelle Version zu erhalten.'
              : 'Damit nichts überschrieben wird, wurde nichts verändert. Lade die Seite neu. Hilft das nicht, kannst du eine Sicherung wiederherstellen.'}
          </p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Neu laden
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Erster Start: nur nach dem Namen fragen. Die Wiederherstellung einer
  // Sicherung bleibt ohne diesen Schritt erreichbar.
  const isEmpty =
    !appState.myCard.firstName &&
    !appState.myCard.lastName &&
    Object.keys(appState.connections).length === 0;
  const restoring = route[0] === 'mehr' && route[1] === 'sicherung';
  if (isEmpty && !onboarded && !restoring) {
    return (
      <OnboardingView
        invited={route[0] === 'verbinden' && !!route[1]}
        onDone={() => setOnboarded(true)}
      />
    );
  }

  const current = navOf(route);
  const unseen = current === 'aktuelles' ? 0 : countUnseen(appState.activity, seenAt);

  return (
    <div className="shell">
      <a className="skip-link" href="#inhalt" onClick={(event) => {
        event.preventDefault();
        mainRef.current?.focus();
      }}>
        Zum Inhalt springen
      </a>
      <header className="shell-head">
        <h1 className="app-title">{appTitle}</h1>
      </header>
      <nav className="nav" aria-label="Hauptnavigation">
        {NAV.map((item) => (
          <a
            key={item.id}
            className="nav-link"
            href={href(...item.segments)}
            aria-current={current === item.id ? 'page' : undefined}
          >
            {item.label}
            {item.id === 'aktuelles' && unseen > 0 && (
              <span className="badge">
                {unseen}
                <span className="visually-hidden"> neue Änderungen</span>
              </span>
            )}
          </a>
        ))}
      </nav>
      <main className="shell-main" id="inhalt" ref={mainRef} tabIndex={-1}>
        <Suspense fallback={<p className="muted">Wird geladen …</p>}>{renderView(route)}</Suspense>
      </main>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
