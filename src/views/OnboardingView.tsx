/**
 * Einstieg beim ersten Start: Name eintragen, fertig.
 */

import { useState } from 'react';
import { store } from '../store/automerge-store';
import { href } from '../router';

export const OnboardingView: React.FC<{ invited: boolean; onDone: () => void }> = ({ invited, onDone }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);

  const canSubmit = firstName.trim() !== '' || lastName.trim() !== '';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    await store.updateMyCard({ firstName, lastName });
    onDone();
  };

  return (
    <main className="welcome">
      <svg className="welcome-mark" viewBox="92 142 316 228" aria-hidden="true">
        <circle cx="206" cy="256" r="92" fill="none" stroke="currentColor" strokeWidth="22" />
        <circle cx="340" cy="256" r="46" fill="var(--c-accent)" />
      </svg>
      <h1 className="page-title">P2P Adressbuch</h1>
      <p className="page-lead">
        {invited
          ? 'Du wurdest eingeladen. Sag kurz, wie du heißt, dann geht es weiter zum Verbinden.'
          : 'Ein Adressbuch, das sich selbst aktuell hält. Wie heißt du?'}
      </p>

      <form className="stack section" onSubmit={submit} noValidate>
        <div className="field">
          <label className="field-label" htmlFor="firstName">
            Vorname
          </label>
          <input
            className="input"
            id="firstName"
            autoComplete="given-name"
            autoFocus
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="lastName">
            Nachname
          </label>
          <input
            className="input"
            id="lastName"
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={!canSubmit || saving}>
          {invited ? 'Weiter' : 'Fertig'}
        </button>
      </form>

      <div className="section stack-s small muted">
        <p>
          Kein Konto, kein Passwort. Deine Angaben bleiben auf diesem Gerät, bis du sie jemandem
          freigibst. Alles Weitere kannst du später eintragen.
        </p>
        <p>
          <a href={href('mehr', 'sicherung')}>Ich habe schon ein Adressbuch und möchte eine Sicherung wiederherstellen</a>
        </p>
        <p>
          <a href={href('wiederherstellen')}>Ich habe Vertraute festgelegt und möchte mein Adressbuch über sie zurückholen</a>
        </p>
      </div>
    </main>
  );
};
