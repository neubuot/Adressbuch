/**
 * React Context für globalen App-State
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { store } from '../store/automerge-store';
import { initP2PManager, getP2PManager } from '../p2p/p2p-manager';
import type { AppState } from '../types';

interface AppContextValue {
  appState: AppState;
  refresh: () => void;
  isInitialized: boolean;
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
  const [isInitialized, setIsInitialized] = useState(false);
  const initStartedRef = React.useRef(false);

  useEffect(() => {
    // Guard: Verhindere doppelte Initialisierung in React StrictMode
    if (initStartedRef.current) {
      return;
    }
    initStartedRef.current = true;

    const init = async () => {
      // Store laden
      await store.load();
      setAppState(store.getDoc());

      // P2P-Manager initialisieren
      const signalingUrl = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8080';
      const manager = initP2PManager({ signalingUrl });
      await manager.init();

      setIsInitialized(true);
    };

    init().catch(console.error);

    // Store-Änderungen abonnieren
    const unsubscribe = store.onChange((doc) => {
      setAppState(doc);
    });

    return () => {
      unsubscribe();
      // Hinweis: destroy() wird nur beim echten Unmount aufgerufen,
      // nicht bei React StrictMode re-mounts (da initStartedRef.current true bleibt)
      const manager = getP2PManager();
      if (manager) {
        manager.destroy();
      }
      initStartedRef.current = false;
    };
  }, []);

  const refresh = () => {
    setAppState(store.getDoc());
  };

  return (
    <AppContext.Provider value={{ appState, refresh, isInitialized }}>
      {children}
    </AppContext.Provider>
  );
};
