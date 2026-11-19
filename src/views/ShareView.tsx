/**
 * Freigabe für einen Kontakt ändern, mit Vorschau aus dessen Sicht
 */

import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { Page, Section } from '../ui/Page';
import { SharePicker } from '../ui/SharePicker';
import { CardFacts } from '../ui/CardFacts';
import { href, navigate } from '../router';
import { contactName } from '../model/contact';
import { projectFields } from '../utils/policy';
import { isCardField } from '../model/fields';

export const ShareView: React.FC<{ connectionId: string }> = ({ connectionId }) => {
  const { appState, notify } = useAppContext();
  const connection = appState.connections[connectionId];
  const [fields, setFields] = useState<string[]>(() =>
    connection ? connection.allowedFields.filter(isCardField) : []
  );
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

  const save = async () => {
    setSaving(true);
    await store.updateConnection(connectionId, { allowedFields: fields });
    setSaving(false);
    notify(
      connection.status === 'online'
        ? `Gespeichert. ${name} sieht die Änderung sofort.`
        : `Gespeichert. ${name} sieht die Änderung, sobald ihr beide die App geöffnet habt.`
    );
    navigate('kontakt', connectionId);
  };

  return (
    <Page
      title="Freigabe"
      lead={`Was darf ${name} von deiner Karte sehen?`}
      back={{ href: href('kontakt', connectionId), label: name }}
    >
      <SharePicker value={fields} onChange={setFields} myCard={appState.myCard} />

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
