/**
 * ConnectionInvite-Komponente: Anzeige von QR-Code und Verbindungscode
 */

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { generateConnectionCode } from '../utils/crypto';
import { getP2PManager } from '../p2p/p2p-manager';
import { ADDRESS_CARD_FIELDS } from '../types';
import { getFieldLabel } from '../utils/policy';

interface ConnectionInviteProps {
  fields: string[];
  onFieldsChange: (fields: string[]) => void;
  onClose: () => void;
}

export const ConnectionInvite: React.FC<ConnectionInviteProps> = ({
  fields,
  onFieldsChange,
  onClose,
}) => {
  const [roomCode] = useState(generateConnectionCode());
  const [hasJoined, setHasJoined] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // QR-Code generieren
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, roomCode, {
        width: 200,
        margin: 2,
      }).catch(console.error);
    }

    // Raum beitreten
    if (!hasJoined) {
      const manager = getP2PManager();
      if (manager) {
        manager.joinRoom(roomCode);
        setHasJoined(true);
      }
    }
  }, [roomCode, hasJoined]);

  const handleFieldToggle = (field: string) => {
    if (fields.includes(field)) {
      onFieldsChange(fields.filter((f) => f !== field));
    } else {
      onFieldsChange([...fields, field]);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '1rem', backgroundColor: '#f0f9ff' }}>
      <div className="card-header">
        <h3>Verbindungseinladung</h3>
        <button className="btn btn-secondary btn-small" onClick={onClose}>
          ✕ Schließen
        </button>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Verbindungscode:</strong>
          </div>
          <div
            style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              fontFamily: 'monospace',
              letterSpacing: '0.1em',
              marginBottom: '1rem',
            }}
          >
            {roomCode}
          </div>
          <canvas ref={canvasRef} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Freizugebende Felder auswählen:</strong>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {ADDRESS_CARD_FIELDS.map((field) => (
              <label
                key={field}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={fields.includes(field)}
                  onChange={() => handleFieldToggle(field)}
                />
                <span>{getFieldLabel(field)}</span>
              </label>
            ))}
          </div>

          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              backgroundColor: 'white',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
            }}
          >
            <strong>Hinweis:</strong> Der andere Nutzer kann sich mit diesem Code verbinden. Du
            kannst die Freigabe später jederzeit ändern.
          </div>
        </div>
      </div>
    </div>
  );
};
