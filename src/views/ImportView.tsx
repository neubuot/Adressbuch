/**
 * Vorhandene Kontakte übernehmen: aus einer Datei (vCard, CSV, Datenexport
 * von LinkedIn), aus dem Telefonbuch des Geräts oder direkt aus einem
 * Google- oder Microsoft-Konto.
 * Sie werden als nicht verbundene Einträge angelegt und lassen sich später
 * per Einladung in echte Verbindungen umwandeln.
 *
 * Vor dem Übernehmen gleicht die Ansicht mit dem Bestand ab: Was dieselbe
 * Quelle schon geliefert hat, wird aktualisiert; was sicher zu einem
 * vorhandenen Kontakt gehört, wird dort ergänzt; unsichere Treffer werden
 * nur auf Wunsch zusammengeführt.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { Page, Section } from '../ui/Page';
import { href, navigate } from '../router';
import type { ImportedContact } from '../io/vcard';
import { ImportFileError, readContactsFiles } from '../io/import-file';
import { LINKEDIN_SOURCE_ID, LINKEDIN_SOURCE_NAME } from '../io/linkedin';
import { MICROSOFT_SOURCE_ID, MICROSOFT_SOURCE_NAME, canImportFromMicrosoft, importFromMicrosoft } from '../io/microsoft';
import { ImportAccessError } from '../io/oauth-popup';
import { takeSharedFiles } from '../io/shared';
import { contactName, displayNameOfCard, todayIso } from '../model/contact';
import { MATCH_REASON_TEXT, planImport, summarizePlan, type PlanItem } from '../model/dedupe';
import { PHONEBOOK_SOURCE_ID, PHONEBOOK_SOURCE_NAME, canPickFromPhonebook, pickFromPhonebook } from '../io/phonebook';
import { GOOGLE_SOURCE_ID, GOOGLE_SOURCE_NAME, canImportFromGoogle, importFromGoogle } from '../io/google';

type Origin = 'file' | 'phone' | 'google' | 'linkedin' | 'microsoft';
type Online = 'google' | 'microsoft';

const ORIGIN_TEXT: Record<Origin, { already: string; leading: string; origin: string }> = {
  file: { already: 'aus dieser Datei', leading: 'was in dieser Datei steht', origin: '' },
  phone: { already: 'aus dem Telefonbuch', leading: 'was im Telefonbuch steht', origin: 'dem Telefonbuch' },
  google: { already: 'aus Google Kontakte', leading: 'was in Google Kontakte steht', origin: 'Google Kontakte' },
  linkedin: { already: 'aus LinkedIn', leading: 'was bei LinkedIn steht', origin: 'LinkedIn' },
  microsoft: { already: 'aus dem Microsoft-Konto', leading: 'was im Microsoft-Konto steht', origin: 'dem Microsoft-Konto' },
};

/** Feste Quellen; Dateien bekommen ihre Quelle aus dem Dateinamen */
const FIXED_SOURCE: Partial<Record<Origin, { id: string; name: string }>> = {
  phone: { id: PHONEBOOK_SOURCE_ID, name: PHONEBOOK_SOURCE_NAME },
  google: { id: GOOGLE_SOURCE_ID, name: GOOGLE_SOURCE_NAME },
  linkedin: { id: LINKEDIN_SOURCE_ID, name: LINKEDIN_SOURCE_NAME },
  microsoft: { id: MICROSOFT_SOURCE_ID, name: MICROSOFT_SOURCE_NAME },
};

const ONLINE: Record<Online, { name: string; run: (signal: AbortSignal) => Promise<ImportedContact[]>; empty: string }> = {
  google: { name: 'Google', run: importFromGoogle, empty: 'In diesem Google-Konto wurden keine Kontakte gefunden.' },
  microsoft: {
    name: 'Microsoft',
    run: importFromMicrosoft,
    empty: 'In diesem Microsoft-Konto wurden keine Kontakte gefunden.',
  },
};

