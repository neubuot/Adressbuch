/**
 * Direkte Aktionen an einem Kontakt: anrufen, mailen, Adresse öffnen,
 * ins Telefonbuch übernehmen.
 */

import type { RemoteCard } from '../types';
import { addressLines, displayNameOfCard } from './contact';
import { toVCard } from '../io/vcard';
import { downloadText } from '../io/backup';

export function phoneHref(card: RemoteCard | undefined): string | null {
  const number = card?.phoneMobile || card?.phoneWork;
  return number ? `tel:${number.replace(/[^\d+]/g, '')}` : null;
}

export function mailHref(card: RemoteCard | undefined): string | null {
  const address = card?.emailPrivate || card?.emailWork;
  return address ? `mailto:${encodeURIComponent(address).replace(/%40/g, '@')}` : null;
}

/**
 * Öffnet die Adresse in der Karten-App des Geräts: Apple Karten auf
 * iPhone/iPad/Mac, die eingestellte Karten-App auf Android, sonst OpenStreetMap.
 */
export function mapHref(card: RemoteCard | undefined, userAgent = navigator.userAgent): string | null {
  const lines = addressLines(card);
  if (lines.length === 0 || !(card?.street || card?.city || card?.postalCode)) return null;
  const query = encodeURIComponent(lines.join(', '));

  if (/iPhone|iPad|iPod|Macintosh/.test(userAgent)) return `https://maps.apple.com/?q=${query}`;
  if (/Android/.test(userAgent)) return `geo:0,0?q=${query}`;
  return `https://www.openstreetmap.org/search?query=${query}`;
}

function fileNameFor(card: RemoteCard, fallback: string): string {
  const name = (displayNameOfCard(card) || fallback)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${name || 'kontakt'}.vcf`;
}

/**
 * Übergibt den Kontakt als vCard. Auf dem Handy bietet das System damit an,
 * ihn ins Telefonbuch zu übernehmen; sonst wird die Datei gespeichert.
 * Gibt zurück, auf welchem Weg das geschah.
 */
export async function saveToAddressBook(
  card: RemoteCard,
  fallbackName: string,
  notes?: string
): Promise<'shared' | 'downloaded'> {
  const content = toVCard(card, notes);
  const filename = fileNameFor(card, fallbackName);

  try {
    const file = new File([content], filename, { type: 'text/vcard' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: displayNameOfCard(card) || fallbackName });
      return 'shared';
    }
  } catch (error) {
    if ((error as DOMException)?.name === 'AbortError') return 'shared';
    // sonst: auf Speichern ausweichen
  }

  downloadText(content, filename, 'text/vcard;charset=utf-8');
  return 'downloaded';
}
