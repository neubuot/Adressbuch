/**
 * Globaler Zustand der App: Adressbuch, Verbindungsdienst, Rückmeldungen
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { store, type StoreBlock } from '../store/automerge-store';
import { initP2PManager, getP2PManager } from '../p2p/p2p-manager';
import type { SignalingStatus } from '../p2p/signaling';
import type { AppState } from '../types';
import { getSignalingUrl, getBoxUrl } from '../config';
import { contactName } from '../model/contact';

interface AppContextValue {
  appState: AppState;
  /** true, sobald die gespeicherten Daten geladen sind */
  isLoaded: boolean;
  /** Grund, warum die Daten nicht verändert werden dürfen */
  block: StoreBlock;
  /** Zustand des Dienstes, der Verbindungen zu Kontakten vermittelt */
  serviceStatus: SignalingStatus;
  /** Zeigt eine kurze Rückmeldung an */
  notify: (message: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext muss innerhalb von AppProvider verwendet werden');
  }
  return context;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appState, setAppState] = useState<AppState>(store.getDoc());
  const [isLoaded, setIsLoaded] = useState(false);
  const [block, setBlock] = useState<StoreBlock>(null);
  const [serviceStatus, setServiceStatus] = useState<SignalingStatus>('connecting');
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToastRef = useRef<(message: string) => void>(() => undefined);
  const showToast = (message: string) => showToastRef.current(message);

  useEffect(() => {
    let cancelled = false;
    let unsubscribeStatus: (() => void) | null = null;
    let expiryTimer: number | null = null;
    let unsubscribeLink: (() => void) | null = null;

    const unsubscribeStore = store.onChange((doc) => setAppState(doc));

    const init = async () => {
      await store.load();
      if (cancelled) return;
      setAppState(store.getDoc());
      setBlock(store.getBlock());
      setIsLoaded(true);

      if (store.getBlock()) return;

      // Befristete Freigaben: beim Start und danach regelmäßig auf Ablauf prüfen
      await store.expireShares();
      await store.pruneIntros();
      expiryTimer = window.setInterval(() => void store.expireShares(), 30000);

      // Den Browser bitten, die Daten nicht von sich aus zu löschen
      void navigator.storage?.persist?.().catch(() => undefined);

      const manager = initP2PManager({ signalingUrl: getSignalingUrl(), boxUrl: getBoxUrl() });
      unsubscribeStatus = manager.onServiceStatus(setServiceStatus);
      unsubscribeLink = manager.onLink((event) => {
        if (event.type !== 'linked' || !event.viaIntro) return;
        const connection = store.getDoc().connections[event.connectionId];
        const name = connection ? contactName(connection) : 'der vorgestellten Person';
        showToast(`Du bist jetzt mit ${name} verbunden.`);
      });
      await manager.init();
      if (!cancelled) setServiceStatus(manager.getServiceStatus());
    };

    init().catch((error) => {
      console.error('Start fehlgeschlagen', error);
      if (!cancelled) setIsLoaded(true);
    });

    return () => {
      cancelled = true;
      if (expiryTimer !== null) clearInterval(expiryTimer);
      unsubscribeStore();
      unsubscribeStatus?.();
      unsubscribeLink?.();
      getP2PManager()?.destroy();
    };
  }, []);

  const notify = useCallback((message: string) => {
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message });
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);
  showToastRef.current = notify;

  return (
    <AppContext.Provider value={{ appState, isLoaded, block, serviceStatus, notify }}>
      {children}
      <div aria-live="polite" role="status">
        {toast && (
          <div className="toast" key={toast.id}>
            {toast.message}
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
};
