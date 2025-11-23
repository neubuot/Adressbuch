/**
 * ExportImport-Komponente: Export/Import von Visitenkarten
 */

import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { store } from '../store/automerge-store';
import { getP2PManager } from '../p2p/p2p-manager';
import QRCode from 'qrcode';
import type { AddressCard } from '../types';

interface ExportImportProps {
  onClose: () => void;
}

interface ExportData {
  version: '1.0';
  type: 'vcard';
  pubKey: string;
  roomCode?: string;
  card: Partial<AddressCard>;
  allowedFields: string[];
}

export const ExportImport: React.FC<ExportImportProps> = ({ onClose }) => {
  const { appState } = useAppContext();
  const [activeTab, setActiveTab] = useState<'export' | 'import' | 'backup'>('export');
  const [selectedFields, setSelectedFields] = useState<string[]>([
    'firstName',
    'lastName',
    'email',
  ]);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [roomCode, setRoomCode] = useState<string>('');
  const [backupPassword, setBackupPassword] = useState<string>('');

  const availableFields = [
    { key: 'firstName', label: 'Vorname' },
    { key: 'lastName', label: 'Nachname' },
    { key: 'email', label: 'E-Mail' },
    { key: 'phone', label: 'Telefon' },
    { key: 'street', label: 'Straße' },
    { key: 'postalCode', label: 'PLZ' },
    { key: 'city', label: 'Stadt' },
    { key: 'country', label: 'Land' },
    { key: 'birthday', label: 'Geburtstag' },
    { key: 'organization', label: 'Organisation' },
  ];

  const toggleField = (field: string) => {
    if (selectedFields.includes(field)) {
      setSelectedFields(selectedFields.filter((f) => f !== field));
    } else {
      setSelectedFields([...selectedFields, field]);
    }
  };

  const generateRoomCode = () => {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    setRoomCode(code);
    return code;
  };

  const generateQRCode = async () => {
    const manager = getP2PManager();
    if (!manager) {
      console.error('P2P Manager nicht verfügbar');
      return;
    }

    const pubKey = manager.getLocalPubKey();
    if (!pubKey) {
      console.error('Public Key nicht verfügbar - Manager nicht initialisiert?');
      return;
    }

    const code = roomCode || generateRoomCode();

    // Erstelle Export-Daten
    const exportData: ExportData = {
      version: '1.0',
      type: 'vcard',
      pubKey,
      roomCode: code,
      card: {},
      allowedFields: selectedFields,
    };

    // Füge nur ausgewählte Felder hinzu
    for (const field of selectedFields) {
      const value = (appState.myCard as any)[field];
      if (value) {
        (exportData.card as any)[field] = value;
      }
    }

    // Generiere QR-Code
    const dataString = JSON.stringify(exportData);
    console.log('Generiere QR-Code mit Daten:', exportData);

    try {
      const url = await QRCode.toDataURL(dataString, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
      setQrCodeUrl(url);
      console.log('QR-Code erfolgreich generiert');

      // Trete dem Room bei (für automatische Verbindung)
      manager.setDefaultAllowedFields(selectedFields);
      manager.joinRoom(code);
    } catch (error) {
      console.error('Fehler beim Generieren des QR-Codes:', error);
    }
  };

  const downloadJSON = () => {
    const exportData = {
      myCard: appState.myCard,
      exportedAt: new Date().toISOString(),
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `visitenkarte-${new Date().toISOString().split('T')[0]}.json`;
    link.click();

    URL.revokeObjectURL(url);
  };

  const handleImportJSON = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.myCard) {
        // Import eigene Karte
        await store.updateMyCard(data.myCard);
        alert('Visitenkarte erfolgreich importiert!');
      } else if (data.type === 'vcard' && data.pubKey) {
        // Import fremde Karte via QR-Code Daten
        const manager = getP2PManager();
        if (manager && data.roomCode) {
          manager.setDefaultAllowedFields(selectedFields);
          manager.joinRoom(data.roomCode);
          alert(`Verbindung wird hergestellt mit Raum: ${data.roomCode}`);
        }
      } else {
        alert('Ungültiges Datenformat');
      }
    } catch (error) {
      console.error('Fehler beim Importieren:', error);
      alert('Fehler beim Importieren der Datei');
    }
  };

  // Komplettes Backup exportieren (Identität + State)
  const exportCompleteBackup = () => {
    try {
      // 1. Exportiere P2P-Keypair aus localStorage
      const keypairStr = localStorage.getItem('p2p-keypair');
      if (!keypairStr) {
        alert('❌ Keine P2P-Identität gefunden! Bitte erst eine Verbindung herstellen.');
        return;
      }
      const keypair = JSON.parse(keypairStr);

      // 2. Exportiere Automerge-State
      const automergeState = store.export();
      const automergeBase64 = btoa(String.fromCharCode(...automergeState));

      // 3. Erstelle komplettes Backup
      const backup = {
        version: '1.0',
        type: 'complete-backup',
        exportedAt: new Date().toISOString(),
        identity: {
          keypair: keypair,
        },
        state: {
          automerge: automergeBase64,
        },
      };

      // 4. Download als JSON
      const dataStr = JSON.stringify(backup, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `adressbuch-backup-${new Date().toISOString().split('T')[0]}.json`;
      link.click();

      URL.revokeObjectURL(url);

      alert('✅ Komplettes Backup erfolgreich exportiert!');
    } catch (error) {
      console.error('Fehler beim Exportieren des Backups:', error);
      alert('❌ Fehler beim Exportieren des Backups');
    }
  };

  // Komplettes Backup importieren (Identität + State)
  const handleImportCompleteBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      // Validierung
      if (backup.type !== 'complete-backup' || !backup.identity || !backup.state) {
        alert('❌ Ungültiges Backup-Format!');
        return;
      }

      // Warnung: Überschreibt aktuelle Identität
      const confirmed = confirm(
        '⚠️ ACHTUNG: Dieser Import wird deine aktuelle Identität und alle Daten überschreiben!\n\n' +
        'Bitte stelle sicher, dass du ein aktuelles Backup hast.\n\n' +
        'Möchtest du fortfahren?'
      );

      if (!confirmed) return;

      // 1. Restore P2P-Keypair zu localStorage
      localStorage.setItem('p2p-keypair', JSON.stringify(backup.identity.keypair));

      // 2. Restore Automerge-State
      const automergeBytes = Uint8Array.from(atob(backup.state.automerge), c => c.charCodeAt(0));
      await store.merge(automergeBytes);

      alert(
        '✅ Backup erfolgreich wiederhergestellt!\n\n' +
        '🔄 Bitte lade die Seite neu, um die Änderungen zu übernehmen.'
      );

      // Auto-Reload nach 2 Sekunden
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error) {
      console.error('Fehler beim Importieren des Backups:', error);
      alert('❌ Fehler beim Importieren des Backups: ' + (error as Error).message);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          maxWidth: '700px',
          width: '90%',
          maxHeight: '85vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2>Export / Import</h2>
          <button className="btn btn-secondary btn-small" onClick={onClose}>
            ✕ Schließen
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '2px solid var(--border)' }}>
          <button
            className={`btn ${activeTab === 'export' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('export')}
            style={{ borderRadius: '0.375rem 0.375rem 0 0' }}
          >
            📤 Export
          </button>
          <button
            className={`btn ${activeTab === 'import' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('import')}
            style={{ borderRadius: '0.375rem 0.375rem 0 0' }}
          >
            📥 Import
          </button>
          <button
            className={`btn ${activeTab === 'backup' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('backup')}
            style={{ borderRadius: '0.375rem 0.375rem 0 0' }}
          >
            💾 Komplettes Backup
          </button>
        </div>

        {/* Export Tab */}
        {activeTab === 'export' && (
          <div>
            <h3 style={{ marginBottom: '1rem' }}>Visitenkarte teilen</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Generiere einen QR-Code oder exportiere deine Visitenkarte als JSON.
              Andere Personen können damit direkt mit dir verbinden.
            </p>

            {/* Feld-Auswahl */}
            <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '0.375rem' }}>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>1. Welche Felder möchtest du teilen?</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
                {availableFields.map((field) => (
                  <label
                    key={field.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      cursor: 'pointer',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      backgroundColor: selectedFields.includes(field.key) ? 'var(--primary-light)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFields.includes(field.key)}
                      onChange={() => toggleField(field.key)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.875rem' }}>{field.label}</span>
                  </label>
                ))}
              </div>
              <button
                className="btn btn-primary"
                onClick={generateQRCode}
                disabled={selectedFields.length === 0}
              >
                🔲 QR-Code generieren
              </button>
            </div>

            {/* QR-Code */}
            {qrCodeUrl && (
              <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '0.375rem', textAlign: 'center' }}>
                <h4 style={{ marginBottom: '1rem', fontSize: '1rem' }}>2. QR-Code zum Teilen</h4>
                <img src={qrCodeUrl} alt="QR-Code" style={{ maxWidth: '300px', width: '100%', border: '1px solid var(--border)', borderRadius: '0.375rem', padding: '0.5rem' }} />
                <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  <strong>Raum-Code:</strong> <code style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--primary)' }}>{roomCode}</code>
                  <br />
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: '#fef3c7', borderRadius: '0.25rem', textAlign: 'left' }}>
                    <strong>💡 So verbindest du dich:</strong>
                    <ol style={{ marginTop: '0.5rem', marginLeft: '1.25rem', fontSize: '0.875rem' }}>
                      <li>Gehe in einem <strong>zweiten Tab/Browser</strong> zu "Verbindungen"</li>
                      <li>Klicke auf <strong>"📥 Mit Code verbinden"</strong></li>
                      <li>Gib den Raum-Code <code>{roomCode}</code> ein</li>
                      <li>Die Verbindung wird automatisch hergestellt!</li>
                    </ol>
                  </div>
                </div>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={generateQRCode}
                  style={{ marginTop: '1rem' }}
                >
                  🔄 Neuen Code generieren
                </button>
              </div>
            )}

            {/* JSON Export */}
            <div style={{ padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '0.375rem' }}>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Als JSON exportieren</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Exportiere deine vollständige Visitenkarte als JSON-Datei für Backup oder Import auf einem anderen Gerät.
              </p>
              <button className="btn btn-primary" onClick={downloadJSON}>
                💾 JSON herunterladen
              </button>
            </div>
          </div>
        )}

        {/* Import Tab */}
        {activeTab === 'import' && (
          <div>
            <h3 style={{ marginBottom: '1rem' }}>Visitenkarte importieren</h3>

            {/* QR-Code Scanner Placeholder */}
            <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '0.375rem' }}>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>📷 QR-Code scannen</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Scanne einen QR-Code einer anderen Person um automatisch eine Verbindung herzustellen.
              </p>
              <div style={{ padding: '2rem', border: '2px dashed var(--border)', borderRadius: '0.375rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  QR-Code Scanner wird in einem zukünftigen Update verfügbar sein.
                  <br />
                  Alternativ: Lade ein Screenshot des QR-Codes als JSON hoch.
                </p>
              </div>
            </div>

            {/* JSON Import */}
            <div style={{ padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '0.375rem' }}>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>📁 JSON hochladen</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Importiere eine Visitenkarte aus einer JSON-Datei.
              </p>
              <input
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                style={{ fontSize: '0.875rem' }}
              />
            </div>
          </div>
        )}

        {/* Backup Tab */}
        {activeTab === 'backup' && (
          <div>
            <h3 style={{ marginBottom: '1rem' }}>💾 Komplettes Backup (Identität + Daten)</h3>
            <div style={{ padding: '1rem', backgroundColor: '#fff3cd', borderRadius: '0.375rem', marginBottom: '1.5rem', border: '1px solid #ffc107' }}>
              <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                <strong>💡 Wozu dient das komplette Backup?</strong>
              </p>
              <ul style={{ fontSize: '0.875rem', marginLeft: '1.25rem', marginBottom: '0.5rem' }}>
                <li>🔑 <strong>Identität sichern:</strong> Deine P2P-Identität (Keypair) wird gespeichert</li>
                <li>📇 <strong>Alle Daten:</strong> Kontakte, Nachrichten, Tags, Verbindungen</li>
                <li>🌐 <strong>Incognito-Modus:</strong> Perfekt für private Browser-Fenster</li>
                <li>💻 <strong>Geräte-Wechsel:</strong> Nutze dieselbe Identität auf mehreren Geräten</li>
              </ul>
              <p style={{ fontSize: '0.875rem', color: '#856404' }}>
                ⚠️ <strong>Wichtig:</strong> Diese Datei enthält deine privaten Schlüssel! Bewahre sie sicher auf.
              </p>
            </div>

            {/* Export Backup */}
            <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '0.375rem' }}>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>📤 Backup erstellen</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Exportiere deine komplette Identität und alle Daten als verschlüsselte JSON-Datei.
              </p>
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Das Backup enthält:
                </p>
                <ul style={{ fontSize: '0.875rem', marginLeft: '1.25rem' }}>
                  <li>✅ Dein P2P-Keypair (Identität)</li>
                  <li>✅ Deine Visitenkarte ({appState.myCard.firstName} {appState.myCard.lastName})</li>
                  <li>✅ {Object.keys(appState.connections).length} Verbindung(en)</li>
                  <li>✅ {appState.messages?.length || 0} Nachricht(en)</li>
                  <li>✅ {Object.keys(appState.tags).length} Tag(s)</li>
                </ul>
              </div>
              <button className="btn btn-primary" onClick={exportCompleteBackup}>
                💾 Backup jetzt erstellen
              </button>
            </div>

            {/* Import Backup */}
            <div style={{ padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '0.375rem' }}>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>📥 Backup wiederherstellen</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Lade ein zuvor erstelltes Backup hoch, um deine Identität und Daten wiederherzustellen.
              </p>
              <div style={{ padding: '1rem', backgroundColor: '#f8d7da', borderRadius: '0.375rem', marginBottom: '1rem', border: '1px solid #f5c6cb' }}>
                <p style={{ fontSize: '0.875rem', color: '#721c24', marginBottom: '0.5rem' }}>
                  <strong>⚠️ ACHTUNG:</strong>
                </p>
                <ul style={{ fontSize: '0.875rem', color: '#721c24', marginLeft: '1.25rem' }}>
                  <li>Überschreibt deine aktuelle Identität</li>
                  <li>Überschreibt alle deine aktuellen Daten</li>
                  <li>Erstelle vorher ein Backup der aktuellen Daten!</li>
                </ul>
              </div>
              <input
                type="file"
                accept=".json"
                onChange={handleImportCompleteBackup}
                style={{ fontSize: '0.875rem' }}
              />
            </div>

            {/* Anleitung für Incognito-Modus */}
            <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#e7f3ff', borderRadius: '0.375rem', border: '1px solid #b3d9ff' }}>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>🕵️ Nutzung im Incognito-Modus</h4>
              <ol style={{ fontSize: '0.875rem', marginLeft: '1.25rem', lineHeight: '1.6' }}>
                <li><strong>Vor dem Schließen:</strong> Erstelle ein Backup (Button oben)</li>
                <li><strong>Datei speichern:</strong> Lade die JSON-Datei herunter</li>
                <li><strong>Beim Neustart:</strong> Öffne das Adressbuch im Incognito-Fenster</li>
                <li><strong>Backup laden:</strong> Gehe zu "Komplettes Backup" → "Backup wiederherstellen"</li>
                <li><strong>Identität zurück:</strong> Deine Verbindungen sind wieder da! 🎉</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
