/**
 * React Context für globalen App-State
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { store } from '../store/automerge-store';
import { initP2PManager, getP2PManager } from '../p2p/p2p-manager';
import type { AppState, Message, ChatMessage } from '../types';

interface AppContextValue {
  appState: AppState;
  refresh: () => void;
  isInitialized: boolean;
  // Message functions
  addMessage: (message: Message) => void;
  deleteMessage: (messageId: string) => void;
  markMessageAsRead: (messageId: string) => void;
  sendChatMessage: (connectionId: string, text: string) => Promise<void>;
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

  // Message functions
  const addMessage = (message: Message) => {
    store.updateDoc('Add message', (doc) => {
      if (!doc.messages) {
        doc.messages = [];
      }
      doc.messages.push(message);
    });
  };

  const deleteMessage = (messageId: string) => {
    store.updateDoc('Delete message', (doc) => {
      if (doc.messages) {
        const index = doc.messages.findIndex(m => m.id === messageId);
        if (index !== -1) {
          doc.messages.splice(index, 1);
        }
      }
    });
  };

  const markMessageAsRead = (messageId: string) => {
    store.updateDoc('Mark message as read', (doc) => {
      if (doc.messages) {
        const message = doc.messages.find(m => m.id === messageId);
        if (message) {
          message.read = true;
        }
      }
    });
  };

  const sendChatMessage = async (connectionId: string, text: string) => {
    const manager = getP2PManager();
    if (!manager) return;

    const chatMessage: ChatMessage = {
      type: 'CHAT',
      id: crypto.randomUUID(),
      text,
      timestamp: new Date().toISOString(),
      senderId: appState.myCard.id
    };

    try {
      await manager.sendMessage(connectionId, chatMessage);
    } catch (error) {
      console.error('Failed to send chat message:', error);
      throw error;
    }
  };

  return (
    <AppContext.Provider value={{
      appState,
      refresh,
      isInitialized,
      addMessage,
      deleteMessage,
      markMessageAsRead,
      sendChatMessage
    }}>
      {children}
    </AppContext.Provider>
  );
};
