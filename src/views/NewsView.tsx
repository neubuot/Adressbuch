/**
 * Aktuelles: Geburtstage, lange nicht gesprochen und die Änderungen der Kontakte
 */

import { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { Page, Section, Avatar } from '../ui/Page';
import { ConfirmDialog } from '../ui/Dialog';
import { href } from '../router';
import { contactName, formatDate, longNoContact, upcomingBirthdays } from '../model/contact';
import { describeChange, getActivitySeenAt, markActivitySeen } from '../model/activity';
import { getFieldLabel } from '../model/fields';

function birthdayText(inDays: number, date: Date, turns?: number): string {
  const day = date.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
  const when = inDays === 0 ? 'Heute' : inDays === 1 ? 'Morgen' : `In ${inDays} Tagen, am ${day}`;
  return turns ? `${when} · wird ${turns}` : when;
}

export const NewsView: React.FC = () => {
  const { appState, notify } = useAppContext();
  const [seenAt] = useState(getActivitySeenAt);
  const [confirmClear, setConfirmClear] = useState(false);

  // Beim Öffnen gelten alle Änderungen als gesehen
  useEffect(() => {
    markActivitySeen();
    window.dispatchEvent(new Event('adressbuch:activity-seen'));
  }, [appState.activity?.length]);

  const connections = useMemo(() => Object.values(appState.connections), [appState.connections]);
  const birthdays = useMemo(() => upcomingBirthdays(connections, 30), [connections]);
  const quiet = useMemo(() => longNoContact(connections, 6).slice(0, 10), [connections]);
  const changes = useMemo(() => [...(appState.activity ?? [])].reverse(), [appState.activity]);
  const intros = useMemo(
    () =>
      Object.entries(appState.introsIn ?? {})
        .map(([fingerprint, intro]) => ({ fingerprint, intro }))
        .sort((a, b) => b.intro.receivedAt.localeCompare(a.intro.receivedAt)),
    [appState.introsIn]
  );

  const nothing = birthdays.length === 0 && quiet.length === 0 && changes.length === 0 && intros.length === 0;

  const dropIntro = async (fingerprint: string, name: string, accepted: boolean) => {
    await store.dropIntro(fingerprint);
    notify(accepted ? `Du wartest nicht mehr auf ${name}.` : `Vorstellung abgelehnt. ${name} erfährt davon nichts.`);
  };

  return (
    <Page title="Aktuelles">
      {nothing && (
        <p className="muted">
          Hier siehst du, wenn ein Kontakt etwas geändert hat, wenn dich jemand vorstellt, wer bald Geburtstag
          hat und bei wem du dich lange nicht gemeldet hast. Im Moment gibt es nichts Neues.
        </p>
      )}

      {intros.length > 0 && (
        <Section title="Vorstellungen">
          <ul className="list">
            {intros.map(({ fingerprint, intro }) => {
              const introducer = appState.connections[intro.fromId];
              const from = introducer ? contactName(introducer) : 'Ein früherer Kontakt';
              const name = intro.name || 'jemandem';
              const accepted = intro.status === 'accepted';
              return (
                <li className="row" key={fingerprint} data-testid="intro">
                  <Avatar name={name} />
                  <span className="row-main">
                    <span className="row-title">
                      {accepted ? `Du wartest auf ${name}` : `${from} möchte dich mit ${name} bekannt machen`}
                    </span>
                    <span className="row-sub">
                      {accepted
                        ? `Ihr werdet verbunden, sobald auch ${name} zugestimmt hat und ihr beide die App geöffnet habt.`
                        : `Vorgestellt am ${formatDate(intro.receivedAt)}. Erst wenn ihr beide zustimmt, werdet ihr verbunden.`}
                    </span>
                    <span className="actions" style={{ marginTop: 'var(--s-2)' }}>
                      {!accepted && (
                        <a className="btn btn-primary" href={href('vorstellung', fingerprint)}>
                          Annehmen
                        </a>
                      )}
                      <button type="button" className="btn btn-quiet" onClick={() => dropIntro(fingerprint, name, accepted)}>
                        {accepted ? 'Zurückziehen' : 'Ablehnen'}
                      </button>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {changes.length > 0 && (
        <Section title="Änderungen">
          <ul className="list">
            {changes.map((entry) => {
              const connection = appState.connections[entry.connectionId];
              const name = connection ? contactName(connection) : 'Ein früherer Kontakt';
              const text = describeChange(entry, name);
              const isNew = entry.at > seenAt;
              const body = (
                <>
                  <Avatar name={name} />
                  <span className="row-main">
                    <span className="row-title">
                      {text.sentence}
                      {isNew && <span className="visually-hidden"> (neu)</span>}
                    </span>
                    <span className="row-sub">
                      {entry.oldValue && <span className="was">{entry.oldValue}</span>}
                      {entry.oldValue && entry.newValue && ' → '}
                      {entry.newValue}
                      {!entry.oldValue && !entry.newValue && getFieldLabel(entry.field)}
                    </span>
                    <span className="row-sub">{formatDate(entry.at)}</span>
                  </span>
                  {isNew && (
                    <span className="badge" aria-hidden="true">
                      neu
                    </span>
                  )}
                </>
              );
              return (
                <li key={entry.id}>
                  {connection ? (
                    <a className="row" href={href('kontakt', connection.id)}>
                      {body}
                    </a>
                  ) : (
                    <div className="row">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="actions" style={{ marginTop: 'var(--s-4)' }}>
            <button type="button" className="btn btn-quiet" onClick={() => setConfirmClear(true)}>
              Liste leeren
            </button>
          </div>
        </Section>
      )}

      {birthdays.length > 0 && (
        <Section title="Geburtstage in den nächsten 30 Tagen">
          <ul className="list">
            {birthdays.map(({ connection, inDays, date, turns }) => {
              const name = contactName(connection);
              return (
                <li key={connection.id}>
                  <a className="row" href={href('kontakt', connection.id)}>
                    <Avatar name={name} />
                    <span className="row-main">
                      <span className="row-title">{name}</span>
                      <span className="row-sub">{birthdayText(inDays, date, turns)}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {quiet.length > 0 && (
        <Section title="Lange nicht gesprochen">
          <ul className="list">
            {quiet.map(({ connection, months }) => {
              const name = contactName(connection);
              return (
                <li key={connection.id}>
                  <a className="row" href={href('kontakt', connection.id)}>
                    <Avatar name={name} />
                    <span className="row-main">
                      <span className="row-title">{name}</span>
                      <span className="row-sub">
                        {months >= 24
                          ? `Seit über ${Math.floor(months / 12)} Jahren`
                          : months >= 12
                            ? 'Seit über einem Jahr'
                            : `Seit ${months} Monaten`}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          <p className="small muted" style={{ marginTop: 'var(--s-3)' }}>
            Grundlage ist das Datum „Zuletzt gesprochen am“, das du beim Kontakt einträgst.
          </p>
        </Section>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Liste der Änderungen leeren?"
        confirmLabel="Liste leeren"
        onConfirm={async () => {
          setConfirmClear(false);
          await store.clearActivity();
          notify('Die Liste ist leer.');
        }}
        onCancel={() => setConfirmClear(false)}
      >
        <p>Die Angaben deiner Kontakte bleiben unverändert. Nur dieser Verlauf wird gelöscht.</p>
      </ConfirmDialog>
    </Page>
  );
};
