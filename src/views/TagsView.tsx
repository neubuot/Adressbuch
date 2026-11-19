/**
 * Tags anlegen, umbenennen und löschen
 */

import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { Page, Section } from '../ui/Page';
import { ConfirmDialog } from '../ui/Dialog';
import { href } from '../router';
import { createUuid } from '../store/migrate';
import type { Tag } from '../types';

/** Gedeckte Farben, die in hellem und dunklem Schema erkennbar bleiben */
const TAG_COLORS = [
  { value: '#ef6a1f', name: 'Orange' },
  { value: '#c9a227', name: 'Gelb' },
  { value: '#4f8a5b', name: 'Grün' },
  { value: '#3f7fa6', name: 'Blau' },
  { value: '#8a63a8', name: 'Violett' },
  { value: '#b0483f', name: 'Rot' },
  { value: '#8a8780', name: 'Grau' },
];

const ColorChoice: React.FC<{ value: string; onChange: (value: string) => void; name: string }> = ({
  value,
  onChange,
  name,
}) => (
  <div className="chips" role="radiogroup" aria-label="Farbe">
    {TAG_COLORS.map((color) => (
      <label className="chip" key={color.value} style={{ position: 'relative' }}>
        <input
          type="radio"
          name={name}
          className="visually-hidden"
          checked={value === color.value}
          onChange={() => onChange(color.value)}
        />
        <span className="tag-dot" style={{ '--tag': color.value } as React.CSSProperties} />
        <span style={{ fontWeight: value === color.value ? 700 : 400 }}>
          {color.name}
          {value === color.value ? ' ✓' : ''}
        </span>
      </label>
    ))}
  </div>
);

export const TagsView: React.FC = () => {
  const { appState, notify } = useAppContext();
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0].value);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [deleting, setDeleting] = useState<Tag | null>(null);

  const tags = Object.values(appState.tags ?? {}).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const usage = (tagId: string) =>
    Object.values(appState.connections).filter((connection) => connection.tagIds?.includes(tagId)).length;

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await store.addTag(`tag-${createUuid()}`, trimmed, color);
    setName('');
    notify(`Tag „${trimmed}“ angelegt.`);
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || !editName.trim()) return;
    await store.updateTag(editing.id, { name: editName.trim(), color: editColor });
    setEditing(null);
    notify('Tag gespeichert.');
  };

  const remove = async () => {
    if (!deleting) return;
    const removedName = deleting.name;
    await store.removeTag(deleting.id);
    setDeleting(null);
    notify(`Tag „${removedName}“ gelöscht.`);
  };

  return (
    <Page
      title="Tags"
      lead="Mit Tags ordnest du Kontakte in Gruppen, z. B. Familie, Verein oder Arbeit. Tags sieht nur du."
      back={{ href: href('mehr'), label: 'Mehr' }}
    >
      <form className="stack" onSubmit={create}>
        <div className="field">
          <label className="field-label" htmlFor="tag-name">
            Neuer Tag
          </label>
          <input
            className="input"
            id="tag-name"
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <ColorChoice value={color} onChange={setColor} name="new-color" />
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
          Tag anlegen
        </button>
      </form>

      <Section title="Vorhandene Tags">
        {tags.length === 0 ? (
          <p className="muted">Noch keine Tags.</p>
        ) : (
          <ul className="list">
            {tags.map((tag) =>
              editing?.id === tag.id ? (
                <li key={tag.id} style={{ padding: 'var(--s-4) 0', borderBottom: '1px solid var(--c-line)' }}>
                  <form className="stack" onSubmit={saveEdit}>
                    <div className="field">
                      <label className="field-label" htmlFor="edit-tag-name">
                        Name
                      </label>
                      <input
                        className="input"
                        id="edit-tag-name"
                        value={editName}
                        maxLength={40}
                        onChange={(event) => setEditName(event.target.value)}
                      />
                    </div>
                    <ColorChoice value={editColor} onChange={setEditColor} name="edit-color" />
                    <div className="actions">
                      <button type="submit" className="btn btn-primary" disabled={!editName.trim()}>
                        Speichern
                      </button>
                      <button type="button" className="btn" onClick={() => setEditing(null)}>
                        Abbrechen
                      </button>
                    </div>
                  </form>
                </li>
              ) : (
                <li className="row" key={tag.id}>
                  <span className="tag-dot" style={{ '--tag': tag.color } as React.CSSProperties} />
                  <span className="row-main">
                    <span className="row-title">{tag.name}</span>
                    <span className="row-sub">
                      {usage(tag.id) === 1 ? '1 Kontakt' : `${usage(tag.id)} Kontakte`}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => {
                      setEditing(tag);
                      setEditName(tag.name);
                      setEditColor(tag.color);
                    }}
                  >
                    Ändern
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={() => setDeleting(tag)}>
                    Löschen
                  </button>
                </li>
              )
            )}
          </ul>
        )}
      </Section>

      <ConfirmDialog
        open={!!deleting}
        title={`Tag „${deleting?.name ?? ''}“ löschen?`}
        confirmLabel="Tag löschen"
        danger
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      >
        <p>Der Tag wird von allen Kontakten entfernt. Die Kontakte selbst bleiben erhalten.</p>
      </ConfirmDialog>
    </Page>
  );
};
