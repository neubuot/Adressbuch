/**
 * Freigabe für einen Kontakt ändern, mit Vorschau aus dessen Sicht.
 * Die Freigabe kann befristet werden: Nach Ablauf sieht der Kontakt nur
 * noch den Namen oder gar nichts mehr.
 */

import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { Page, Section } from '../ui/Page';
import { SharePicker } from '../ui/SharePicker';
import { CardFacts } from '../ui/CardFacts';
import { href, navigate } from '../router';
import { contactName, endOfDayIso, formatDate, todayIso } from '../model/contact';
import { activeLimit, projectFields, type ShareLimit } from '../utils/policy';
import { isCardField } from '../model/fields';

type Duration = 'none' | '1' | '7' | '14' | '30' | 'date';
type After = 'name' | 'nothing';

const DURATIONS: Array<{ id: Duration; label: string }> = [
  { id: 'none', label: 'Dauerhaft' },
  { id: '1', label: '1 Tag' },
  { id: '7', label: '1 Woche' },
  { id: '14', label: '2 Wochen' },
  { id: '30', label: '1 Monat' },
  { id: 'date', label: 'Bis zu einem Datum' },
];

const NAME_FIELDS = ['firstName', 'lastName'];

export const ShareView: React.FC<{ connectionId: string }> = ({ connectionId }) => {
  const { appState, notify } = useAppContext();
  const connection = appState.connections[connectionId];
  const existing = connection ? activeLimit(connection) : null;
  const [fields, setFields] = useState<string[]>(() =>
    connection ? connection.allowedFields.filter(isCardField) : []
  );
  const [duration, setDuration] = useState<Duration>(existing ? 'date' : 'none');
  const [day, setDay] = useState(() => (existing ? todayIso(new Date(existing.until)) : ''));
  const [after, setAfter] = useState<After>(existing && existing.keep.length === 0 ? 'nothing' : 'name');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!connection || connection.kind === 'local') {
    return (
      <Page title="Freigabe" back={{ href: href(), label: 'Kontakte' }}>
        <p>Diesen Kontakt gibt es nicht (mehr) oder er ist nicht verbunden.</p>
      </Page>
    );
  }

  const name = contactName(connection);
  const preview = projectFields(appState.myCard, fields);
  const emptyButShared = fields.filter(
    (field) => isCardField(field) && !appState.myCard[field]
  ).length;

  /** Die gewählte Befristung, null für dauerhaft, 'invalid' bei fehlendem oder vergangenem Datum */
  const chosenLimit = (): ShareLimit | null | 'invalid' => {
    if (duration === 'none' || fields.length === 0) return null;
    const keep = after === 'name' ? NAME_FIELDS.filter((field) => fields.includes(field)) : [];
    if (duration === 'date') {
      const until = endOfDayIso(day);
      if (!until || Date.parse(until) <= Date.now()) return 'invalid';
      return { until, keep };
    }
    return { until: new Date(Date.now() + Number(duration) * 24 * 60 * 60 * 1000).toISOString(), keep };
  };

  const save = async () => {
    setError('');
    const limit = chosenLimit();
    if (limit === 'invalid') {
      setError('Wähle ein Datum, das in der Zukunft liegt.');
      return;
    }
    setSaving(true);
    await store.setShare(connectionId, fields, limit);
    setSaving(false);
    const until = limit ? ` Die Freigabe endet am ${formatDate(limit.until)}.` : '';
    notify(
      (connection.status === 'online'
        ? `Gespeichert. ${name} sieht die Änderung sofort.`
        : `Gespeichert. ${name} sieht die Änderung, sobald ihr beide die App geöffnet habt.`) + until
    );
    navigate('kontakt', connectionId);
  };

  const limited = duration !== 'none' && fields.length > 0;

  return (
    <Page
      title="Freigabe"
      lead={`Was darf ${name} von deiner Karte sehen?`}
      back={{ href: href('kontakt', connectionId), label: name }}
    >
      <SharePicker value={fields} onChange={setFields} myCard={appState.myCard} />

      {fields.length > 0 && (
        <Section title="Wie lange?">
          <div className="stack">
            <div className="field">
              <label className="field-label" htmlFor="share-duration">
                Dauer der Freigabe
              </label>
              <select
                className="input"
                id="share-duration"
                value={duration}
                onChange={(event) => {
                  setDuration(event.target.value as Duration);
                  setError('');
                }}
              >
                {DURATIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                Praktisch für Handwerker, Vermieter oder eine Reisegruppe: Die Angaben verschwinden danach von selbst.
              </span>
            </div>

            {duration === 'date' && (
              <div className="field">
                <label className="field-label" htmlFor="share-until">
                  Freigegeben bis einschließlich
                </label>
                <input
                  className="input"
                  id="share-until"
                  type="date"
                  min={todayIso()}
                  value={day}
                  onChange={(event) => {
                    setDay(event.target.value);
                    setError('');
                  }}
                />
              </div>
            )}

            {limited && (
              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="field-label">Was sieht {name} danach?</legend>
                <div className="options">
                  <label className="option">
                    <input type="radio" name="share-after" checked={after === 'name'} onChange={() => setAfter('name')} />
                    <span className="option-text">
                      <span className="option-title">Nur noch meinen Namen</span>
                      <span className="option-desc">Ihr bleibt verbunden, der Eintrag bleibt erkennbar</span>
                    </span>
                  </label>
                  <label className="option">
                    <input
                      type="radio"
                      name="share-after"
                      checked={after === 'nothing'}
                      onChange={() => setAfter('nothing')}
                    />
                    <span className="option-text">
                      <span className="option-title">Nichts mehr</span>
                      <span className="option-desc">Ihr bleibt verbunden, {name} sieht keine Angaben mehr</span>
                    </span>
                  </label>
                </div>
              </fieldset>
            )}

            {limited && (
              <p className="small muted">
                <strong>Ehrlich gesagt:</strong> Was {name} in dieser Zeit abschreibt, exportiert oder ins eigene
                Telefonbuch übernimmt, bleibt dort. Die Frist entfernt deine Angaben nur aus dieser App.
              </p>
            )}

            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
        </Section>
      )}

      <Section title={`So sieht ${name} deine Karte`}>
        {Object.keys(preview).length > 0 ? (
          <CardFacts card={preview} plain />
        ) : (
          <p className="muted">
            {fields.length === 0
              ? `${name} sieht nichts von dir.`
              : 'Die ausgewählten Angaben sind auf deiner Karte noch leer.'}
          </p>
        )}
        {emptyButShared > 0 && Object.keys(preview).length > 0 && (
          <p className="small muted" style={{ marginTop: 'var(--s-3)' }}>
            {emptyButShared === 1
              ? 'Eine freigegebene Angabe ist auf deiner Karte noch leer.'
              : `${emptyButShared} freigegebene Angaben sind auf deiner Karte noch leer.`}{' '}
            Sobald du sie ausfüllst, werden sie mit übertragen.
          </p>
        )}
      </Section>

      <div className="form-bar">
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          Freigabe speichern
        </button>
        <a className="btn btn-quiet" href={href('kontakt', connectionId)}>
          Abbrechen
        </a>
      </div>
    </Page>
  );
};
