/**
 * Doppelte Einträge: Paare, die vermutlich dieselbe Person sind.
 * Zusammengeführt wird nur auf Wunsch; dabei geht nichts verloren, und
 * beim Kontakt lässt es sich wieder trennen.
 */

import { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { Page } from '../ui/Page';
import { href } from '../router';
import { contactName, contactState } from '../model/contact';
import { MATCH_REASON_TEXT, findDuplicates, type DuplicatePair } from '../model/dedupe';
import type { Connection } from '../types';

function summary(connection: Connection): string {
  const card = connection.remoteCard ?? {};
  return [
    card.organization,
    card.city,
    card.phoneMobile || card.phoneWork,
    card.emailPrivate || card.emailWork,
  ]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' · ');
}

export const DuplicatesView: React.FC = () => {
  const { appState, notify } = useAppContext();
  const [busy, setBusy] = useState(false);

  const pairs = useMemo(
    () => findDuplicates(appState.connections ?? {}, appState.notDuplicates),
    [appState.connections, appState.notDuplicates]
  );

  /** Behalten wird der verbundene Kontakt, sonst der ältere Eintrag */
  const order = (pair: DuplicatePair): [Connection, Connection] | null => {
    const a = appState.connections[pair.aId];
    const b = appState.connections[pair.bId];
    if (!a || !b) return null;
    if (a.kind !== 'local') return [a, b];
    if (b.kind !== 'local') return [b, a];
    return (a.createdAt || '') <= (b.createdAt || '') ? [a, b] : [b, a];
  };

  const join = async (pair: DuplicatePair) => {
    const ordered = order(pair);
    if (!ordered) return;
    setBusy(true);
    const [keep, drop] = ordered;
    const name = contactName(keep);
    const done = await store.mergeContacts(keep.id, drop.id);
    setBusy(false);
    notify(done ? `Zusammengeführt mit ${name}.` : 'Das hat nicht geklappt.');
  };

  const distinct = async (pair: DuplicatePair) => {
    setBusy(true);
    await store.markDistinct(pair.aId, pair.bId);
    setBusy(false);
  };

  return (
    <Page
      title="Doppelte Einträge"
      lead="Diese Einträge gehören vermutlich zur selben Person. Beim Zusammenführen geht nichts verloren; beim Kontakt kannst du es wieder trennen."
      back={{ href: href('mehr'), label: 'Mehr' }}
    >
      {pairs.length === 0 ? (
        <p className="muted">Es wurden keine doppelten Einträge gefunden.</p>
      ) : (
        <ul className="list">
          {pairs.map((pair) => {
            const ordered = order(pair);
            if (!ordered) return null;
            const [keep, drop] = ordered;
            return (
              <li className="group" key={`${pair.aId}|${pair.bId}`} style={{ padding: 'var(--s-4)' }}>
                <p className="small muted">
                  {MATCH_REASON_TEXT[pair.reason]}
                  {pair.level === 'maybe' ? ' · bitte prüfen' : ''}
                </p>
                {[keep, drop].map((connection) => (
                  <a className="row" href={href('kontakt', connection.id)} key={connection.id}>
                    <span className="row-main">
                      <span className="row-title">{contactName(connection)}</span>
                      <span className="row-sub">
                        {[contactState(connection).label, summary(connection)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="row-arrow" aria-hidden="true" />
                  </a>
                ))}
                <div className="actions" style={{ marginTop: 'var(--s-3)' }}>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => join(pair)}>
                    Zusammenführen
                  </button>
                  <button type="button" className="btn" disabled={busy} onClick={() => distinct(pair)}>
                    Sind verschieden
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
};
