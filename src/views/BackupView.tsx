/**
 * Verschlüsselte Sicherung erstellen und wiederherstellen
 */

import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { Page, Section } from '../ui/Page';
import { ConfirmDialog } from '../ui/Dialog';
import { href } from '../router';
import {
  BackupError,
  createBackup,
  downloadText,
  getLastBackupAt,
  isBackupFile,
  markBackupDone,
  readBackup,
  type BackupContent,
} from '../io/backup';
import { formatDate, todayIso } from '../model/contact';
import { V1_FIELD_RENAMES } from '../store/migrate';

const KEYPAIR_KEY = 'p2p-keypair';
const MIN_PASSWORD = 8;

function readKeyPair() {
  try {
    const stored = localStorage.getItem(KEYPAIR_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export const BackupView: React.FC = () => {
  const { appState, notify } = useAppContext();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [lastBackup, setLastBackup] = useState(getLastBackupAt);

  const [fileText, setFileText] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [pending, setPending] = useState<BackupContent | null>(null);

  const contactCount = Object.keys(appState.connections).length;
  const hasData = contactCount > 0 || !!appState.myCard.firstName || !!appState.myCard.lastName;
  const encrypted = fileText !== '' && isBackupFile(fileText);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError('');
    if (password.length < MIN_PASSWORD) {
      setCreateError(`Das Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.`);
      return;
    }
    if (password !== repeat) {
      setCreateError('Die beiden Passwörter stimmen nicht überein.');
      return;
    }
    setCreating(true);
    try {
      const content = await createBackup({ snapshot: store.export(), keyPair: readKeyPair() }, password);
      downloadText(content, `adressbuch-sicherung-${todayIso()}.adressbuch`, 'application/json');
      markBackupDone();
      setLastBackup(getLastBackupAt());
      setPassword('');
      setRepeat('');
      notify('Sicherung gespeichert. Bewahre Datei und Passwort gut auf.');
    } catch (error) {
      console.error(error);
      setCreateError('Die Sicherung konnte nicht erstellt werden. Versuche es noch einmal.');
    } finally {
      setCreating(false);
    }
  };

  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setRestoreError('');
    setFileText('');
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setFileText(await file.text());
    } catch {
      setRestoreError('Die Datei konnte nicht gelesen werden.');
    }
  };

  /** Ältere, unverschlüsselte Exporte der eigenen Karte (JSON) */
  const restoreLegacyCard = async (): Promise<boolean> => {
    try {
      const data = JSON.parse(fileText);
      if (!data || typeof data.myCard !== 'object' || data.myCard === null) return false;
      const card: Record<string, string> = {};
      for (const [key, value] of Object.entries(data.myCard)) {
        if (typeof value === 'string') card[V1_FIELD_RENAMES[key] ?? key] = value;
      }
      await store.updateMyCard(card);
      notify('Deine Karte wurde aus der Datei übernommen.');
      setFileText('');
      return true;
    } catch {
      return false;
    }
  };

  const restore = async (event: React.FormEvent) => {
    event.preventDefault();
    setRestoreError('');

    if (!encrypted) {
      if (!(await restoreLegacyCard())) {
        setRestoreError('Das ist keine Sicherungsdatei dieser App.');
      }
      return;
    }

    setRestoring(true);
    try {
      const content = await readBackup(fileText, restorePassword);
      if (hasData) {
        setPending(content);
      } else {
        await apply(content);
      }
    } catch (error) {
      setRestoreError(
        error instanceof BackupError ? error.message : 'Die Sicherung konnte nicht gelesen werden.'
      );
    } finally {
      setRestoring(false);
    }
  };

  const apply = async (content: BackupContent) => {
    setPending(null);
    try {
      await store.replaceWith(content.snapshot);
      if (content.keyPair) {
        localStorage.setItem(KEYPAIR_KEY, JSON.stringify(content.keyPair));
      }
      markBackupDone();
      // Neu starten, damit die Verbindungen mit dem wiederhergestellten Schlüssel aufgebaut werden
      window.location.hash = '';
      window.location.reload();
    } catch (error) {
      setRestoreError(
        error instanceof Error ? error.message : 'Die Sicherung konnte nicht wiederhergestellt werden.'
      );
    }
  };

  return (
    <Page
      title="Daten sichern"
      lead="Dein Adressbuch liegt nur auf diesem Gerät. Eine Sicherung schützt dich, wenn das Gerät verloren geht oder die Browserdaten gelöscht werden."
      back={{ href: href('mehr'), label: 'Mehr' }}
    >
      <p className="small">
        Ergänzend oder stattdessen: <a href={href('mehr', 'vertraute')}>Wiederherstellung über Vertraute</a>, ganz ohne
        Datei und Passwort.
      </p>

      <Section title="Sicherung erstellen">
        <form className="stack" onSubmit={create}>
          <p className="small muted">
            {lastBackup ? `Letzte Sicherung am ${formatDate(lastBackup)}.` : 'Du hast noch keine Sicherung.'}{' '}
            Die Datei enthält deine Karte, alle Kontakte, deine Notizen und Tags. Sie ist mit deinem
            Passwort verschlüsselt.
          </p>
          <div className="field">
            <label className="field-label" htmlFor="backup-password">
              Passwort für die Sicherung
            </label>
            <input
              className="input"
              id="backup-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby="backup-password-hint"
            />
            <span className="field-hint" id="backup-password-hint">
              Mindestens {MIN_PASSWORD} Zeichen. Ohne dieses Passwort lässt sich die Sicherung nicht
              öffnen. Niemand kann es zurücksetzen.
            </span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="backup-repeat">
              Passwort wiederholen
            </label>
            <input
              className="input"
              id="backup-repeat"
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
            />
          </div>
          {createError && (
            <p className="error" role="alert">
              {createError}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? 'Wird verschlüsselt …' : 'Sicherung speichern'}
          </button>
        </form>
      </Section>

      <Section title="Sicherung wiederherstellen">
        <form className="stack" onSubmit={restore}>
          <div className="field">
            <label className="field-label" htmlFor="restore-file">
              Sicherungsdatei
            </label>
            <input
              className="input"
              id="restore-file"
              type="file"
              accept=".adressbuch,.json,application/json"
              onChange={chooseFile}
            />
          </div>
          {encrypted && (
            <div className="field">
              <label className="field-label" htmlFor="restore-password">
                Passwort der Sicherung
              </label>
              <input
                className="input"
                id="restore-password"
                type="password"
                autoComplete="current-password"
                value={restorePassword}
                onChange={(event) => setRestorePassword(event.target.value)}
              />
            </div>
          )}
          {restoreError && (
            <p className="error" role="alert">
              {restoreError}
            </p>
          )}
          <button type="submit" className="btn" disabled={!fileText || restoring || (encrypted && !restorePassword)}>
            {restoring ? 'Wird geöffnet …' : 'Wiederherstellen'}
          </button>
          <p className="small muted">
            Nutze eine Sicherung immer nur auf einem Gerät zur selben Zeit. Zwei Geräte mit derselben
            Sicherung würden sich bei deinen Kontakten gegenseitig in die Quere kommen.
          </p>
        </form>
      </Section>

      <ConfirmDialog
        open={!!pending}
        title="Adressbuch auf diesem Gerät ersetzen?"
        confirmLabel="Ersetzen"
        danger
        onConfirm={() => pending && apply(pending)}
        onCancel={() => setPending(null)}
      >
        <p>
          Das Adressbuch auf diesem Gerät ({contactCount === 1 ? '1 Kontakt' : `${contactCount} Kontakte`})
          wird vollständig durch die Sicherung ersetzt. Was seit der Sicherung dazugekommen ist, geht
          verloren.
        </p>
      </ConfirmDialog>
    </Page>
  );
};
