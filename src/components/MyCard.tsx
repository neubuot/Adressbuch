/**
 * MyCard-Komponente: Bearbeitung der eigenen Adresskarte
 */

import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { getP2PManager } from '../p2p/p2p-manager';
import type { AddressCard } from '../types';

interface MyCardProps {
  onBack: () => void;
}

export const MyCard: React.FC<MyCardProps> = ({ onBack }) => {
  const { appState } = useAppContext();
  // Automerge-Proxy zu reinem JS-Objekt konvertieren
  const [formData, setFormData] = useState<AddressCard>(
    JSON.parse(JSON.stringify(appState.myCard))
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (field: keyof AddressCard, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await store.updateMyCard(formData);

      // Trigger Resync für alle Verbindungen
      const manager = getP2PManager();
      if (manager) {
        await manager.resyncAll();
      }

      alert('Änderungen gespeichert');
    } catch (error) {
      console.error('Fehler beim Speichern', error);
      alert('Fehler beim Speichern');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem' }}>
        <button className="btn btn-secondary btn-small" onClick={onBack}>
          ← Zurück
        </button>
        <h2 style={{ marginLeft: '1rem' }}>Meine Adresse</h2>
      </div>

      <div className="card">
        <div className="grid grid-2">
          <div className="form-group">
            <label htmlFor="firstName">Vorname</label>
            <input
              id="firstName"
              type="text"
              value={formData.firstName}
              onChange={(e) => handleChange('firstName', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="lastName">Nachname</label>
            <input
              id="lastName"
              type="text"
              value={formData.lastName}
              onChange={(e) => handleChange('lastName', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">E-Mail</label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="phone">Telefon</label>
            <input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="street">Straße</label>
            <input
              id="street"
              type="text"
              value={formData.street}
              onChange={(e) => handleChange('street', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="postalCode">PLZ</label>
            <input
              id="postalCode"
              type="text"
              value={formData.postalCode}
              onChange={(e) => handleChange('postalCode', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="city">Stadt</label>
            <input
              id="city"
              type="text"
              value={formData.city}
              onChange={(e) => handleChange('city', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="country">Land</label>
            <input
              id="country"
              type="text"
              value={formData.country}
              onChange={(e) => handleChange('country', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="organization">Organisation</label>
            <input
              id="organization"
              type="text"
              value={formData.organization}
              onChange={(e) => handleChange('organization', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="birthday">Geburtstag</label>
            <input
              id="birthday"
              type="date"
              value={formData.birthday}
              onChange={(e) => handleChange('birthday', e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Speichern...' : 'Speichern'}
          </button>
          <button className="btn btn-secondary" onClick={onBack}>
            Abbrechen
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem', backgroundColor: '#fef3c7' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>ℹ️ Hinweis zur Privatsphäre</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Du bestimmst für jede Verbindung einzeln, welche Felder geteilt werden. Standardmäßig
          werden keine Daten geteilt. Gehe zu "Verbindungen" um Freigaben zu verwalten.
        </p>
      </div>
    </div>
  );
};
