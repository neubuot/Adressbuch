/**
 * Vorstellen: zwei eigene Kontakte miteinander bekannt machen und eine
 * erhaltene Vorstellung annehmen.
 *
 * Wer vorstellt, gibt nur den Namen und die Kennung der jeweils anderen
 * Person weiter. Verbunden werden die beiden erst, wenn beide zustimmen;
 * was sie voneinander sehen, legt jeder selbst fest.
 */

import { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { Page, Section, Avatar } from '../ui/Page';
import { SharePicker } from '../ui/SharePicker';
import { CardFacts } from '../ui/CardFacts';
import { href, navigate } from '../router';
import { contactName, contactSortKey } from '../model/contact';
import { projectFields } from '../utils/policy';
import { SHARE_PRESETS } from '../model/fields';
import { pairKey } from '../types';

export const IntroduceView: React.FC<{ connectionId: string }> = ({ connectionId }) => {
  const { appState, notify } = useAppContext();
  const connection = appState.connections[connectionId];
  const [busy, setBusy] = useState(false);

  const candidates = useMemo(
    () =>
      Object.values(appState.connections)
        .filter((other) => other.kind !== 'local' && other.id !== connectionId)
        .sort((a, b) => contactSortKey(a).localeCompare(contactSortKey(b), 'de')),
    [appState.connections, connectionId]
  );
  const pending = useMemo(
    () => new Map(Object.values(appState.introsOut ?? {}).map((intro) => [pairKey(intro.aId, intro.bId), intro])),
    [appState.introsOut]
  );

  if (!connection || connection.kind === 'local') {
    return (
      <Page title="Vorstellen" back={{ href: href(), label: 'Kontakte' }}>
        <p>Diesen Kontakt gibt es nicht (mehr) oder er ist nicht verbunden.</p>
      </Page>
    );
  }

  const name = contactName(connection);

  const introduce = async (otherId: string, otherName: string) => {
    setBusy(true);
    const id = await store.addIntro(connectionId, otherId);
    setBusy(false);
    notify(
      id
        ? `${name} und ${otherName} erhalten deine Vorstellung, sobald du mit ihnen verbunden bist.`
        : 'Diese Vorstellung ist schon unterwegs.'
    );
  };

  const cancel = async (introId: string) => {
    await store.cancelIntroOut(introId);
    notify('Vorstellung zurückgenommen.');
  };

  return (
    <Page
      title={`${name} vorstellen`}
      lead={`Mach ${name} mit einem deiner anderen Kontakte bekannt. Die beiden müssen dafür keinen Code austauschen.`}
      back={{ href: href('kontakt', connectionId), label: name }}
    >
      <div className="note">
        <p className="note-title">Was dabei weitergegeben wird</p>
        <p className="small">
          Beide erfahren nur den Namen des anderen, so wie er bei dir steht. Verbunden werden sie erst, wenn beide
          zustimmen. Was sie voneinander sehen, legt jeder selbst fest. Lehnt jemand ab, erfährt das niemand.
        </p>
      </div>

      <Section title="Wem möchtest du vorstellen?">
        {candidates.length === 0 ? (
          <p className="muted">Dafür brauchst du mindestens einen weiteren verbundenen Kontakt.</p>
        ) : (
          <ul className="list">
            {candidates.map((other) => {
              const otherName = contactName(other);
              const intro = pending.get(pairKey(connectionId, other.id));
              return (
                <li className="row" key={other.id}>
                  <Avatar name={otherName} />
                  <span className="row-main">
                    <span className="row-title">{otherName}</span>
                    {intro && (
                      <span className="row-sub">
                        Vorstellung unterwegs
                        {intro.deliveredA || intro.deliveredB ? ', eine Seite hat sie schon erhalten' : ''}
                      </span>
                    )}
                  </span>
                  {intro ? (
                    <button type="button" className="btn btn-quiet" onClick={() => cancel(intro.id)}>
                      Zurücknehmen
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => introduce(other.id, otherName)}
                      aria-label={`${name} und ${otherName} einander vorstellen`}
                    >
                      Vorstellen
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </Page>
  );
};

export const IntroAcceptView: React.FC<{ fingerprint: string }> = ({ fingerprint }) => {
  const { appState, notify } = useAppContext();
  const intro = appState.introsIn?.[fingerprint];
  const [fields, setFields] = useState<string[]>(() => [...SHARE_PRESETS[0].fields]);
  const [saving, setSaving] = useState(false);

  if (!intro) {
    return (
      <Page title="Vorstellung" back={{ href: href('aktuelles'), label: 'Aktuelles' }}>
        <p>Diese Vorstellung gibt es nicht (mehr).</p>
      </Page>
    );
  }

  const introducer = appState.connections[intro.fromId];
  const from = introducer ? contactName(introducer) : 'Ein früherer Kontakt';
  const name = intro.name || 'die vorgestellte Person';
  const preview = projectFields(appState.myCard, fields);

  const accept = async () => {
    setSaving(true);
    await store.acceptIntro(fingerprint, fields);
    notify(`Angenommen. Ihr werdet verbunden, sobald auch ${name} zugestimmt hat.`);
    navigate('aktuelles');
  };

  const decline = async () => {
    await store.dropIntro(fingerprint);
    notify(`Vorstellung abgelehnt. ${name} erfährt davon nichts.`);
    navigate('aktuelles');
  };

  return (
    <Page
      title={`Mit ${name} verbinden?`}
      lead={`${from} möchte euch miteinander bekannt machen.`}
      back={{ href: href('aktuelles'), label: 'Aktuelles' }}
    >
      <div className="note">
        <p className="small">
          Den Namen kennst du von {from}. Ob wirklich diese Person dahintersteht, hängt davon ab, wie gut du {from}{' '}
          vertraust. Verbunden werdet ihr erst, wenn auch {name} zustimmt.
        </p>
      </div>

      <Section title={`Was darf ${name} von dir sehen?`}>
        <SharePicker value={fields} onChange={setFields} myCard={appState.myCard} name="intro-share" />
      </Section>

      <Section title={`So sieht ${name} deine Karte`}>
        {Object.keys(preview).length > 0 ? (
          <CardFacts card={preview} plain />
        ) : (
          <p className="muted">{name} sieht nichts von dir.</p>
        )}
      </Section>

      <div className="form-bar">
        <button type="button" className="btn btn-primary" onClick={accept} disabled={saving}>
          Annehmen
        </button>
        <button type="button" className="btn btn-quiet" onClick={decline}>
          Ablehnen
        </button>
      </div>
    </Page>
  );
};
