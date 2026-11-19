/**
 * Die eigene Karte bearbeiten
 */

import { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { Page } from '../ui/Page';
import { CardForm } from '../ui/CardForm';
import { ADDRESS_CARD_FIELDS, type AddressCardField, type RemoteCard } from '../types';

function valuesOf(card: Record<string, unknown>): RemoteCard {
  const values: RemoteCard = {};
  for (const field of ADDRESS_CARD_FIELDS) {
    values[field] = typeof card[field] === 'string' ? (card[field] as string) : '';
  }
  return values;
}

export const MyCardView: React.FC = () => {
  const { appState, notify } = useAppContext();
  const [values, setValues] = useState<RemoteCard>(() =>
    valuesOf(appState.myCard as unknown as Record<string, unknown>)
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Solange nichts geändert wurde, folgt das Formular dem gespeicherten Stand
  useEffect(() => {
    if (!dirty) setValues(valuesOf(appState.myCard as unknown as Record<string, unknown>));
  }, [appState.myCard, dirty]);

  // Warnung, wenn die Seite mit ungespeicherten Änderungen verlassen wird
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const change = (field: AddressCardField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setDirty(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    await store.updateMyCard(values);
    setSaving(false);
    setDirty(false);
    const linked = Object.values(appState.connections).filter((c) => c.kind !== 'local').length;
    notify(
      linked > 0
        ? 'Gespeichert. Deine Kontakte erhalten die Änderung automatisch.'
        : 'Gespeichert.'
    );
  };

  return (
    <Page
      title="Meine Karte"
      lead="Trag ein, was du möchtest. Wer was davon sieht, legst du bei jedem Kontakt einzeln fest."
    >
      <form onSubmit={save} noValidate>
        <CardForm values={values} onChange={change} />
        <div className="form-bar">
          <button type="submit" className="btn btn-primary" disabled={saving || !dirty}>
            Speichern
          </button>
          <span className="small muted" aria-live="polite">
            {dirty ? 'Noch nicht gespeichert' : 'Alles gespeichert'}
          </span>
        </div>
      </form>
    </Page>
  );
};
