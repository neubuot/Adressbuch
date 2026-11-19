/**
 * Startansicht: alle Kontakte mit Suche und Tag-Filter
 */

import { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Page, Avatar } from '../ui/Page';
import { href } from '../router';
import { searchContacts } from '../model/search';
import { contactName, contactState, contactSubtitle } from '../model/contact';
import { getLastBackupAt } from '../io/backup';

const BACKUP_REMINDER_DAYS = 30;

export const ContactsView: React.FC = () => {
  const { appState, serviceStatus } = useAppContext();
  const [query, setQuery] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);

  const connections = useMemo(() => Object.values(appState.connections), [appState.connections]);
  const tags = useMemo(
    () => Object.values(appState.tags ?? {}).sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [appState.tags]
  );
  const hits = useMemo(
    () => searchContacts(connections, appState.tags ?? {}, query, tagIds),
    [connections, appState.tags, query, tagIds]
  );

  const toggleTag = (tagId: string) => {
    setTagIds((current) =>
      current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId]
    );
  };

  const lastBackup = getLastBackupAt();
  const backupDue =
    connections.length > 0 &&
    (!lastBackup || Date.now() - new Date(lastBackup).getTime() > BACKUP_REMINDER_DAYS * 86400000);
  const hasLinked = connections.some((connection) => connection.kind !== 'local');

  return (
    <Page
      title="Kontakte"
      action={
        <a className="btn btn-primary" href={href('verbinden')}>
          Kontakt verbinden
        </a>
      }
    >
      {connections.length === 0 ? (
        <div className="stack">
          <p>
            Hier erscheinen die Menschen, mit denen du dich verbindest. Jeder pflegt nur seine eigene
            Karte. Ändert jemand seine Nummer oder Adresse, steht sie bei dir automatisch richtig.
          </p>
          <div className="actions">
            <a className="btn" href={href('karte')}>
              Meine Karte ausfüllen
            </a>
            <a className="btn" href={href('mehr', 'import')}>
              Vorhandene Kontakte übernehmen
            </a>
          </div>
        </div>
      ) : (
        <>
          <div className="stack">
            <div className="field">
              <label className="visually-hidden" htmlFor="search">
                Kontakte durchsuchen
              </label>
              <input
                className="input"
                id="search"
                type="search"
                placeholder="Suchen: Name, Ort, Nummer, Notiz …"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoComplete="off"
              />
            </div>

            {tags.length > 0 && (
              <div className="chips" role="group" aria-label="Nach Tags filtern">
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
            )}
          </div>

          <p className="small muted" style={{ margin: 'var(--s-4) 0 var(--s-2)' }} aria-live="polite">
            {hits.length === connections.length
              ? `${connections.length} ${connections.length === 1 ? 'Kontakt' : 'Kontakte'}`
              : `${hits.length} von ${connections.length} Kontakten`}
          </p>

          {hits.length === 0 ? (
            <p className="empty">Nichts gefunden. Prüfe die Schreibweise oder entferne einen Filter.</p>
          ) : (
            <ul className="list">
              {hits.map(({ connection, matchLabel, matchValue }) => {
                const name = contactName(connection);
                const state = contactState(connection);
                const subtitle = matchLabel ? `${matchLabel}: ${matchValue}` : contactSubtitle(connection);
                return (
                  <li key={connection.id}>
                    <a className="row" href={href('kontakt', connection.id)}>
                      <Avatar name={name} />
                      <span className="row-main">
                        <span className="row-title">{name}</span>
                        {subtitle && <span className="row-sub">{subtitle}</span>}
                      </span>
                      <span className={`state state-${state.kind}`}>{state.label}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}

          {hasLinked && serviceStatus === 'offline' && (
            <div className="note section">
              <p className="note-title">Gerade keine Verbindung</p>
              <p className="small">
                Deine Kontakte kannst du weiter ansehen. Neue Angaben kommen an, sobald du wieder
                online bist. Du musst nichts tun.
              </p>
            </div>
          )}

          {backupDue && (
            <div className="note section">
              <p className="note-title">Deine Daten liegen nur auf diesem Gerät</p>
              <p className="small">
                Geht das Gerät verloren oder werden die Browserdaten gelöscht, ist das Adressbuch weg.
                {lastBackup ? ' Deine letzte Sicherung ist älter als einen Monat.' : ' Du hast noch keine Sicherung.'}
              </p>
              <div className="actions">
                <a className="btn" href={href('mehr', 'sicherung')}>
                  Jetzt sichern
                </a>
              </div>
            </div>
          )}
        </>
      )}
    </Page>
  );
};
