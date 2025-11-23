/**
 * Messaging-Komponente für P2P-Chat
 * Max. 210 Zeichen pro Nachricht
 */

import { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Message } from '../types';
import './Messages.css';

interface MessagesProps {
  onBack: () => void;
}

type MessageFilter = 'all' | 'sent' | 'received';

export function Messages({ onBack }: MessagesProps) {
  const { appState, addMessage, markMessageAsRead, deleteMessage, sendChatMessage } = useAppContext();
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [messageText, setMessageText] = useState('');
  const [filter, setFilter] = useState<MessageFilter>('all');

  // Get all connections (online and offline)
  const allConnections = useMemo(() => {
    return Object.values(appState.connections).sort((a, b) => {
      // Sort: online first, then by name
      if (a.status === 'online' && b.status !== 'online') return -1;
      if (a.status !== 'online' && b.status === 'online') return 1;
      const nameA = a.label || a.id;
      const nameB = b.label || b.id;
      return nameA.localeCompare(nameB);
    });
  }, [appState.connections]);

  // Filter messages based on current filter
  const filteredMessages = useMemo(() => {
    let msgs = appState.messages || [];

    if (filter === 'sent') {
      msgs = msgs.filter(m => m.type === 'sent');
    } else if (filter === 'received') {
      msgs = msgs.filter(m => m.type === 'received');
    }

    // Sort by timestamp, newest first
    return [...msgs].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [appState.messages, filter]);

  // Messages for selected connection
  const connectionMessages = useMemo(() => {
    if (!selectedConnectionId) return [];
    return filteredMessages.filter(m => m.connectionId === selectedConnectionId);
  }, [filteredMessages, selectedConnectionId]);

  const handleSendMessage = async () => {
    if (!selectedConnectionId || !messageText.trim()) {
      alert('Bitte Empfänger und Nachricht eingeben');
      return;
    }

    if (messageText.length > 210) {
      alert('Nachricht zu lang! Maximal 210 Zeichen erlaubt.');
      return;
    }

    const now = new Date().toISOString();
    const connection = appState.connections[selectedConnectionId];
    const isOnline = connection && connection.status === 'online';

    const message: Message = {
      id: crypto.randomUUID(),
      connectionId: selectedConnectionId,
      text: messageText.trim(),
      type: 'sent',
      timestamp: now,
      sentAt: now,
      deliveryStatus: isOnline ? 'pending' : 'pending',
      read: true
    };

    try {
      // Add to local store
      addMessage(message);
      console.log('💬 Nachricht lokal gespeichert:', message);

      // Send via P2P (will update status automatically)
      await sendChatMessage(selectedConnectionId, messageText.trim());

      if (isOnline) {
        console.log('📤 Nachricht via P2P gesendet');
      } else {
        console.warn('⏳ Peer offline - Nachricht in Queue');
      }

      // Clear input
      setMessageText('');
    } catch (error) {
      console.error('❌ Fehler beim Senden:', error);
      alert('Fehler beim Senden der Nachricht: ' + (error as Error).message);
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    if (confirm('Nachricht wirklich löschen?')) {
      deleteMessage(messageId);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDeliveryStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return '⏳';
      case 'sent':
        return '✓';
      case 'delivered':
        return '✓✓';
      case 'read':
        return '✓✓✓';
      default:
        return '';
    }
  };

  const getConnectionName = (connectionId: string) => {
    const connection = appState.connections[connectionId];
    if (!connection) return 'Unbekannt';

    if (connection.label) return connection.label;
    if (connection.remoteCard?.firstName || connection.remoteCard?.lastName) {
      return `${connection.remoteCard.firstName} ${connection.remoteCard.lastName}`.trim();
    }
    return connection.id.substring(0, 8);
  };

  const charCount = messageText.length;
  const charCountColor = charCount >= 200 ? '#f44336' : '#757575';

  return (
    <div className="messages-view">
      <div className="messages-header">
        <button onClick={onBack} className="back-btn">← Zurück</button>
        <h2>💬 Nachrichten</h2>
      </div>

      {/* Message Composer */}
      <div className="message-composer card">
        <h3>Neue Nachricht</h3>
        <div className="composer-form">
          <select
            value={selectedConnectionId}
            onChange={(e) => setSelectedConnectionId(e.target.value)}
            className="connection-select"
          >
            <option value="">Empfänger wählen...</option>
            {allConnections.length === 0 && (
              <option disabled>Keine Verbindungen vorhanden</option>
            )}
            {allConnections.map(conn => {
              const statusIcon = conn.status === 'online' ? '🟢' : '🔴';
              const statusText = conn.status === 'online' ? '' : ' (offline - wird in Queue gespeichert)';
              return (
                <option key={conn.id} value={conn.id}>
                  {statusIcon} {getConnectionName(conn.id)}{statusText}
                </option>
              );
            })}
          </select>

          <div className="message-input-wrapper">
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Nachricht eingeben (max. 210 Zeichen)"
              maxLength={210}
              rows={3}
              className="message-input"
            />
            <span className="char-counter" style={{ color: charCountColor }}>
              {charCount}/210
            </span>
          </div>

          <button
            onClick={handleSendMessage}
            disabled={!selectedConnectionId || !messageText.trim()}
            className="send-btn"
          >
            Senden
          </button>
        </div>
      </div>

      {/* Message List */}
      <div className="message-list card">
        <div className="list-header">
          <h3>Nachrichten</h3>
          <div className="filter-buttons">
            <button
              className={filter === 'all' ? 'filter-btn active' : 'filter-btn'}
              onClick={() => setFilter('all')}
            >
              Alle
            </button>
            <button
              className={filter === 'sent' ? 'filter-btn active' : 'filter-btn'}
              onClick={() => setFilter('sent')}
            >
              Gesendet
            </button>
            <button
              className={filter === 'received' ? 'filter-btn active' : 'filter-btn'}
              onClick={() => setFilter('received')}
            >
              Empfangen
            </button>
          </div>
        </div>

        {filteredMessages.length === 0 ? (
          <div className="empty-state">
            <p>📭</p>
            <p>Keine Nachrichten vorhanden</p>
          </div>
        ) : (
          <div className="messages-container">
            {filteredMessages.map(msg => (
              <div
                key={msg.id}
                className={`message-item ${msg.type}`}
                onClick={() => {
                  if (msg.type === 'received' && !msg.read) {
                    markMessageAsRead(msg.id);
                  }
                }}
              >
                <div className="message-header">
                  <span className="message-peer">
                    {msg.type === 'sent' ? '→' : '←'} {getConnectionName(msg.connectionId)}
                    {msg.type === 'sent' && (
                      <span className={`delivery-status ${msg.deliveryStatus}`}>
                        {getDeliveryStatusIcon(msg.deliveryStatus)}
                      </span>
                    )}
                  </span>
                  <div className="message-timestamps">
                    <span>Gesendet: {formatTimestamp(msg.sentAt)}</span>
                    {msg.deliveredAt && (
                      <span>Empfangen: {formatTimestamp(msg.deliveredAt)}</span>
                    )}
                    {msg.readAt && (
                      <span>Gelesen: {formatTimestamp(msg.readAt)}</span>
                    )}
                  </div>
                </div>
                <div className="message-text">{msg.text}</div>
                <div className="message-footer">
                  {!msg.read && msg.type === 'received' && (
                    <span className="unread-badge">Neu</span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteMessage(msg.id);
                    }}
                    className="delete-btn"
                  >
                    🗑️ Löschen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
