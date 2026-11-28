/**
 * Startansicht: alle Kontakte mit Suche und Tag-Filter. Über „Auswählen“
 * lassen sich mehrere Kontakte auf einmal löschen oder mit einem Tag versehen.
 */

import { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Page, Avatar } from '../ui/Page';
import { href } from '../router';
import { searchContacts } from '../model/search';
import { contactName, contactState, contactSubtitle } from '../model/contact';
import { getLastBackupAt } from '../io/backup';
import { store } from '../store/automerge-store';
import { deleteCustody } from '../trust/custody';
import { ConfirmDialog } from '../ui/Dialog';

const BACKUP_REMINDER_DAYS = 30;

export const ContactsView: React.FC = () => {
  const { appState, serviceStatus, notify } = useAppContext();
  const [query, setQuery] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

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

  // Nur was es noch gibt, zählt als ausgewählt
  const selected = useMemo(
    () => picked.filter((id) => !!appState.connections[id]),
    [picked, appState.connections]
  );
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const hitIds = useMemo(() => hits.map((hit) => hit.connection.id), [hits]);
  const allHitsSelected = hitIds.length > 0 && hitIds.every((id) => selectedSet.has(id));
  const selectedLinked = selected.filter((id) => appState.connections[id].kind !== 'local').length;
  const selectedTrusted = selected.filter((id) => !!appState.trust?.members[id]).length;
  const removableTags = tags.filter((tag) =>
    selected.some((id) => (appState.connections[id].tagIds ?? []).includes(tag.id))
  );

  const togglePicked = (id: string) => {
    setPicked((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]));
  };
  const pickAllHits = () => setPicked((current) => [...new Set([...current, ...hitIds])]);
  const stopSelecting = () => {
    setSelecting(false);
    setPicked([]);
    setConfirmDelete(false);
  };
  const countLabel = (count: number) => `${count} ${count === 1 ? 'Kontakt' : 'Kontakte'}`;

  const addTag = async (tagId: string) => {
    const tag = appState.tags?.[tagId];
    if (!tag || selected.length === 0) return;
    const changed = await store.addTagToConnections(selected, tagId);
    notify(
      changed === 0
        ? `Alle ausgewählten Kontakte haben den Tag „${tag.name}“ schon.`
        : `Tag „${tag.name}“ an ${countLabel(changed)} vergeben.`
    );
  };

  const removeTag = async (tagId: string) => {
    const tag = appState.tags?.[tagId];
    if (!tag || selected.length === 0) return;
    const changed = await store.removeTagFromConnections(selected, tagId);
    notify(`Tag „${tag.name}“ bei ${changed === 1 ? '1 Kontakt' : `${changed} Kontakten`} entfernt.`);
  };

  const removeSelected = async () => {
    setConfirmDelete(false);
    if (selected.length === 0) return;
    setBusy(true);
    try {
      // Solange die Verbindung noch steht: Angaben bei den Kontakten zurückziehen
      const sharing = selected.filter((id) => {
        const connection = appState.connections[id];
        return connection.kind !== 'local' && connection.status === 'online' && connection.allowedFields.length > 0;
      });
      for (const id of sharing) await store.setShare(id, []);
      if (sharing.length > 0) await new Promise((resolve) => setTimeout(resolve, 600));
      await Promise.all(selected.map((id) => deleteCustody(id)));
      const removed = await store.removeConnections(selected);
      notify(`${countLabel(removed)} gelöscht.`);
      stopSelecting();
    } finally {
      setBusy(false);
    }
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
        selecting ? (
          <button type="button" className="btn" onClick={stopSelecting}>
            Fertig
          </button>
        ) : (
          <a className="btn btn-primary" href={href('verbinden')}>
            Kontakt verbinden
          </a>
        )
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

          <div className="actions" style={{ margin: 'var(--s-4) 0 var(--s-2)', alignItems: 'center' }}>
            <p className="small muted" style={{ margin: 0, marginRight: 'auto' }} aria-live="polite">
              {hits.length === connections.length
                ? `${connections.length} ${connections.length === 1 ? 'Kontakt' : 'Kontakte'}`
                : `${hits.length} von ${connections.length} Kontakten`}
            </p>
            {selecting ? (
              hits.length > 0 && (
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={allHitsSelected ? () => setPicked([]) : pickAllHits}
                >
                  {allHitsSelected
                    ? 'Auswahl aufheben'
                    : hits.length === connections.length
                      ? `Alle ${hits.length} auswählen`
                      : `Alle ${hits.length} Treffer auswählen`}
                </button>
              )
            ) : (
              <button type="button" className="btn btn-quiet" onClick={() => setSelecting(true)}>
                Auswählen
              </button>
            )}
          </div>

          {hits.length === 0 ? (
            <p className="empty">Nichts gefunden. Prüfe die Schreibweise oder entferne einen Filter.</p>
          ) : (
            <ul className="list">
              {hits.map(({ connection, matchLabel, matchValue }) => {
                const name = contactName(connection);
                const state = contactState(connection);
                const subtitle = matchLabel ? `${matchLabel}: ${matchValue}` : contactSubtitle(connection);
                const body = (
                  <>
                    <Avatar name={name} />
                    <span className="row-main">
                      <span className="row-title">{name}</span>
                      {subtitle && <span className="row-sub">{subtitle}</span>}
                    </span>
                    <span className={`state state-${state.kind}`}>{state.label}</span>
                  </>
                );
                return (
                  <li key={connection.id}>
                    {selecting ? (
                      <label className="row">
                        <input
                          type="checkbox"
                          className="row-check"
                          checked={selectedSet.has(connection.id)}
                          onChange={() => togglePicked(connection.id)}
                        />
                        {body}
                      </label>
                    ) : (
                      <a className="row" href={href('kontakt', connection.id)}>
                        {body}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {selecting && (
            <div className="form-bar bulk-bar" role="group" aria-label="Aktionen für die Auswahl">
              <span className="bulk-count" data-testid="bulk-count" aria-live="polite">
                {selected.length === 0 ? 'Nichts ausgewählt' : `${selected.length} ausgewählt`}
              </span>
              {tags.length > 0 && (
                <>
                  <label className="visually-hidden" htmlFor="bulk-tag-add">
                    Tag vergeben
                  </label>
                  <select
                    className="input"
                    id="bulk-tag-add"
                    value=""
                    disabled={selected.length === 0 || busy}
                    onChange={(event) => void addTag(event.target.value)}
                  >
                    <option value="">Tag vergeben …</option>
                    {tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {removableTags.length > 0 && (
                <>
                  <label className="visually-hidden" htmlFor="bulk-tag-remove">
                    Tag entfernen
                  </label>
                  <select
                    className="input"
                    id="bulk-tag-remove"
                    value=""
                    disabled={busy}
                    onChange={(event) => void removeTag(event.target.value)}
                  >
                    <option value="">Tag entfernen …</option>
                    {removableTags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <button
                type="button"
                className="btn btn-danger"
                disabled={selected.length === 0 || busy}
                onClick={() => setConfirmDelete(true)}
              >
                {busy ? 'Wird gelöscht …' : 'Löschen'}
              </button>
            </div>
          )}

          <ConfirmDialog
            open={confirmDelete}
            title={`${countLabel(selected.length)} löschen?`}
            confirmLabel={`${countLabel(selected.length)} löschen`}
            danger
            onConfirm={() => void removeSelected()}
            onCancel={() => setConfirmDelete(false)}
          >
            <p>
              Die Einträge und deine Notizen dazu werden von diesem Gerät gelöscht. Das lässt sich nicht
              rückgängig machen, außer über eine Sicherung.
            </p>
            {selectedLinked > 0 && (
              <p data-testid="bulk-linked">
                <strong>
                  {selectedLinked === 1
                    ? 'Einer davon ist ein verbundener Kontakt.'
                    : `${selectedLinked} davon sind verbundene Kontakte.`}
                </strong>{' '}
                Die Verbindung wird getrennt. Was diese Kontakte bereits von dir erhalten haben, lässt
                sich von hier aus nicht sicher löschen. Wer gerade nicht verbunden ist, behält deine
                Angaben.
              </p>
            )}
            {selectedTrusted > 0 && (
              <p>
                {selectedTrusted === 1
                  ? 'Einer davon ist eine Vertrauensperson'
                  : `${selectedTrusted} davon sind Vertrauenspersonen`}{' '}
                für deine Wiederherstellung und kann dir danach nicht mehr helfen.
              </p>
            )}
          </ConfirmDialog>

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