export const ImportView: React.FC = () => {
  const { appState, notify } = useAppContext();
  const [contacts, setContacts] = useState<ImportedContact[] | null>(null);
  const [fileName, setFileName] = useState('');
  /** Woher die gerade angezeigten Kontakte stammen */
  const [origin, setOrigin] = useState<Origin>('file');
  const phonebook = useMemo(() => canPickFromPhonebook(), []);
  const google = useMemo(() => canImportFromGoogle(), []);
  const microsoft = useMemo(() => canImportFromMicrosoft(), []);
  /** Läuft gerade eine Anmeldung bei einem Dienst? Dann lässt sie sich hierüber abbrechen. */
  const [waiting, setWaiting] = useState<Online | null>(null);
  /** Wird gerade eine Datei über die Seite gezogen? */
  const [dragging, setDragging] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [tagId, setTagId] = useState('');
  const [busy, setBusy] = useState(false);
  /** Unsichere Treffer, die der Nutzer zusammenführen will (Position im Import) */
  const [joined, setJoined] = useState<Set<number>>(new Set());
  /** Sichere Treffer, die der Nutzer doch getrennt anlegen will */
  const [separate, setSeparate] = useState<Set<number>>(new Set());
  const [leading, setLeading] = useState<'new' | 'old'>('old');

  const sourceId = FIXED_SOURCE[origin]?.id ?? `file:${fileName.trim().toLowerCase()}`;
  const sourceName = FIXED_SOURCE[origin]?.name ?? fileName;
  const plan = useMemo<PlanItem[]>(
    () => (contacts ? planImport(appState.connections ?? {}, sourceId, contacts) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contacts, sourceId]
  );
  const summary = summarizePlan(plan);
  const matches = plan.filter((item) => item.action === 'merge' || item.action === 'maybe');
  const hasOverlap = summary.updates + summary.merges + summary.maybes > 0;

  const targetName = (item: PlanItem): string => {
    if (!item.targetId) return '';
    if (item.targetId.startsWith('new:')) {
      const other = plan[Number(item.targetId.slice(4))];
      return other ? displayNameOfCard(other.contact.card) || 'Ohne Namen' : '';
    }
    const connection = appState.connections?.[item.targetId];
    return connection ? contactName(connection) : '';
  };

  const isJoined = (item: PlanItem): boolean =>
    item.action === 'merge' ? !separate.has(item.index) : joined.has(item.index);

  const toggle = (item: PlanItem) => {
    const [set, update] = item.action === 'merge' ? [separate, setSeparate] : [joined, setJoined];
    const next = new Set(set);
    if (next.has(item.index)) next.delete(item.index);
    else next.add(item.index);
    update(next);
  };

  const tags = Object.values(appState.tags ?? {}).sort((a, b) => a.name.localeCompare(b.name, 'de'));

  const reset = () => {
    setContacts(null);
    setUnknown([]);
    setError('');
    setJoined(new Set());
    setSeparate(new Set());
    setLeading('old');
  };

  const pickPhone = async () => {
    reset();
    try {
      const result = await pickFromPhonebook();
      if (result.length === 0) return;
      setOrigin('phone');
      setContacts(result);
    } catch {
      setError('Das Telefonbuch konnte nicht geöffnet werden. Nimm stattdessen eine Kontaktdatei (.vcf).');
    }
  };

  const pickOnline = async (service: Online) => {
    reset();
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setWaiting(service);
    const { name, run: fetchContacts, empty } = ONLINE[service];
    try {
      // Das Anmeldefenster öffnet sich sofort, noch im selben Klick
      const result = await fetchContacts(controller.signal);
      if (result.length === 0) {
        setError(empty);
        return;
      }
      setOrigin(service);
      setContacts(result);
    } catch (problem) {
      const kind = problem instanceof ImportAccessError ? problem.kind : 'network';
      if (kind === 'cancelled') return;
      setError(
        kind === 'blocked'
          ? 'Dein Browser hat das Anmeldefenster unterdrückt. Erlaube für diese Seite neue Fenster und versuche es noch einmal.'
          : kind === 'denied'
            ? `${name} hat den Zugriff auf deine Kontakte nicht erlaubt. Es wurde nichts übernommen.`
            : `Die Kontakte konnten nicht von ${name} geholt werden. Versuche es später noch einmal.`
      );
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setWaiting(null);
      }
    }
  };

  /** Liest gewählte, abgelegte oder geteilte Dateien */
  const loadFiles = async (files: File[]) => {
    reset();
    setOrigin('file');
    if (files.length === 0) return;
    setFileName(files.length === 1 ? files[0].name : `${files[0].name} und ${files.length - 1} weitere`);
    try {
      const result = await readContactsFiles(files);
      setOrigin(result.origin);
      setUnknown(result.unknownHeaders);
      setContacts(result.contacts);
    } catch (problem) {
      setError(
        problem instanceof ImportFileError
          ? problem.message
          : 'Die Datei konnte nicht gelesen werden. Ist es eine .vcf- oder .csv-Datei?'
      );
    }
  };
  const loadFilesRef = useRef(loadFiles);
  loadFilesRef.current = loadFiles;

  const readFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    void loadFiles(Array.from(event.target.files ?? []));
  };

  // Dateien, die eine andere App über „Teilen“ übergeben hat
  useEffect(() => {
    let active = true;
    void takeSharedFiles().then((files) => {
      if (active && files.length > 0) void loadFilesRef.current(files);
    });
    return () => {
      active = false;
    };
  }, []);

  // Dateien lassen sich an beliebiger Stelle auf die Seite ziehen
  useEffect(() => {
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
    const onOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragging(true);
    };
    const onLeave = (event: DragEvent) => {
      if (!event.relatedTarget) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragging(false);
      void loadFilesRef.current(Array.from(event.dataTransfer?.files ?? []));
    };
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const run = async () => {
    if (!contacts) return;
    setBusy(true);
    const dataOrigin = `Import aus ${ORIGIN_TEXT[origin].origin || fileName} am ${todayIso().split('-').reverse().join('.')}`;
    const result = await store.applyImport(
      { id: sourceId, kind: origin, name: sourceName },
      plan.map((item) => ({
        index: item.index,
        contact: item.contact,
        externalId: item.externalId,
        targetId: item.action === 'update' || isJoined(item) ? item.targetId : undefined,
      })),
      {
        leading: hasOverlap ? leading === 'new' : undefined,
        tagIds: tagId ? [tagId] : undefined,
        dataOrigin,
      }
    );
    setBusy(false);
    const parts: string[] = [];
    if (result.created > 0) parts.push(`${result.created} neu`);
    if (result.updated > 0) parts.push(`${result.updated} aktualisiert`);
    if (result.merged > 0) parts.push(`${result.merged} bei vorhandenen Kontakten ergänzt`);
    notify(
      result.updated + result.merged === 0
        ? `${contacts.length} ${contacts.length === 1 ? 'Kontakt' : 'Kontakte'} übernommen.`
        : `Übernommen: ${parts.join(', ')}.`
    );
    navigate();
  };

  return (
    <Page
      title="Kontakte übernehmen"
      lead="Übernimm Kontakte aus deinem Telefonbuch, einer Datei oder einem anderen Dienst. Sie bleiben zunächst so, wie sie sind; wen du einlädst, dessen Eintrag hält sich danach von selbst aktuell."
      back={{ href: href('mehr'), label: 'Mehr' }}
    >
      <div className="stack">
        {phonebook && (
          <div className="field">
            <button type="button" className="btn btn-primary" onClick={pickPhone}>
              Aus dem Telefonbuch wählen
            </button>
            <span className="field-hint">
              Dein Gerät zeigt seine Kontakte. Übernommen wird nur, was du dort ankreuzt. Firma und Geburtstag
              liefert das Telefonbuch auf diesem Weg nicht; dafür eignet sich eine Kontaktdatei.
            </span>
          </div>
        )}

        {(['google', 'microsoft'] as const)
          .filter((service) => (service === 'google' ? google : microsoft))
          .map((service) => (
            <div className="field" key={service}>
              {waiting === service ? (
                <>
                  <p className="small" role="status">
                    Warte auf deine Anmeldung bei {ONLINE[service].name} im anderen Fenster …
                  </p>
                  <button type="button" className="btn" onClick={() => abort.current?.abort()}>
                    Abbrechen
                  </button>
                </>
              ) : (
                <button type="button" className="btn" onClick={() => pickOnline(service)} disabled={waiting !== null}>
                  {service === 'google' ? 'Aus Google Kontakte holen' : 'Aus Microsoft-Konto holen'}
                </button>
              )}
              <span className="field-hint">
                {service === 'google'
                  ? 'Du meldest dich in einem eigenen Fenster bei Google an und erlaubst das Lesen deiner Kontakte.'
                  : 'Du meldest dich in einem eigenen Fenster bei Microsoft an (Outlook, Microsoft 365) und erlaubst das Lesen deiner Kontakte.'}{' '}
                Dein Browser holt sie direkt bei {ONLINE[service].name}; sie laufen über keinen anderen Server. Der Zugang
                wird nicht gespeichert.
              </span>
            </div>
          ))}

        <div
          className="field"
          data-testid="import-drop"
          style={dragging ? { outline: '2px dashed currentColor', outlineOffset: '6px' } : undefined}
        >
          <label className="field-label" htmlFor="import-file">
            Datei auswählen
          </label>
          <input
            className="input"
            id="import-file"
            type="file"
            multiple
            accept=".vcf,.vcard,.csv,.zip,text/vcard,text/x-vcard,text/csv,application/zip"
            onChange={readFile}
          />
          <span className="field-hint">
            {dragging
              ? 'Datei hier loslassen.'
              : 'Kontaktdatei (.vcf), Tabelle (.csv) oder der Datenexport von LinkedIn (.zip). Du kannst die Datei auch auf diese Seite ziehen. Sie wird nur auf diesem Gerät gelesen.'}
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
          <p>
            <strong>LinkedIn:</strong> Unter „Einstellungen &amp; Datenschutz“ im Bereich „Datenschutz“ den Punkt
            „Kopie Ihrer Daten anfordern“ öffnen, „Kontakte“ ankreuzen und das Archiv anfordern. LinkedIn schickt
            dir einen Link zum Herunterladen. Das Archiv (.zip) kannst du hier unverändert auswählen oder auf diese
            Seite ziehen. E-Mail-Adressen stehen nur bei Kontakten drin, die das bei LinkedIn erlauben;
            Telefonnummern fehlen.
          </p>
          <p>
            <strong>Aus einer anderen App teilen (Android):</strong> Ist das Adressbuch als App installiert, erscheint
            es beim „Teilen“ einer Kontaktdatei in der Auswahl, etwa in der App „Kontakte“ unter „Teilen“.
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

          {hasOverlap && (
            <Section title="Schon vorhanden">
              <p className="small">
                {[
                  summary.fresh > 0 ? `${summary.fresh} neu` : '',
                  summary.updates > 0
                    ? `${summary.updates} ${ORIGIN_TEXT[origin].already} schon übernommen, werden aktualisiert`
                    : '',
                  summary.merges > 0 ? `${summary.merges} gehören zu vorhandenen Kontakten` : '',
                  summary.maybes > 0 ? `${summary.maybes} könnten zu vorhandenen Kontakten gehören` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>

              {matches.length > 0 && (
                <ul className="list" style={{ marginTop: 'var(--s-3)' }}>
                  {matches.map((item) => (
                    <li className="row" style={{ minHeight: 'var(--control)' }} key={item.index}>
                      <label className="row-main" htmlFor={`import-match-${item.index}`}>
                        <span className="row-title">
                          {displayNameOfCard(item.contact.card) || 'Ohne Namen'} → {targetName(item) || 'vorhandener Kontakt'}
                        </span>
                        <span className="row-sub">
                          {item.reason ? MATCH_REASON_TEXT[item.reason] : ''}
                          {item.action === 'maybe' ? ' · bitte prüfen' : ''}
                        </span>
                      </label>
                      <input
                        id={`import-match-${item.index}`}
                        type="checkbox"
                        checked={isJoined(item)}
                        onChange={() => toggle(item)}
                        aria-label={`${displayNameOfCard(item.contact.card) || 'Eintrag'} mit ${targetName(item) || 'vorhandenem Kontakt'} zusammenführen`}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {matches.length > 0 && (
                <p className="small muted" style={{ marginTop: 'var(--s-2)' }}>
                  Mit Haken werden die Angaben beim vorhandenen Kontakt ergänzt. Ohne Haken entsteht ein eigener Eintrag.
                  Es wird nichts gelöscht.
                </p>
              )}

              <fieldset className="field" style={{ marginTop: 'var(--s-4)' }}>
                <legend className="field-label">Wenn Angaben voneinander abweichen, gilt</legend>
                <label className="small" style={{ display: 'block' }}>
                  <input type="radio" name="import-leading" checked={leading === 'old'} onChange={() => setLeading('old')} />{' '}
                  was schon im Adressbuch steht
                </label>
                <label className="small" style={{ display: 'block' }}>
                  <input type="radio" name="import-leading" checked={leading === 'new'} onChange={() => setLeading('new')} />{' '}
                  {ORIGIN_TEXT[origin].leading}
                </label>
                <span className="field-hint">
                  Was du selbst von Hand geändert hast, bleibt in jedem Fall. Bei verbundenen Kontakten gilt immer deren
                  eigene Karte.
                </span>
              </fieldset>
            </Section>
          )}

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
