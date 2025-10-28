/**
 * Connections-Komponente: Verwaltung von Peer-Verbindungen
 */

import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { getP2PManager } from '../p2p/p2p-manager';
import { ConnectionInvite } from './ConnectionInvite';

interface ConnectionsProps {
  onBack: () => void;
  onEditPolicy: (connectionId: string) => void;
}

export const Connections: React.FC<ConnectionsProps> = ({ onBack, onEditPolicy }) => {
  const { appState } = useAppContext();
  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [newConnectionFields, setNewConnectionFields] = useState<string[]>([
    'firstName',
    'lastName',
    'email',
  ]);

  const connections = Object.values(appState.connections);

  const handleCreateInvite = () => {
    setShowInvite(true);
  };

  const handleJoinRoom = () => {
    if (joinCode.trim().length >= 4) {
      const manager = getP2PManager();
      if (manager) {
        manager.joinRoom(joinCode.trim().toUpperCase());
        setJoinCode('');
        setShowJoin(false);
        alert(`Raum beigetreten: ${joinCode.trim()}`);
      }
    } else {
      alert('Bitte gib einen gültigen Code ein');
    }
  };

  const handleRemoveConnection = async (connectionId: string) => {
    if (confirm('Möchtest du diese Verbindung wirklich entfernen?')) {
      await store.removeConnection(connectionId);
    }
  };

  const handleResync = async (connectionId: string) => {
    const manager = getP2PManager();
    if (manager) {
      await manager.resyncConnection(connectionId);
      alert('Synchronisation gestartet');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem' }}>
        <button className="btn btn-secondary btn-small" onClick={onBack}>
          ← Zurück
        </button>
        <h2 style={{ marginLeft: '1rem' }}>Verbindungen</h2>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleCreateInvite}>
            📤 Einladung erstellen
          </button>
          <button className="btn btn-secondary" onClick={() => setShowJoin(!showJoin)}>
            📥 Mit Code verbinden
          </button>
        </div>

        {showJoin && (
          <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '0.375rem' }}>
            <div className="form-group">
              <label htmlFor="joinCode">Verbindungscode eingeben</label>
              <input
                id="joinCode"
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="z.B. ABC123XY"
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <button className="btn btn-primary btn-small" onClick={handleJoinRoom}>
              Verbinden
            </button>
          </div>
        )}
      </div>

      {showInvite && (
        <ConnectionInvite
          fields={newConnectionFields}
          onFieldsChange={setNewConnectionFields}
          onClose={() => setShowInvite(false)}
        />
      )}

      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>Aktive Verbindungen ({connections.length})</h3>

        {connections.length === 0 ? (
          <div className="empty-state">
            <h3>Keine Verbindungen</h3>
            <p>Erstelle eine Einladung oder verbinde dich mit einem Code</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {connections.map((connection) => (
              <div
                key={connection.id}
                style={{
                  padding: '1rem',
                  border: '1px solid var(--border)',
                  borderRadius: '0.375rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                  <div>
                    <strong>{connection.label || connection.id.substring(0, 8)}</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      ID: {connection.id}
                    </div>
                  </div>
                  <span className={`status-indicator ${connection.status}`}>
                    <span className="status-dot" />
                    {connection.status === 'online' ? 'Online' : connection.status === 'syncing' ? 'Synchronisiert' : 'Offline'}
                  </span>
                </div>

                <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                  Freigegebene Felder: {connection.allowedFields.length === 0 ? 'Keine' : connection.allowedFields.join(', ')}
                </div>

                {connection.lastSyncAt && (
                  <div style={{ fontSize: '0.75rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                    Letzte Synchronisation: {new Date(connection.lastSyncAt).toLocaleString('de-DE')}
                  </div>
                )}

                {connection.remoteCard && (
                  <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: 'var(--background)', borderRadius: '0.25rem' }}>
                    <strong>Empfangene Daten:</strong>
                    <div style={{ marginTop: '0.25rem' }}>
                      {connection.remoteCard.firstName} {connection.remoteCard.lastName}
                      {connection.remoteCard.email && <div>{connection.remoteCard.email}</div>}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => onEditPolicy(connection.id)}
                  >
                    🔒 Freigabe bearbeiten
                  </button>
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={() => handleResync(connection.id)}
                    disabled={connection.status === 'offline'}
                  >
                    🔄 Resync
                  </button>
                  <button
                    className="btn btn-danger btn-small"
                    onClick={() => handleRemoveConnection(connection.id)}
                  >
                    ❌ Entfernen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
