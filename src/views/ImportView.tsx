/**
 * Vorhandene Kontakte aus vCard oder CSV übernehmen.
 * Sie werden als nicht verbundene Einträge angelegt und lassen sich später
 * per Einladung in echte Verbindungen umwandeln.
 */

import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { Page, Section } from '../ui/Page';
import { href, navigate } from '../router';
import { parseVCards, type ImportedContact } from '../io/vcard';
import { parseContactsCsv } from '../io/csv';
import { displayNameOfCard, todayIso } from '../model/contact';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const ImportView: React.FC = () => {
  const { appState, notify } = useAppContext();
  const [contacts, setContacts] = useState<ImportedContact[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [unknown, setUnknown] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [tagId, setTagId] = useState('');
  const [busy, setBusy] = useState(false);

  const tags = Object.values(appState.tags ?? {}).sort((a, b) => a.name.localeCompare(b.name, 'de'));

  const readFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setContacts(null);
    setUnknown([]);
    setError('');
    if (!file) return;
    setFileName(file.name);

    if (file.size > MAX_FILE_BYTES) {
      setError('Die Datei ist zu groß (über 10 MB). Teile sie in kleinere Dateien auf.');
      return;
    }

    try {
      const text = await file.text();
      let result: ImportedContact[];
      if (/BEGIN:VCARD/i.test(text)) {
        result = parseVCards(text);
      } else {
        const parsed = parseContactsCsv(text);
        result = parsed.contacts;
        setUnknown(parsed.unknownHeaders);
      }
      if (result.length === 0) {
        setError(
          'In dieser Datei wurden keine Kontakte gefunden. Unterstützt werden Kontaktdateien (.vcf) und Tabellen (.csv) mit einer Überschriftenzeile wie „Vorname; Nachname; E-Mail“.'
        );
        return;
      }
      setContacts(result);
    } catch {
      setError('Die Datei konnte nicht gelesen werden. Ist es eine .vcf- oder .csv-Datei?');
    }
  };

  const run = async () => {
    if (!contacts) return;
    setBusy(true);
    const origin = `Import aus ${fileName} am ${todayIso().split('-').reverse().join('.')}`;
    await store.addLocalContacts(
      contacts.map((contact) => ({
        card: contact.card,
        private: { dataOrigin: origin, ...(contact.notes ? { notes: contact.notes } : {}) },
        tagIds: tagId ? [tagId] : undefined,
      }))
    );
    setBusy(false);
    notify(`${contacts.length} ${contacts.length === 1 ? 'Kontakt' : 'Kontakte'} übernommen.`);
    navigate();
  };

  return (
    <Page
      title="Kontakte übernehmen"
      lead="Übernimm Kontakte aus deinem Telefonbuch oder einer Tabelle. Sie bleiben zunächst so, wie sie sind; wen du einlädst, dessen Eintrag hält sich danach von selbst aktuell."
      back={{ href: href('mehr'), label: 'Mehr' }}
    >
      <div className="stack">
        <div className="field">
          <label className="field-label" htmlFor="import-file">
            Datei auswählen
          </label>
          <input
            className="input"
            id="import-file"
            type="file"
            accept=".vcf,.vcard,.csv,text/vcard,text/x-vcard,text/csv"
            onChange={readFile}
          />
          <span className="field-hint">
            Kontaktdatei (.vcf) oder Tabelle (.csv). Die Datei wird nur auf diesem Gerät gelesen.
          </span>
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>

      <details className="group section">
        <summary>Wie komme ich an so eine Datei?</summary>
        <div className="group-body stack-s small">
          <p>
            <strong>iPhone:</strong> In der App „Kontakte“ oben links auf „Listen“ tippen, eine Liste
            gedrückt halten und „Exportieren“ wählen.
          </p>
          <p>
            <strong>Android:</strong> In der App „Kontakte“ unter „Verwalten“ bzw. „Einstellungen“ den
            Punkt „Exportieren“ bzw. „In Datei exportieren“ wählen.
          </p>
          <p>
            <strong>Google, Outlook, Apple am Computer:</strong> In der Kontaktverwaltung „Exportieren“
            wählen und als vCard oder CSV speichern.
          </p>
        </div>
      </details>

      {contacts && (
        <>
          <Section title={`${contacts.length} ${contacts.length === 1 ? 'Kontakt' : 'Kontakte'} gefunden`}>
            <ul className="list">
              {contacts.slice(0, 8).map((contact, index) => (
                <li className="row" style={{ minHeight: 'var(--control)' }} key={index}>
                  <span className="row-main">
                    <span className="row-title">{displayNameOfCard(contact.card) || 'Ohne Namen'}</span>
                    <span className="row-sub">
                      {[contact.card.phoneMobile, contact.card.emailPrivate || contact.card.emailWork, contact.card.city]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {contacts.length > 8 && (
              <p className="small muted" style={{ marginTop: 'var(--s-2)' }}>
                … und {contacts.length - 8} weitere
              </p>
            )}
            {unknown.length > 0 && (
              <p className="small muted" style={{ marginTop: 'var(--s-3)' }}>
                Nicht übernommen werden diese Spalten, weil sie keinem Feld zugeordnet werden konnten:{' '}
                {unknown.slice(0, 12).join(', ')}
                {unknown.length > 12 ? ' …' : ''}
              </p>
            )}
          </Section>

          {tags.length > 0 && (
            <div className="field section">
              <label className="field-label" htmlFor="import-tag">
                Tag für alle übernommenen Kontakte (freiwillig)
              </label>
              <select className="input" id="import-tag" value={tagId} onChange={(event) => setTagId(event.target.value)}>
                <option value="">Kein Tag</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-bar">
            <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
              {contacts.length === 1 ? 'Kontakt übernehmen' : `${contacts.length} Kontakte übernehmen`}
            </button>
          </div>
        </>
      )}
    </Page>
  );
};
