/**
 * Ein Kontakt: Angaben, direkte Aktionen, Freigabe aus dessen Sicht,
 * private Notizen, Tags und Verlauf.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { Page, Section, Avatar } from '../ui/Page';
import { CardFacts } from '../ui/CardFacts';
import { CardForm } from '../ui/CardForm';
import { ConfirmDialog } from '../ui/Dialog';
import { href, navigate } from '../router';
import {
  contactName,
  contactState,
  formatDate,
  formatDateTime,
  todayIso,
} from '../model/contact';
import { describeShare, PRIVATE_FIELDS, getFieldLabel } from '../model/fields';
import { describeChange } from '../model/activity';
import { activeLimit, effectiveFields, projectFields, sanitizeLimit } from '../utils/policy';
import { mailHref, mapHref, phoneHref, saveToAddressBook } from '../model/actions';
import { ADDRESS_CARD_FIELDS, type AddressCardField, type ContactPrivate, type ContactPrivateField, type RemoteCard } from '../types';
import { mergeRecords } from '../model/merge';

type Dialog = 'revoke' | 'remove' | null;

export const ContactView: React.FC<{ connectionId: string }> = ({ connectionId }) => {
  const { appState, notify } = useAppContext();
  const connection = appState.connections[connectionId];

  const [privateValues, setPrivateValues] = useState<Partial<ContactPrivate>>({});
  const [label, setLabel] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<RemoteCard>({});

  useEffect(() => {
    setPrivateValues({ ...(connection?.private ?? {}) });
    setLabel(connection?.label ?? '');
    setEditing(false);
    // nur beim Wechsel des Kontakts neu befüllen, nicht bei jeder Änderung
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  const changes = useMemo(
    () =>
      (appState.activity ?? [])
        .filter((entry) => entry.connectionId === connectionId)
        .slice(-5)
        .reverse(),
    [appState.activity, connectionId]
  );

  if (!connection) {
    return (
      <Page title="Kontakt" back={{ href: href(), label: 'Kontakte' }}>
        <p>Diesen Kontakt gibt es nicht (mehr).</p>
      </Page>
    );
  }

  const name = contactName(connection);
  const state = contactState(connection);
  const isLocal = connection.kind === 'local';
  const card = connection.remoteCard;
  const hasCard = !!card && Object.keys(card).length > 0;
  const sharedFields = effectiveFields(connection);
  const shared = projectFields(appState.myCard, sharedFields);
  const limit = activeLimit(connection);
  const remoteLimit = sanitizeLimit(connection.remoteUntil, connection.remoteKeep);
  const tags = Object.values(appState.tags ?? {}).sort((a, b) => a.name.localeCompare(b.name, 'de'));

  // Weitere E-Mail-Adressen und Nummern aus den Quellen, die nicht in die Karte passen
  const shown = new Set(Object.values(card ?? {}).map((value) => String(value).trim().toLowerCase()));
  const moreEmails: string[] = [];
  const morePhones: string[] = [];
  for (const record of Object.values(connection.records ?? {})) {
    for (const email of record.extra?.emails ?? []) {
      if (!shown.has(email.toLowerCase()) && !moreEmails.includes(email)) moreEmails.push(email);
    }
    for (const phone of record.extra?.phones ?? []) {
      if (!shown.has(phone.toLowerCase()) && !morePhones.includes(phone)) morePhones.push(phone);
    }
  }

  // Bei verbundenen Kontakten: eigene Unterlagen zu Feldern, die die Person nicht freigibt
  const ownNotes: RemoteCard = {};
  if (!isLocal && connection.records) {
    const imported = mergeRecords(connection.records, appState.sources);
    for (const field of ADDRESS_CARD_FIELDS) {
      if (imported[field] && !card?.[field]) ownNotes[field] = imported[field];
    }
  }
  const hasOwnNotes = Object.keys(ownNotes).length > 0;
  const mergedEntries = connection.merged ?? [];

  const split = async (mergedId: string, mergedName: string) => {
    const newId = await store.splitContact(connectionId, mergedId);
    notify(newId ? `${mergedName} ist wieder ein eigener Eintrag.` : 'Das hat nicht geklappt.');
  };

  const tel = phoneHref(card);
  const mail = mailHref(card);
  const map = mapHref(card);

  const savePrivate = async (field: ContactPrivateField, value: string) => {
    if ((connection.private?.[field] ?? '') === value) return;
    await store.updateContactPrivate(connectionId, { [field]: value });
    notify('Notiz gespeichert. Sie bleibt nur auf diesem Gerät.');
  };

  const saveLabel = async () => {
    const trimmed = label.trim();
    if ((connection.label ?? '') === trimmed) return;
    await store.updateConnection(connectionId, { label: trimmed || undefined });
    notify('Bezeichnung gespeichert.');
  };

  const toggleTag = async (tagId: string) => {
    if (connection.tagIds?.includes(tagId)) {
      await store.removeTagsFromConnection(connectionId, [tagId]);
    } else {
      await store.addTagsToConnection(connectionId, [tagId]);
    }
  };

  const spokenToday = async () => {
    const today = todayIso();
    setPrivateValues((current) => ({ ...current, lastContactAt: today }));
    await savePrivate('lastContactAt', today);
  };

  const saveToPhone = async () => {
    if (!card) return;
    const result = await saveToAddressBook(card, name);
    if (result === 'downloaded') {
      notify('Als Kontaktdatei gespeichert. Öffne die Datei, um sie ins Telefonbuch zu übernehmen.');
    }
  };

  const revoke = async () => {
    setDialog(null);
    await store.setShare(connectionId, []);
    notify(`Freigabe widerrufen. ${name} erhält ab jetzt nichts mehr von dir.`);
  };

  const remove = async () => {
    setDialog(null);
    if (!isLocal && connection.status === 'online' && connection.allowedFields.length > 0) {
      // Solange die Verbindung noch steht: Angaben beim Kontakt zurückziehen
      await store.setShare(connectionId, []);
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    await store.removeConnection(connectionId);
    notify(`${name} wurde entfernt.`);
    navigate();
  };

  const startEdit = () => {
    setEditValues({ ...(card ?? {}) });
    setEditing(true);
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned: RemoteCard = {};
    for (const [key, value] of Object.entries(editValues)) {
      if (typeof value === 'string' && value.trim()) cleaned[key as AddressCardField] = value.trim();
    }
    if (isLocal) await store.editLocalCard(connectionId, cleaned);
    else await store.updateConnection(connectionId, { remoteCard: cleaned });
    setEditing(false);
    notify('Gespeichert.');
  };

  if (editing) {
    return (
      <Page title={`${name} bearbeiten`} back={{ href: href('kontakt', connectionId), label: name }}>
        <form onSubmit={saveEdit} noValidate>
          <CardForm
            values={editValues}
            onChange={(field, value) => setEditValues((current) => ({ ...current, [field]: value }))}
            idPrefix="edit-"
          />
          <div className="form-bar">
            <button type="submit" className="btn btn-primary">
              Speichern
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setEditing(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      </Page>
    );
  }

  return (
    <Page title={name} back={{ href: href(), label: 'Kontakte' }}>
      <div className="row" style={{ borderBottom: 0, paddingTop: 0 }}>
        <Avatar name={name} large />
        <div className="row-main">
          <p className={`state state-${state.kind}`}>{state.label}</p>
          <p className="small muted">{state.detail}</p>
        </div>
      </div>

      {(tel || mail || map || hasCard) && (
        <div className="actions-grid" style={{ marginTop: 'var(--s-4)' }}>
          {tel && (
            <a className="btn" href={tel}>
              Anrufen
            </a>
          )}
          {mail && (
            <a className="btn" href={mail}>
              E-Mail
            </a>
          )}
          {map && (
            <a className="btn" href={map} target="_blank" rel="noopener noreferrer">
              Karte
            </a>
          )}
          {hasCard && (
            <button type="button" className="btn" onClick={saveToPhone}>
              Ins Telefonbuch
            </button>
          )}
        </div>
      )}

      {isLocal && (
        <div className="note section">
          <p className="note-title">Noch nicht verbunden</p>
          <p className="small">
            Lade {name} ein. Danach hält sich dieser Eintrag von selbst aktuell; deine Notizen und
            Tags bleiben erhalten.
          </p>
          <div className="actions">
            <a className="btn btn-primary" href={href('verbinden', 'fuer', connectionId)}>
              Einladen und verbinden
            </a>
          </div>
        </div>
      )}

      <Section title="Angaben">
        {hasCard ? (
          <>
            <CardFacts card={card} />
            {!isLocal && remoteLimit && (
              <p className="small muted" style={{ marginTop: 'var(--s-3)' }} data-testid="remote-limit">
                {name} gibt dir diese Angaben bis zum {formatDate(remoteLimit.until)} frei.{' '}
                {remoteLimit.keep.length > 0
                  ? 'Danach bleibt hier nur noch der Name stehen.'
                  : 'Danach verschwinden sie hier von selbst.'}
              </p>
            )}
          </>
        ) : (
          <p className="muted">
            {isLocal
              ? 'Zu diesem Eintrag gibt es noch keine Angaben.'
              : connection.lastSyncAt
                ? `${name} gibt dir im Moment keine Angaben frei.`
                : `Die Angaben von ${name} kommen an, sobald ihr beide die App geöffnet habt.`}
          </p>
        )}
        {isLocal && (
          <div className="actions" style={{ marginTop: 'var(--s-4)' }}>
            <button type="button" className="btn" onClick={startEdit}>
              Angaben bearbeiten
            </button>
          </div>
        )}
      </Section>

      {(moreEmails.length > 0 || morePhones.length > 0) && (
        <Section title="Weitere Angaben">
          <dl className="facts">
            {morePhones.map((phone) => (
              <div className="fact" key={phone}>
                <dt>Telefon</dt>
                <dd>
                  <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a>
                </dd>
              </div>
            ))}
            {moreEmails.map((email) => (
              <div className="fact" key={email}>
                <dt>E-Mail</dt>
                <dd>
                  <a href={`mailto:${encodeURIComponent(email).replace(/%40/g, '@')}`}>{email}</a>
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {hasOwnNotes && (
        <Section title="Aus deinen eigenen Unterlagen">
          <p className="small muted" style={{ marginBottom: 'var(--s-3)' }}>
            Diese Angaben hast du selbst übernommen. {name} gibt sie dir nicht frei; sie halten sich deshalb nicht von
            selbst aktuell.
          </p>
          <CardFacts card={ownNotes} />
        </Section>
      )}

      {mergedEntries.length > 0 && (
        <Section title="Zusammengeführt">
          <ul className="list">
            {mergedEntries.map((entry) => {
              const mergedName = entry.label || entry.knownName || 'Eintrag';
              return (
                <li className="row" style={{ minHeight: 'var(--control)' }} key={entry.id}>
                  <span className="row-main">
                    <span className="row-title">{mergedName}</span>
                    <span className="row-sub">zusammengeführt am {formatDate(entry.at)}</span>
                  </span>
                  <button type="button" className="btn btn-quiet" onClick={() => split(entry.id, mergedName)}>
                    Wieder trennen
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {!isLocal && (
        <Section title={`Was ${name} von mir sieht`}>
          <p className="strong">{describeShare(sharedFields)}</p>
          {limit && (
            <p className="small" data-testid="share-limit">
              Befristet bis zum {formatDate(limit.until)}. Danach:{' '}
              {limit.keep.length > 0 ? 'nur noch dein Name' : 'nichts mehr'}.
            </p>
          )}
          {Object.keys(shared).length > 0 ? (
            <div style={{ marginTop: 'var(--s-3)' }}>
              <CardFacts card={shared} plain />
            </div>
          ) : (
            <p className="muted small">
              {sharedFields.length === 0
                ? `${name} sieht nichts von dir.`
                : 'Die freigegebenen Angaben sind auf deiner Karte noch leer.'}
            </p>
          )}
          <div className="actions" style={{ marginTop: 'var(--s-4)' }}>
            <a className="btn" href={href('kontakt', connectionId, 'freigabe')}>
              Freigabe ändern
            </a>
          </div>
        </Section>
      )}

      <Section title="Meine Notizen · nur für mich">
        <div className="stack">
          <div className="field">
            <label className="field-label" htmlFor="notes">
              Notizen
            </label>
            <textarea
              className="input"
              id="notes"
              value={privateValues.notes ?? ''}
              onChange={(event) => setPrivateValues((c) => ({ ...c, notes: event.target.value }))}
              onBlur={(event) => savePrivate('notes', event.target.value)}
            />
            <span className="field-hint">
              Notizen und die Angaben darunter werden nie übertragen.
            </span>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="lastContactAt">
              Zuletzt gesprochen am
            </label>
            <div className="actions">
              <input
                className="input"
                style={{ flex: '1 1 10rem', width: 'auto' }}
                id="lastContactAt"
                type="date"
                value={privateValues.lastContactAt ?? ''}
                onChange={(event) => {
                  setPrivateValues((c) => ({ ...c, lastContactAt: event.target.value }));
                  void savePrivate('lastContactAt', event.target.value);
                }}
              />
              <button type="button" className="btn" onClick={spokenToday}>
                Heute gesprochen
              </button>
            </div>
          </div>

          <details className="group">
            <summary>Woher kenne ich {name}?</summary>
            <div className="group-body">
              <div className="form-grid">
                {PRIVATE_FIELDS.filter((f) => f.key !== 'notes' && f.key !== 'lastContactAt').map((field) => (
                  <div className="field" key={field.key}>
                    <label className="field-label" htmlFor={field.key}>
                      {field.label}
                    </label>
                    <input
                      className="input"
                      id={field.key}
                      type={field.input === 'date' ? 'date' : 'text'}
                      value={privateValues[field.key] ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setPrivateValues((c) => ({ ...c, [field.key]: value }));
                        if (field.input === 'date') void savePrivate(field.key, value);
                      }}
                      onBlur={(event) => savePrivate(field.key, event.target.value)}
                    />
                  </div>
                ))}
                <div className="field span-2">
                  <label className="field-label" htmlFor="label">
                    Eigene Bezeichnung
                  </label>
                  <input
                    className="input"
                    id="label"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    onBlur={saveLabel}
                  />
                  <span className="field-hint">
                    Wird statt des Namens angezeigt, z. B. „Mama“. Leer lassen für den Namen von der Karte.
                  </span>
                </div>
              </div>
            </div>
          </details>
        </div>
      </Section>

      <Section title="Tags">
        {tags.length > 0 ? (
          <div className="chips" role="group" aria-label="Tags dieses Kontakts">
            {tags.map((tag) => (
              <button
                type="button"
                className="chip"
                key={tag.id}
                aria-pressed={!!connection.tagIds?.includes(tag.id)}
                onClick={() => toggleTag(tag.id)}
              >
                <span className="tag-dot" style={{ '--tag': tag.color } as React.CSSProperties} />
                {tag.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">Mit Tags ordnest du Kontakte, z. B. „Familie“ oder „Verein“.</p>
        )}
        <p style={{ marginTop: 'var(--s-3)' }}>
          <a className="small" href={href('mehr', 'tags')}>
            Tags verwalten
          </a>
        </p>
      </Section>

      <Section title="Verlauf">
        <dl className="facts">
          <div className="fact">
            <dt>Angelegt am</dt>
            <dd>{connection.createdAt ? formatDate(connection.createdAt) : 'nicht bekannt'}</dd>
          </div>
          {!isLocal && (
            <div className="fact">
              <dt>Zuletzt abgeglichen</dt>
              <dd>{connection.lastSyncAt ? formatDateTime(connection.lastSyncAt) : 'noch nie'}</dd>
            </div>
          )}
        </dl>
        {changes.length > 0 && (
          <ul className="list" style={{ borderTop: 0 }}>
            {changes.map((entry) => {
              const text = describeChange(entry, name);
              return (
                <li className="row" key={entry.id}>
                  <span className="row-main">
                    <span className="row-title">{text.sentence}</span>
                    <span className="row-sub">
                      {entry.oldValue && <span className="was">{entry.oldValue}</span>}
                      {entry.oldValue && entry.newValue && ' → '}
                      {entry.newValue}
                      {!entry.oldValue && !entry.newValue && getFieldLabel(entry.field)}
                    </span>
                  </span>
                  <span className="row-end">{formatDate(entry.at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={isLocal ? 'Eintrag' : 'Verbindung'}>
        <div className="actions">
          {!isLocal && (
            <a className="btn" href={href('kontakt', connectionId, 'vorstellen')}>
              Jemandem vorstellen
            </a>
          )}
          {!isLocal && sharedFields.length > 0 && (
            <button type="button" className="btn" onClick={() => setDialog('revoke')}>
              Freigabe widerrufen
            </button>
          )}
          <button type="button" className="btn btn-danger" onClick={() => setDialog('remove')}>
            {isLocal ? 'Eintrag löschen' : 'Kontakt entfernen'}
          </button>
        </div>
      </Section>

      <ConfirmDialog
        open={dialog === 'revoke'}
        title={`Freigabe für ${name} widerrufen?`}
        confirmLabel="Freigabe widerrufen"
        danger
        onConfirm={revoke}
        onCancel={() => setDialog(null)}
      >
        <p>
          {name} erhält ab sofort keine Angaben mehr von dir. In der App von {name} verschwinden deine
          Angaben beim nächsten Abgleich.
        </p>
        <p>
          <strong>Ehrlich gesagt:</strong> Was {name} bereits gesehen, abgeschrieben, exportiert oder
          ins eigene Telefonbuch übernommen hat, lässt sich nicht zurückholen.
        </p>
        <p className="small muted">
          Ihr bleibt verbunden; du siehst weiterhin, was {name} dir freigibt, und kannst die Freigabe
          jederzeit wieder erteilen.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'remove'}
        title={isLocal ? `${name} löschen?` : `${name} entfernen?`}
        confirmLabel={isLocal ? 'Eintrag löschen' : 'Kontakt entfernen'}
        danger
        onConfirm={remove}
        onCancel={() => setDialog(null)}
      >
        {isLocal ? (
          <p>Der Eintrag und deine Notizen dazu werden von diesem Gerät gelöscht.</p>
        ) : (
          <>
            <p>
              Die Verbindung wird getrennt. Die Angaben von {name} und deine Notizen dazu werden von
              diesem Gerät gelöscht; {name} erhält keine Änderungen mehr von dir.
            </p>
            <p>
              <strong>Ehrlich gesagt:</strong> Was {name} bereits von dir erhalten hat, lässt sich von
              hier aus nicht sicher löschen. Ist {name} gerade nicht verbunden, bleiben deine Angaben
              dort stehen.
            </p>
          </>
        )}
      </ConfirmDialog>
    </Page>
  );
};
