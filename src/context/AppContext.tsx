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

  // Auto-send pending messages when peer comes online
  useEffect(() => {
    const sendPendingMessages = async () => {
      const manager = getP2PManager();
      if (!manager) {
        console.log('⏸️ P2P Manager nicht verfügbar');
        return;
      }

      const pendingMessages = appState.pendingMessages || [];
      console.log(`📋 Pending messages check: ${pendingMessages.length} in queue`);

      if (pendingMessages.length === 0) return;

      // Group pending messages by connection
      const messagesByConnection: Record<string, Message[]> = {};
      for (const msg of pendingMessages) {
        if (!messagesByConnection[msg.connectionId]) {
          messagesByConnection[msg.connectionId] = [];
        }
        messagesByConnection[msg.connectionId].push(msg);
      }

      console.log(`📊 Messages grouped by connection:`, Object.keys(messagesByConnection).map(id => `${id.substring(0, 8)}: ${messagesByConnection[id].length} msg`));

      // Try to send messages for online connections
      for (const [connectionId, messages] of Object.entries(messagesByConnection)) {
        const connection = appState.connections[connectionId];
        const status = connection?.status || 'unknown';

        console.log(`🔍 Check connection ${connectionId.substring(0, 8)}: status=${status}`);

        if (connection && connection.status === 'online') {
          console.log(`📤 Versende ${messages.length} ausstehende Nachricht(en) an ${connectionId.substring(0, 8)}`);

          for (const message of messages) {
            try {
              const chatMessage = {
                type: 'CHAT' as const,
                id: message.id,
                text: message.text,
                timestamp: message.timestamp,
                sentAt: message.sentAt,
              };

              console.log(`📨 Sende Nachricht: "${message.text.substring(0, 20)}..."`);
              await manager.sendMessage(connectionId, chatMessage);

              // Update message status to 'sent'
              store.updateDoc('Message sent from queue', (doc) => {
                const msg = doc.messages?.find(m => m.id === message.id);
                if (msg) msg.deliveryStatus = 'sent';

                // Remove from pending queue
                if (doc.pendingMessages) {
                  doc.pendingMessages = doc.pendingMessages.filter(m => m.id !== message.id);
                }
              });

              console.log(`✅ Nachricht ${message.id.substring(0, 8)} erfolgreich gesendet`);
            } catch (error) {
              console.error(`❌ Fehler beim Senden von Nachricht ${message.id.substring(0, 8)}:`, error);
            }
          }
        } else {
          console.log(`⏸️ Connection ${connectionId.substring(0, 8)} ist ${status}, überspringe`);
        }
      }
    };

    console.log('🔄 useEffect triggered: checking pending messages...');
    sendPendingMessages();
  }, [appState.connections, appState.pendingMessages]);

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
    const connection = appState.connections[connectionId];
    const now = new Date().toISOString();
    const messageId = crypto.randomUUID();

    const chatMessage: ChatMessage = {
      type: 'CHAT',
      id: messageId,
      text,
      timestamp: now,
      sentAt: now,
      senderId: appState.myCard.id
    };

    // Prüfe ob Peer online ist
    const isOnline = connection && connection.status === 'online';

    // Update lokale Message mit Status
    store.updateDoc('Update message status', (doc) => {
      if (doc.messages) {
        const message = doc.messages.find(m => m.id === messageId);
        if (message) {
          message.deliveryStatus = isOnline ? 'sent' : 'pending';
          if (!isOnline) {
            // Füge zu pending queue hinzu
            if (!doc.pendingMessages) doc.pendingMessages = [];
            doc.pendingMessages.push(message);
          }
        }
      }
    });

    if (isOnline && manager) {
      try {
        await manager.sendMessage(connectionId, chatMessage);
        // Update status zu 'sent'
        store.updateDoc('Message sent', (doc) => {
          const message = doc.messages?.find(m => m.id === messageId);
          if (message) {
            message.deliveryStatus = 'sent';
          }
        });
      } catch (error) {
        console.error('Failed to send chat message:', error);
        // Setze zu pending bei Fehler
        store.updateDoc('Message failed, set pending', (doc) => {
          const message = doc.messages?.find(m => m.id === messageId);
          if (message) {
            message.deliveryStatus = 'pending';
            if (!doc.pendingMessages) doc.pendingMessages = [];
            if (!doc.pendingMessages.find(m => m.id === messageId)) {
              doc.pendingMessages.push(message);
            }
          }
        });
        throw error;
      }
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
