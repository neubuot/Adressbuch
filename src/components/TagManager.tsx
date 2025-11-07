/**
 * TagManager-Komponente: Verwaltung von Tags
 */

import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import type { Tag } from '../types';

interface TagManagerProps {
  onClose: () => void;
}

// Vordefinierte Farben
const PRESET_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
];

export const TagManager: React.FC<TagManagerProps> = ({ onClose }) => {
  const { appState } = useAppContext();
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const tags = Object.values(appState.tags);

  const handleCreateTag = async () => {
    if (newTagName.trim()) {
      const id = `tag-${Date.now()}`;
      await store.addTag(id, newTagName.trim(), newTagColor);
      setNewTagName('');
      setNewTagColor(PRESET_COLORS[0]);
    }
  };

  const handleStartEdit = (tag: Tag) => {
    setEditingTag(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  const handleSaveEdit = async () => {
    if (editingTag && editName.trim()) {
      await store.updateTag(editingTag, {
        name: editName.trim(),
        color: editColor,
      });
      setEditingTag(null);
      setEditName('');
      setEditColor('');
    }
  };

  const handleCancelEdit = () => {
    setEditingTag(null);
    setEditName('');
    setEditColor('');
  };

  const handleDeleteTag = async (tagId: string) => {
    if (confirm('Möchtest du diesen Tag wirklich löschen? Er wird von allen Verbindungen entfernt.')) {
      await store.removeTag(tagId);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2>Tags verwalten</h2>
          <button className="btn btn-secondary btn-small" onClick={onClose}>
            ✕ Schließen
          </button>
        </div>

        {/* Tag erstellen */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '0.375rem' }}>
          <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Neuen Tag erstellen</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: '200px', marginBottom: 0 }}>
              <label htmlFor="newTagName">Name</label>
              <input
                id="newTagName"
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="z.B. Arbeit, Familie, Freunde"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateTag();
                }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="newTagColor">Farbe</label>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewTagColor(color)}
                    style={{
                      width: '2rem',
                      height: '2rem',
                      borderRadius: '0.25rem',
                      backgroundColor: color,
                      border: newTagColor === color ? '2px solid white' : '1px solid var(--border)',
                      boxShadow: newTagColor === color ? '0 0 0 2px ' + color : 'none',
                      cursor: 'pointer',
                    }}
                    title={color}
                  />
                ))}
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleCreateTag}
              disabled={!newTagName.trim()}
            >
              + Erstellen
            </button>
          </div>
        </div>

        {/* Tag-Liste */}
        <div>
          <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Vorhandene Tags ({tags.length})</h3>
          {tags.length === 0 ? (
            <div className="empty-state">
              <p>Noch keine Tags vorhanden</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  style={{
                    padding: '0.75rem',
                    border: '1px solid var(--border)',
                    borderRadius: '0.375rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  {editingTag === tag.id ? (
                    <>
                      {/* Edit Mode */}
                      <div style={{ display: 'flex', gap: '0.5rem', flex: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={{ flex: 1, minWidth: '150px', padding: '0.375rem 0.5rem' }}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit();
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                        />
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color}
                              onClick={() => setEditColor(color)}
                              style={{
                                width: '1.5rem',
                                height: '1.5rem',
                                borderRadius: '0.25rem',
                                backgroundColor: color,
                                border: editColor === color ? '2px solid white' : '1px solid var(--border)',
                                boxShadow: editColor === color ? '0 0 0 2px ' + color : 'none',
                                cursor: 'pointer',
                              }}
                              title={color}
                            />
                          ))}
                        </div>
                        <button
                          className="btn btn-primary btn-small"
                          onClick={handleSaveEdit}
                          style={{ padding: '0.25rem 0.5rem' }}
                        >
                          ✓
                        </button>
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={handleCancelEdit}
                          style={{ padding: '0.25rem 0.5rem' }}
                        >
                          ✕
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Display Mode */}
                      <div
                        style={{
                          width: '1.5rem',
                          height: '1.5rem',
                          borderRadius: '0.25rem',
                          backgroundColor: tag.color,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ flex: 1, fontWeight: 500 }}>{tag.name}</span>
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => handleStartEdit(tag)}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        ✏️ Bearbeiten
                      </button>
                      <button
                        className="btn btn-danger btn-small"
                        onClick={() => handleDeleteTag(tag.id)}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        🗑️ Löschen
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
