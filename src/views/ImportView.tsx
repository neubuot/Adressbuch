/**
 * Vorhandene Kontakte aus vCard oder CSV übernehmen.
 * Sie werden als nicht verbundene Einträge angelegt und lassen sich später
 * per Einladung in echte Verbindungen umwandeln.
 *
 * Vor dem Übernehmen gleicht die Ansicht mit dem Bestand ab: Was dieselbe
 * Quelle schon geliefert hat, wird aktualisiert; was sicher zu einem
 * vorhandenen Kontakt gehört, wird dort ergänzt; unsichere Treffer werden
 * nur auf Wunsch zusammengeführt.
 */

import { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { Page, Section } from '../ui/Page';
import { href, navigate } from '../router';
import { parseVCards, type ImportedContact } from '../io/vcard';
import { parseContactsCsv } from '../io/csv';
import { contactName, displayNameOfCard, todayIso } from '../model/contact';
import { MATCH_REASON_TEXT, planImport, summarizePlan, type PlanItem } from '../model/dedupe';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const ImportView: React.FC = () => {
  const { appState, notify } = useAppContext();
  const [contacts, setContacts] = useState<ImportedContact[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [unknown, setUnknown] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [tagId, setTagId] = useState('');
  const [busy, setBusy] = useState(false);
  /** Unsichere Treffer, die der Nutzer zusammenführen will (Position im Import) */
  const [joined, setJoined] = useState<Set<number>>(new Set());
  /** Sichere Treffer, die der Nutzer doch getrennt anlegen will */
  const [separate, setSeparate] = useState<Set<number>>(new Set());
  const [leading, setLeading] = useState<'new' | 'old'>('old');

  const sourceId = `file:${fileName.trim().toLowerCase()}`;
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

  const readFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setContacts(null);
    setUnknown([]);
    setError('');
    setJoined(new Set());
    setSeparate(new Set());
    setLeading('old');
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
    const result = await store.applyImport(
      { id: sourceId, kind: 'file', name: fileName },
      plan.map((item) => ({
        index: item.index,
        contact: item.contact,
        externalId: item.externalId,
        targetId: item.action === 'update' || isJoined(item) ? item.targetId : undefined,
      })),
      {
        leading: hasOverlap ? leading === 'new' : undefined,
        tagIds: tagId ? [tagId] : undefined,
        dataOrigin: origin,
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

          {hasOverlap && (
            <Section title="Schon vorhanden">
              <p className="small">
                {[
                  summary.fresh > 0 ? `${summary.fresh} neu` : '',
                  summary.updates > 0 ? `${summary.updates} aus dieser Datei schon übernommen, werden aktualisiert` : '',
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
                  was in dieser Datei steht
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
