/**
 * Kontakte exportieren: Auswahl nach Tags, Reihenfolge, Format
 */

import { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Page, Section } from '../ui/Page';
import { href } from '../router';
import { contactName, todayIso } from '../model/contact';
import { downloadText } from '../io/backup';
import {
  exportCsv,
  exportJson,
  exportVCards,
  selectForExport,
  type ExportFormat,
  type ExportSort,
} from '../io/export';

const SORTS: Array<{ id: ExportSort; label: string }> = [
  { id: 'name', label: 'Name' },
  { id: 'createdAt', label: 'Angelegt am' },
  { id: 'lastSyncAt', label: 'Zuletzt abgeglichen' },
];

const FORMATS: Array<{ id: ExportFormat; label: string; description: string }> = [
  { id: 'csv', label: 'Tabelle (CSV)', description: 'Für Excel, Numbers und andere Tabellenprogramme' },
  { id: 'vcard', label: 'Kontaktdatei (vCard)', description: 'Für das Telefonbuch von Handy und Computer' },
  { id: 'json', label: 'JSON', description: 'Für die Weiterverarbeitung in anderen Programmen' },
];

export const ExportView: React.FC = () => {
  const { appState, notify } = useAppContext();
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<ExportSort>('name');
  const [descending, setDescending] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [includePrivate, setIncludePrivate] = useState(false);

  const tags = Object.values(appState.tags ?? {}).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const selected = useMemo(
    () =>
      selectForExport(Object.values(appState.connections), {
        tagIds,
        sortBy,
        descending,
        includePrivate,
      }),
    [appState.connections, tagIds, sortBy, descending, includePrivate]
  );

  const toggleTag = (tagId: string) =>
    setTagIds((current) => (current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId]));

  const run = () => {
    const date = todayIso();
    if (format === 'csv') {
      downloadText(exportCsv(selected, appState.tags ?? {}, includePrivate), `kontakte-${date}.csv`, 'text/csv;charset=utf-8');
    } else if (format === 'vcard') {
      downloadText(exportVCards(selected, includePrivate), `kontakte-${date}.vcf`, 'text/vcard;charset=utf-8');
    } else {
      downloadText(exportJson(selected, appState.tags ?? {}, includePrivate), `kontakte-${date}.json`, 'application/json');
    }
    notify(`${selected.length} ${selected.length === 1 ? 'Kontakt' : 'Kontakte'} exportiert.`);
  };

  return (
    <Page
      title="Kontakte exportieren"
      lead="Speichert deine Kontakte als Datei, z. B. für eine Liste oder ein anderes Programm."
      back={{ href: href('mehr'), label: 'Mehr' }}
    >
      <Section title="1 · Welche Kontakte?">
        {tags.length === 0 ? (
          <p className="muted">Alle Kontakte. Mit Tags kannst du hier später eine Auswahl treffen.</p>
        ) : (
          <>
            <p className="small muted" style={{ marginBottom: 'var(--s-3)' }}>
              Ohne Auswahl werden alle Kontakte exportiert, sonst nur die mit einem der gewählten Tags.
            </p>
            <div className="chips" role="group" aria-label="Nach Tags auswählen">
              {tags.map((tag) => (
                <button
                  type="button"
                  className="chip"
                  key={tag.id}
                  aria-pressed={tagIds.includes(tag.id)}
                  onClick={() => toggleTag(tag.id)}
                >
                  <span className="tag-dot" style={{ '--tag': tag.color } as React.CSSProperties} />
                  {tag.name}
                </button>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section title="2 · In welcher Reihenfolge?">
        <div className="stack">
          <div className="field">
            <label className="field-label" htmlFor="sort">
              Sortieren nach
            </label>
            <select
              className="input"
              id="sort"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as ExportSort)}
            >
              {SORTS.map((sort) => (
                <option key={sort.id} value={sort.id}>
                  {sort.label}
                </option>
              ))}
            </select>
          </div>
          <div className="segmented" role="radiogroup" aria-label="Richtung">
            <label>
              <input type="radio" name="direction" checked={!descending} onChange={() => setDescending(false)} />
              {sortBy === 'name' ? 'A bis Z' : 'Älteste zuerst'}
            </label>
            <label>
              <input type="radio" name="direction" checked={descending} onChange={() => setDescending(true)} />
              {sortBy === 'name' ? 'Z bis A' : 'Neueste zuerst'}
            </label>
          </div>
        </div>
      </Section>

      <Section title="3 · In welchem Format?">
        <div className="options">
          {FORMATS.map((option) => (
            <label className="option" key={option.id}>
              <input
                type="radio"
                name="format"
                checked={format === option.id}
                onChange={() => setFormat(option.id)}
              />
              <span className="option-text">
                <span className="option-title">{option.label}</span>
                <span className="option-desc">{option.description}</span>
              </span>
            </label>
          ))}
          <label className="option">
            <input
              type="checkbox"
              checked={includePrivate}
              onChange={(event) => setIncludePrivate(event.target.checked)}
            />
            <span className="option-text">
              <span className="option-title">Meine Notizen mit exportieren</span>
              <span className="option-desc">
                Notizen und eigene Angaben zu den Kontakten stehen dann lesbar in der Datei.
              </span>
            </span>
          </label>
        </div>
      </Section>

      <Section title="Vorschau">
        {selected.length === 0 ? (
          <p className="muted">Auf diese Auswahl passt kein Kontakt.</p>
        ) : (
          <>
            <p className="small muted" style={{ marginBottom: 'var(--s-2)' }}>
              {selected.length} {selected.length === 1 ? 'Kontakt' : 'Kontakte'} in dieser Reihenfolge:
            </p>
            <ol className="list">
              {selected.slice(0, 8).map((connection, index) => (
                <li className="row" style={{ minHeight: 'var(--control)' }} key={connection.id}>
                  <span className="muted small" style={{ width: '2rem' }}>
                    {index + 1}
                  </span>
                  <span className="row-main">{contactName(connection)}</span>
                </li>
              ))}
            </ol>
            {selected.length > 8 && (
              <p className="small muted" style={{ marginTop: 'var(--s-2)' }}>
                … und {selected.length - 8} weitere
              </p>
            )}
          </>
        )}
      </Section>

      <div className="form-bar">
        <button type="button" className="btn btn-primary" onClick={run} disabled={selected.length === 0}>
          Datei speichern
        </button>
        <span className="small muted">
          Die Datei ist nicht verschlüsselt. Bewahre sie entsprechend auf.
        </span>
      </div>
    </Page>
  );
};
