/**
 * Connections-Komponente: Verwaltung von Peer-Verbindungen
 */

import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { getP2PManager } from '../p2p/p2p-manager';
import { ConnectionInvite } from './ConnectionInvite';
import { TagManager } from './TagManager';

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
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelValue, setLabelValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'lastSync'>('name');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [showTagManager, setShowTagManager] = useState(false);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [editingTags, setEditingTags] = useState<string | null>(null);

  const connections = Object.values(appState.connections);
  const tags = Object.values(appState.tags);

  const handleCreateInvite = () => {
    setShowInvite(true);
  };

  const handleJoinRoom = () => {
    if (joinCode.trim().length >= 4) {
      const manager = getP2PManager();
      if (manager) {
        // Setze Standard-Freigabe bevor wir beitreten
        manager.setDefaultAllowedFields(newConnectionFields);
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

  const handleStartEditLabel = (connectionId: string, currentLabel?: string) => {
    setEditingLabel(connectionId);
    setLabelValue(currentLabel || '');
  };

  const handleSaveLabel = async (connectionId: string) => {
    await store.updateConnection(connectionId, {
      label: labelValue.trim() || undefined,
    });
    setEditingLabel(null);
    setLabelValue('');
  };

  const handleCancelEditLabel = () => {
    setEditingLabel(null);
    setLabelValue('');
  };

  const handleToggleTag = async (connectionId: string, tagId: string) => {
    const connection = appState.connections[connectionId];
    if (!connection) return;

    const currentTags = connection.tagIds || [];
    if (currentTags.includes(tagId)) {
      // Entferne Tag
      await store.removeTagsFromConnection(connectionId, [tagId]);
    } else {
      // Füge Tag hinzu
      await store.addTagsToConnection(connectionId, [tagId]);
    }
  };

  // Filter and sort connections
  const filteredConnections = connections
    // Apply status filter
    .filter((conn) => {
      if (filterStatus === 'all') return true;
      return conn.status === filterStatus;
    })
    // Apply tag filter
    .filter((conn) => {
      if (!selectedTagFilter) return true;
      return conn.tagIds?.includes(selectedTagFilter);
    })
    // Apply search query
    .filter((conn) => {
      if (!searchQuery.trim()) return true;

      const query = searchQuery.toLowerCase();
      const label = (conn.label || '').toLowerCase();
      const id = conn.id.toLowerCase();
      const email = (conn.remoteCard?.email || '').toLowerCase();
      const name = [conn.remoteCard?.firstName, conn.remoteCard?.lastName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return (
        label.includes(query) ||
        id.includes(query) ||
        email.includes(query) ||
        name.includes(query)
      );
    })
    // Apply sorting
    .sort((a, b) => {
      if (sortBy === 'name') {
        const nameA = a.label || a.remoteCard?.firstName || a.id;
        const nameB = b.label || b.remoteCard?.firstName || b.id;
        return nameA.localeCompare(nameB, 'de-DE');
      } else if (sortBy === 'status') {
        // Online first, then syncing, then offline
        const statusOrder = { online: 0, syncing: 1, offline: 2 };
        return statusOrder[a.status] - statusOrder[b.status];
      } else if (sortBy === 'lastSync') {
        // Most recent first
        const timeA = a.lastSyncAt ? new Date(a.lastSyncAt).getTime() : 0;
        const timeB = b.lastSyncAt ? new Date(b.lastSyncAt).getTime() : 0;
        return timeB - timeA;
      }
      return 0;
    });

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
          <button className="btn btn-secondary" onClick={() => setShowTagManager(true)}>
            🏷️ Tags verwalten
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

      {showTagManager && <TagManager onClose={() => setShowTagManager(false)} />}

      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>Aktive Verbindungen ({connections.length})</h3>

        {connections.length > 0 && (
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <input
              type="text"
              placeholder="🔍 Suche nach Name, Label, E-Mail oder ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%' }}
            />
            {searchQuery && (
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {filteredConnections.length} von {connections.length} Verbindungen gefunden
              </div>
            )}
          </div>
        )}

        {connections.length > 0 && (
          <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Ansicht wechseln */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Ansicht:</span>
              <button
                className={`btn btn-small ${viewMode === 'card' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setViewMode('card')}
                title="Karten-Ansicht"
              >
                📋 Karten
              </button>
              <button
                className={`btn btn-small ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setViewMode('list')}
                title="Listen-Ansicht"
              >
                📊 Liste
              </button>
            </div>

            {/* Status Filter */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Filter:</span>
              <button
                className={`btn btn-small ${filterStatus === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterStatus('all')}
              >
                Alle ({connections.length})
              </button>
              <button
                className={`btn btn-small ${filterStatus === 'online' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterStatus('online')}
              >
                🟢 Online ({connections.filter(c => c.status === 'online').length})
              </button>
              <button
                className={`btn btn-small ${filterStatus === 'offline' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterStatus('offline')}
              >
                🔴 Offline ({connections.filter(c => c.status === 'offline').length})
              </button>
            </div>

            {/* Tag Filter */}
            {tags.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Tags:</span>
                <button
                  className={`btn btn-small ${!selectedTagFilter ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSelectedTagFilter(null)}
                >
                  Alle
                </button>
                {tags.map((tag) => {
                  const count = connections.filter(c => c.tagIds?.includes(tag.id)).length;
                  return (
                    <button
                      key={tag.id}
                      className={`btn btn-small ${selectedTagFilter === tag.id ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setSelectedTagFilter(tag.id)}
                      style={{
                        borderLeft: `3px solid ${tag.color}`,
                      }}
                    >
                      {tag.name} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Sortierung */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Sortieren:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'status' | 'lastSync')}
                style={{ padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: '1px solid var(--border)' }}
              >
                <option value="name">Nach Name</option>
                <option value="status">Nach Status</option>
                <option value="lastSync">Nach letzter Sync</option>
              </select>
            </div>
          </div>
        )}

        {connections.length === 0 ? (
          <div className="empty-state">
            <h3>Keine Verbindungen</h3>
            <p>Erstelle eine Einladung oder verbinde dich mit einem Code</p>
          </div>
        ) : filteredConnections.length === 0 ? (
          <div className="empty-state">
            <h3>Keine Treffer</h3>
            <p>Keine Verbindungen entsprechen deiner Suche</p>
          </div>
        ) : viewMode === 'card' ? (
          /* Card View */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredConnections.map((connection) => (
              <div
                key={connection.id}
                style={{
                  padding: '1rem',
                  border: '1px solid var(--border)',
                  borderRadius: '0.375rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                  <div style={{ flex: 1, marginRight: '1rem' }}>
                    {editingLabel === connection.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={labelValue}
                          onChange={(e) => setLabelValue(e.target.value)}
                          placeholder="z.B. Max Mustermann"
                          style={{ flex: 1, fontSize: '1rem', padding: '0.25rem 0.5rem' }}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveLabel(connection.id);
                            if (e.key === 'Escape') handleCancelEditLabel();
                          }}
                        />
                        <button
                          className="btn btn-primary btn-small"
                          onClick={() => handleSaveLabel(connection.id)}
                          style={{ padding: '0.25rem 0.5rem' }}
                        >
                          ✓
                        </button>
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={handleCancelEditLabel}
                          style={{ padding: '0.25rem 0.5rem' }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong>{connection.label || connection.id.substring(0, 8)}</strong>
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => handleStartEditLabel(connection.id, connection.label)}
                          style={{ padding: '0.125rem 0.375rem', fontSize: '0.75rem' }}
                          title="Namen bearbeiten"
                        >
                          ✏️
                        </button>
                      </div>
                    )}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
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

                {/* Tags */}
                <div style={{ marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Tags:</span>
                    {connection.tagIds && connection.tagIds.length > 0 ? (
                      connection.tagIds.map((tagId) => {
                        const tag = appState.tags[tagId];
                        if (!tag) return null;
                        return (
                          <span
                            key={tagId}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              borderRadius: '0.25rem',
                              backgroundColor: tag.color + '20',
                              borderLeft: `3px solid ${tag.color}`,
                              cursor: 'pointer',
                            }}
                            onClick={() => handleToggleTag(connection.id, tagId)}
                            title="Klicken zum Entfernen"
                          >
                            {tag.name}
                            <span style={{ opacity: 0.6 }}>×</span>
                          </span>
                        );
                      })
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        Keine Tags
                      </span>
                    )}
                    {tags.length > 0 && (
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => setEditingTags(editingTags === connection.id ? null : connection.id)}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        {editingTags === connection.id ? '✓ Fertig' : '+ Tag hinzufügen'}
                      </button>
                    )}
                  </div>
                  {editingTags === connection.id && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {tags
                        .filter((tag) => !connection.tagIds?.includes(tag.id))
                        .map((tag) => (
                          <button
                            key={tag.id}
                            className="btn btn-secondary btn-small"
                            onClick={() => handleToggleTag(connection.id, tag.id)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              borderLeft: `3px solid ${tag.color}`,
                            }}
                          >
                            + {tag.name}
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                {connection.remoteCard && (
                  <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: 'var(--background)', borderRadius: '0.25rem' }}>
                    <strong>Empfangene Daten:</strong>
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {(connection.remoteCard.firstName || connection.remoteCard.lastName) && (
                        <div><strong>Name:</strong> {[connection.remoteCard.firstName, connection.remoteCard.lastName].filter(Boolean).join(' ')}</div>
                      )}
                      {connection.remoteCard.email && <div><strong>E-Mail:</strong> {connection.remoteCard.email}</div>}
                      {connection.remoteCard.phone && <div><strong>Telefon:</strong> {connection.remoteCard.phone}</div>}
                      {connection.remoteCard.street && <div><strong>Straße:</strong> {connection.remoteCard.street}</div>}
                      {(connection.remoteCard.postalCode || connection.remoteCard.city) && (
                        <div><strong>PLZ/Ort:</strong> {[connection.remoteCard.postalCode, connection.remoteCard.city].filter(Boolean).join(' ')}</div>
                      )}
                      {connection.remoteCard.country && <div><strong>Land:</strong> {connection.remoteCard.country}</div>}
                      {connection.remoteCard.birthday && <div><strong>Geburtstag:</strong> {new Date(connection.remoteCard.birthday).toLocaleDateString('de-DE')}</div>}
                      {connection.remoteCard.organization && <div><strong>Organisation:</strong> {connection.remoteCard.organization}</div>}
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
        ) : (
          /* List View - Kompakte Tabellenansicht */
          <div style={{ border: '1px solid var(--border)', borderRadius: '0.375rem', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: 'var(--background)', borderBottom: '2px solid var(--border)' }}>
                <tr>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600 }}>Name/Label</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600 }}>Kontakt</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600 }}>Letzte Sync</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: 600 }}>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filteredConnections.map((connection) => (
                  <tr
                    key={connection.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--background)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {/* Status Column */}
                    <td style={{ padding: '0.75rem', width: '5rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: '0.75rem',
                          height: '0.75rem',
                          borderRadius: '50%',
                          backgroundColor:
                            connection.status === 'online'
                              ? '#10b981'
                              : connection.status === 'syncing'
                              ? '#f59e0b'
                              : '#6b7280',
                        }}
                        title={
                          connection.status === 'online'
                            ? 'Online'
                            : connection.status === 'syncing'
                            ? 'Synchronisiert'
                            : 'Offline'
                        }
                      />
                    </td>

                    {/* Name/Label Column */}
                    <td style={{ padding: '0.75rem', minWidth: '12rem' }}>
                      {editingLabel === connection.id ? (
                        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                          <input
                            type="text"
                            value={labelValue}
                            onChange={(e) => setLabelValue(e.target.value)}
                            placeholder="Name/Label"
                            style={{
                              flex: 1,
                              fontSize: '0.875rem',
                              padding: '0.25rem 0.5rem',
                              minWidth: '8rem',
                            }}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveLabel(connection.id);
                              if (e.key === 'Escape') handleCancelEditLabel();
                            }}
                          />
                          <button
                            onClick={() => handleSaveLabel(connection.id)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              border: '1px solid var(--border)',
                              borderRadius: '0.25rem',
                              backgroundColor: 'var(--primary)',
                              color: 'white',
                            }}
                          >
                            ✓
                          </button>
                          <button
                            onClick={handleCancelEditLabel}
                            style={{
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              border: '1px solid var(--border)',
                              borderRadius: '0.25rem',
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                            {connection.label || connection.id.substring(0, 8)}
                          </span>
                          <button
                            onClick={() => handleStartEditLabel(connection.id, connection.label)}
                            style={{
                              padding: '0.125rem 0.25rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              border: '1px solid var(--border)',
                              borderRadius: '0.25rem',
                              backgroundColor: 'transparent',
                            }}
                            title="Namen bearbeiten"
                          >
                            ✏️
                          </button>
                        </div>
                      )}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>
                        {connection.id.substring(0, 12)}...
                      </div>
                      {/* Tags in List View */}
                      {connection.tagIds && connection.tagIds.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.375rem', flexWrap: 'wrap' }}>
                          {connection.tagIds.map((tagId) => {
                            const tag = appState.tags[tagId];
                            if (!tag) return null;
                            return (
                              <span
                                key={tagId}
                                style={{
                                  display: 'inline-block',
                                  padding: '0.125rem 0.375rem',
                                  fontSize: '0.625rem',
                                  borderRadius: '0.25rem',
                                  backgroundColor: tag.color + '20',
                                  borderLeft: `2px solid ${tag.color}`,
                                }}
                                title={tag.name}
                              >
                                {tag.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>

                    {/* Contact Column */}
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      {connection.remoteCard ? (
                        <div>
                          {(connection.remoteCard.firstName || connection.remoteCard.lastName) && (
                            <div style={{ fontWeight: 500 }}>
                              {[connection.remoteCard.firstName, connection.remoteCard.lastName]
                                .filter(Boolean)
                                .join(' ')}
                            </div>
                          )}
                          {connection.remoteCard.email && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              {connection.remoteCard.email}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          Keine Daten
                        </span>
                      )}
                    </td>

                    {/* Last Sync Column */}
                    <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {connection.lastSyncAt
                        ? new Date(connection.lastSyncAt).toLocaleString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>

                    {/* Actions Column */}
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                        {tags.length > 0 && (
                          <button
                            className="btn btn-secondary btn-small"
                            onClick={() => setEditingTags(editingTags === connection.id ? null : connection.id)}
                            title="Tags bearbeiten"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            🏷️
                          </button>
                        )}
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => onEditPolicy(connection.id)}
                          title="Freigabe bearbeiten"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          🔒
                        </button>
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => handleResync(connection.id)}
                          disabled={connection.status === 'offline'}
                          title="Resync"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          🔄
                        </button>
                        <button
                          className="btn btn-danger btn-small"
                          onClick={() => handleRemoveConnection(connection.id)}
                          title="Entfernen"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          ❌
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Tag-Auswahl Popup für List-View */}
            {editingTags && viewMode === 'list' && (
              <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '0.375rem', border: '1px solid var(--border)' }}>
                <h4 style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                  Tags bearbeiten für: {
                    (() => {
                      const conn = connections.find(c => c.id === editingTags);
                      return conn?.label || conn?.id.substring(0, 8);
                    })()
                  }
                </h4>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  {tags.map((tag) => {
                    const conn = connections.find(c => c.id === editingTags);
                    const isSelected = conn?.tagIds?.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        className={`btn btn-small ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => handleToggleTag(editingTags, tag.id)}
                        style={{
                          padding: '0.375rem 0.75rem',
                          fontSize: '0.875rem',
                          borderLeft: `3px solid ${tag.color}`,
                        }}
                      >
                        {isSelected ? '✓ ' : ''}{tag.name}
                      </button>
                    );
                  })}
                </div>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => setEditingTags(null)}
                >
                  ✓ Fertig
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
