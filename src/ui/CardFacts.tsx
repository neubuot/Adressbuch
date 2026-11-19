/**
 * Zeigt die Angaben einer Karte als Zeilen; Telefonnummern, E-Mail-Adressen
 * und Internetadressen sind direkt anklickbar.
 */

import { CARD_FIELDS } from '../model/fields';
import type { AddressCardField, RemoteCard } from '../types';

function toUrl(field: AddressCardField, value: string): string | null {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null; // andere Schemata nie verlinken
  const handle = trimmed.replace(/^@/, '');
  switch (field) {
    case 'website':
      return /^[^\s/]+\.[^\s]+$/.test(trimmed) ? `https://${trimmed}` : null;
    case 'linkedin':
      return trimmed.includes('.') ? `https://${trimmed}` : `https://www.linkedin.com/in/${encodeURIComponent(handle)}`;
    case 'xing':
      return trimmed.includes('.') ? `https://${trimmed}` : `https://www.xing.com/profile/${encodeURIComponent(handle)}`;
    case 'github':
      return trimmed.includes('.') ? `https://${trimmed}` : `https://github.com/${encodeURIComponent(handle)}`;
    default:
      return null;
  }
}

function formatValue(field: AddressCardField, value: string): React.ReactNode {
  switch (field) {
    case 'phoneMobile':
    case 'phoneWork':
      return <a href={`tel:${value.replace(/[^\d+]/g, '')}`}>{value}</a>;
    case 'emailPrivate':
    case 'emailWork':
      return <a href={`mailto:${encodeURIComponent(value).replace(/%40/g, '@')}`}>{value}</a>;
    case 'website':
    case 'linkedin':
    case 'xing':
    case 'github': {
      const url = toUrl(field, value);
      return url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {value}
        </a>
      ) : (
        value
      );
    }
    case 'birthday': {
      const match = value.match(/^(\d{4}|-{2})-(\d{2})-(\d{2})$/);
      if (!match) return value;
      return match[1] === '--' ? `${match[3]}.${match[2]}.` : `${match[3]}.${match[2]}.${match[1]}`;
    }
    default:
      return value;
  }
}

export const CardFacts: React.FC<{ card: RemoteCard | undefined; plain?: boolean }> = ({ card, plain }) => {
  const fields = CARD_FIELDS.filter((field) => (card?.[field.key] ?? '') !== '');
  if (fields.length === 0) return null;

  return (
    <dl className="facts">
      {fields.map((field) => (
        <div className="fact" key={field.key}>
          <dt>{field.label}</dt>
          <dd>
            {plain && field.key !== 'birthday'
              ? card![field.key]
              : formatValue(field.key, card![field.key]!)}
          </dd>
        </div>
      ))}
    </dl>
  );
};
