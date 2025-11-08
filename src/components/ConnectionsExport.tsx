/**
 * ConnectionsExport-Komponente: Export von Verbindungen mit Filter und Sortierung
 */

import { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';

interface ConnectionsExportProps {
  onClose: () => void;
}

type SortOption = 'label' | 'createdAt' | 'lastSyncAt';
type ExportFormat = 'csv' | 'json';

export const ConnectionsExport: React.FC<ConnectionsExportProps> = ({ onClose }) => {
  const { appState } = useAppContext();
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('label');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');

  // Verfügbare Tags
  const availableTags = Object.values(appState.tags);

  // Toggle Tag-Auswahl
  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId));
    } else {
      setSelectedTagIds([...selectedTagIds, tagId]);
    }
  };

  // Alle Tags auswählen/abwählen
  const toggleAllTags = () => {
    if (selectedTagIds.length === availableTags.length) {
      setSelectedTagIds([]);
    } else {
      setSelectedTagIds(availableTags.map((tag) => tag.id));
    }
  };

  // Gefilterte und sortierte Connections
  const filteredAndSortedConnections = useMemo(() => {
    let connections = Object.values(appState.connections);

    // Filter nach Tags (wenn Tags ausgewählt sind)
    if (selectedTagIds.length > 0) {
      connections = connections.filter((conn) =>
        conn.tagIds?.some((tagId) => selectedTagIds.includes(tagId))
      );
    }

    // Sortierung
    connections.sort((a, b) => {
      let compareValue = 0;

      switch (sortBy) {
        case 'label':
          const labelA = (a.label || a.id).toLowerCase();
          const labelB = (b.label || b.id).toLowerCase();
          compareValue = labelA.localeCompare(labelB);
          break;
        case 'createdAt':
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          compareValue = dateA - dateB;
          break;
        case 'lastSyncAt':
          const syncA = a.lastSyncAt ? new Date(a.lastSyncAt).getTime() : 0;
          const syncB = b.lastSyncAt ? new Date(b.lastSyncAt).getTime() : 0;
          compareValue = syncA - syncB;
          break;
      }

      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

    return connections;
  }, [appState.connections, selectedTagIds, sortBy, sortOrder]);

  // CSV-Export
  const exportAsCSV = () => {
    const headers = [
      'ID',
      'Label',
      'Status',
      'Erstellt am',
      'Letzte Synchronisation',
      'Freigegebene Felder',
      'Tags',
    ];

    const rows = filteredAndSortedConnections.map((conn) => {
      const tags = conn.tagIds
        ?.map((tagId) => appState.tags[tagId]?.name || tagId)
        .join('; ') || '';

      return [
        conn.id,
        conn.label || '',
        conn.status,
        conn.createdAt ? new Date(conn.createdAt).toLocaleString('de-DE') : '',
        conn.lastSyncAt ? new Date(conn.lastSyncAt).toLocaleString('de-DE') : '',
        conn.allowedFields.join('; '),
        tags,
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    downloadFile(csvContent, 'connections.csv', 'text/csv');
  };

  // JSON-Export
  const exportAsJSON = () => {
    const exportData = filteredAndSortedConnections.map((conn) => ({
      id: conn.id,
      label: conn.label,
      status: conn.status,
      createdAt: conn.createdAt,
      lastSyncAt: conn.lastSyncAt,
      allowedFields: conn.allowedFields,
      tags: conn.tagIds?.map((tagId) => ({
        id: tagId,
        name: appState.tags[tagId]?.name || tagId,
        color: appState.tags[tagId]?.color,
      })),
      remoteCard: conn.remoteCard,
    }));

    const jsonContent = JSON.stringify(exportData, null, 2);
    downloadFile(jsonContent, 'connections.json', 'application/json');
  };

  // Download-Hilfsfunktion
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export durchführen
  const handleExport = () => {
    if (filteredAndSortedConnections.length === 0) {
      alert('Keine Verbindungen zum Exportieren gefunden!');
      return;
    }

    if (exportFormat === 'csv') {
      exportAsCSV();
    } else {
      exportAsJSON();
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem' }}>
        <button className="btn btn-secondary btn-small" onClick={onClose}>
          ← Zurück
        </button>
        <h2 style={{ marginLeft: '1rem' }}>Verbindungen exportieren</h2>
      </div>

      <div className="grid grid-2">
        {/* Linke Spalte: Filter und Sortierung */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Filter und Sortierung</h3>

          {/* Tag-Filter */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '0.875rem' }}>Tags:</strong>
              <button
                className="btn btn-secondary btn-small"
                onClick={toggleAllTags}
              >
                {selectedTagIds.length === availableTags.length ? 'Alle abwählen' : 'Alle auswählen'}
              </button>
            </div>

            {availableTags.length === 0 ? (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Keine Tags vorhanden
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {availableTags.map((tag) => (
                  <label
                    key={tag.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      cursor: 'pointer',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      backgroundColor: selectedTagIds.includes(tag.id)
                        ? 'var(--background)'
                        : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTagIds.includes(tag.id)}
                      onChange={() => toggleTag(tag.id)}
                    />
                    <span
                      style={{
                        display: 'inline-block',
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: tag.color,
                      }}
                    />
                    <span>{tag.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Sortierung */}
          <div style={{ marginBottom: '1.5rem' }}>
            <strong style={{ fontSize: '0.875rem', display: 'block', marginBottom: '0.5rem' }}>
              Sortieren nach:
            </strong>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              style={{
                width: '100%',
                padding: '0.5rem',
                marginBottom: '0.5rem',
                borderRadius: '0.25rem',
                border: '1px solid var(--border)',
              }}
            >
              <option value="label">Name/Label</option>
              <option value="createdAt">Erstellungsdatum</option>
              <option value="lastSyncAt">Letzte Synchronisation</option>
            </select>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className={`btn ${sortOrder === 'asc' ? 'btn-primary' : 'btn-secondary'} btn-small`}
                onClick={() => setSortOrder('asc')}
              >
                Aufsteigend
              </button>
              <button
                className={`btn ${sortOrder === 'desc' ? 'btn-primary' : 'btn-secondary'} btn-small`}
                onClick={() => setSortOrder('desc')}
              >
                Absteigend
              </button>
            </div>
          </div>

          {/* Export-Format */}
          <div>
            <strong style={{ fontSize: '0.875rem', display: 'block', marginBottom: '0.5rem' }}>
              Export-Format:
            </strong>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className={`btn ${exportFormat === 'csv' ? 'btn-primary' : 'btn-secondary'} btn-small`}
                onClick={() => setExportFormat('csv')}
              >
                CSV
              </button>
              <button
                className={`btn ${exportFormat === 'json' ? 'btn-primary' : 'btn-secondary'} btn-small`}
                onClick={() => setExportFormat('json')}
              >
                JSON
              </button>
            </div>
          </div>
        </div>

        {/* Rechte Spalte: Vorschau */}
        <div className="card" style={{ backgroundColor: '#f0f9ff' }}>
          <h3 style={{ marginBottom: '1rem' }}>Vorschau</h3>

          <div style={{ marginBottom: '1rem' }}>
            <strong>
              {filteredAndSortedConnections.length} Verbindung(en) werden exportiert
            </strong>
          </div>

          <div
            style={{
              maxHeight: '400px',
              overflowY: 'auto',
              fontSize: '0.875rem',
            }}
          >
            {filteredAndSortedConnections.length === 0 ? (
              <div className="empty-state">
                <p>Keine Verbindungen gefunden</p>
                <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  {selectedTagIds.length > 0
                    ? 'Versuche andere Tag-Filter auszuwählen'
                    : 'Es sind noch keine Verbindungen vorhanden'}
                </p>
              </div>
            ) : (
              <ol style={{ paddingLeft: '1.5rem', margin: 0 }}>
                {filteredAndSortedConnections.map((conn) => (
                  <li key={conn.id} style={{ marginBottom: '0.5rem' }}>
                    <strong>{conn.label || conn.id.substring(0, 8)}</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Status: {conn.status} | Felder: {conn.allowedFields.length}
                      {conn.tagIds && conn.tagIds.length > 0 && (
                        <span>
                          {' | Tags: '}
                          {conn.tagIds
                            .map((tagId) => appState.tags[tagId]?.name || tagId)
                            .join(', ')}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>

      {/* Export-Button */}
      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
        <button
          className="btn btn-primary"
          onClick={handleExport}
          disabled={filteredAndSortedConnections.length === 0}
        >
          Exportieren ({exportFormat.toUpperCase()})
        </button>
        <button className="btn btn-secondary" onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </div>
  );
};
