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

  useEffect(() => {
    const init = async () => {
      // Store laden
      await store.load();
      setAppState(store.getDoc());

      // P2P-Manager initialisieren
      const signalingUrl = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8080';
      const manager = initP2PManager({ signalingUrl });
      await manager.init();

      setIsInitialized(true);

      console.log('✅ App initialisiert');
    };

    init().catch(console.error);

    // Store-Änderungen abonnieren
    const unsubscribe = store.onChange((doc) => {
      setAppState(doc);
    });

    return () => {
      unsubscribe();
      const manager = getP2PManager();
      if (manager) {
        manager.destroy();
      }
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
