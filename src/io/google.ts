/**
 * Kontakte direkt aus Google Kontakte holen.
 *
 * Der Browser spricht dabei unmittelbar mit Google: Anmeldung in einem
 * eigenen Fenster, Zugriff nur lesend. Der Zugang gilt kurz, liegt nur im
 * Arbeitsspeicher und wird nicht gespeichert. Der eigene Server ist nicht
 * beteiligt und sieht keine Kontakte.
 *
 * Voraussetzung ist eine beim Bauen gesetzte Kennung (VITE_GOOGLE_CLIENT_ID)
 * aus der Google Cloud Console, Typ "Webanwendung", mit dieser App als
 * zugelassener Herkunft und <Adresse der App>/oauth.html als Weiterleitung.
 * Ohne Kennung bietet die App diese Quelle nicht an.
 */

import type { RemoteCard } from '../types';
import { splitStreet } from '../store/migrate';
import type { ImportedContact } from './vcard';

export const GOOGLE_SOURCE_ID = 'google';
export const GOOGLE_SOURCE_NAME = 'Google Kontakte';

const SCOPE = 'https://www.googleapis.com/auth/contacts.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const PEOPLE_URL = 'https://people.googleapis.com/v1/people/me/connections';
const PERSON_FIELDS = 'names,nicknames,emailAddresses,phoneNumbers,addresses,organizations,birthdays,urls,biographies';
const MAX_PAGES = 50;

export function getGoogleClientId(): string {
  return (import.meta.env?.VITE_GOOGLE_CLIENT_ID ?? '').trim();
}

export function canImportFromGoogle(): boolean {
  return getGoogleClientId() !== '';
}

/** Adresse der kleinen Seite, die das Ergebnis der Anmeldung zurückreicht */
export function googleRedirectUri(): string {
  const url = new URL('oauth.html', document.baseURI);
  url.hash = '';
  url.search = '';
  return url.toString();
}

export class GoogleImportError extends Error {
  constructor(
    message: string,
    readonly kind: 'cancelled' | 'blocked' | 'denied' | 'network'
  ) {
    super(message);
  }
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Kanal, über den oauth.html das Ergebnis der Anmeldung zurückreicht */
export const OAUTH_CHANNEL = 'adressbuch-oauth';
const ACCESS_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Öffnet das Anmeldefenster von Google und liefert einen kurzlebigen Zugang.
 * Muss direkt aus einem Tipp oder Klick heraus aufgerufen werden, sonst
 * unterdrückt der Browser das Fenster.
 *
 * Das Ergebnis kommt über einen Kanal zwischen Fenstern derselben Adresse
 * (BroadcastChannel) zurück, ersatzweise als Nachricht an dieses Fenster.
 * Ob das Anmeldefenster noch offen ist, lässt sich nicht verlässlich
 * feststellen (Google trennt die Verbindung zwischen den Fenstern). Deshalb
 * endet das Warten nur durch Ergebnis, Abbruch über `signal` oder Zeitablauf.
 */
export function requestGoogleAccess(signal?: AbortSignal): Promise<string> {
  const state = randomState();
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: googleRedirectUri(),
    response_type: 'token',
    scope: SCOPE,
    state,
    prompt: 'select_account',
    include_granted_scopes: 'false',
  });

  const popup = window.open(`${AUTH_URL}?${params.toString()}`, 'adressbuch-google', 'popup,width=520,height=680');
  if (!popup) {
    return Promise.reject(new GoogleImportError('Das Anmeldefenster wurde vom Browser unterdrückt.', 'blocked'));
  }

  return new Promise<string>((resolve, reject) => {
    let done = false;
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(OAUTH_CHANNEL) : null;

    const finish = (action: () => void) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      signal?.removeEventListener('abort', onAbort);
      window.clearTimeout(timer);
      channel?.close();
      try {
        popup.close();
      } catch {
        // Fenster ist schon zu oder nicht mehr erreichbar
      }
      action();
    };

    const accept = (data: unknown) => {
      const message = data as { type?: string; hash?: string } | null;
      if (!message || message.type !== OAUTH_CHANNEL || typeof message.hash !== 'string') return;
      const result = new URLSearchParams(message.hash.replace(/^#/, ''));
      if (result.get('state') !== state) return; // gehört nicht zu dieser Anmeldung
      const token = result.get('access_token');
      if (token) finish(() => resolve(token));
      else finish(() => reject(new GoogleImportError('Google hat den Zugriff nicht erlaubt.', 'denied')));
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin) accept(event.data);
    };
    const onAbort = () => finish(() => reject(new GoogleImportError('Die Anmeldung wurde abgebrochen.', 'cancelled')));
    const timer = window.setTimeout(onAbort, ACCESS_TIMEOUT_MS);

    if (channel) channel.onmessage = (event) => accept(event.data);
    window.addEventListener('message', onMessage);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort);
  });
}

// --- Zuordnung ---

interface Tagged {
  value?: string;
  type?: string;
  metadata?: { primary?: boolean };
}

/** Ausschnitt eines Eintrags der People API */
export interface GooglePerson {
  resourceName?: string;
  names?: Array<{ givenName?: string; familyName?: string; honorificPrefix?: string; honorificSuffix?: string; displayName?: string }>;
  nicknames?: Tagged[];
  emailAddresses?: Tagged[];
  phoneNumbers?: Tagged[];
  addresses?: Array<{ streetAddress?: string; city?: string; postalCode?: string; region?: string; countryCode?: string; country?: string }>;
  organizations?: Array<{ name?: string; title?: string; department?: string }>;
  birthdays?: Array<{ date?: { year?: number; month?: number; day?: number } }>;
  urls?: Tagged[];
  biographies?: Tagged[];
}

function text(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isWork(entry: Tagged): boolean {
  return /work|arbeit|gesch/i.test(entry.type ?? '');
}

/** Verteilt Werte auf privat und geschäftlich; der Rest sind weitere Angaben */
function distribute(entries: Tagged[] | undefined): { first: string; work: string; more: string[] } {
  const list = (Array.isArray(entries) ? entries : [])
    .map((entry) => ({ value: text(entry?.value), work: isWork(entry ?? {}), primary: !!entry?.metadata?.primary }))
    .filter((entry) => entry.value !== '');
  const seen = new Set<string>();
  const unique = list.filter((entry) => (seen.has(entry.value) ? false : (seen.add(entry.value), true)));

  const work = unique.find((entry) => entry.work);
  const first = unique.find((entry) => entry !== work && !entry.work) ?? unique.find((entry) => entry !== work);
  const used = new Set([work?.value, first?.value]);
  return {
    first: first?.value ?? '',
    work: work?.value ?? '',
    more: unique.map((entry) => entry.value).filter((value) => !used.has(value)).slice(0, 20),
  };
}

function birthdayOf(person: GooglePerson): string {
  const date = person.birthdays?.[0]?.date;
  if (!date || !date.month || !date.day) return '';
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return date.year ? `${String(date.year).padStart(4, '0')}-${month}-${day}` : `--${month}-${day}`;
}

/** Übersetzt Einträge der People API in Einträge für den Import */
export function fromGooglePeople(people: GooglePerson[]): ImportedContact[] {
  const contacts: ImportedContact[] = [];

  for (const person of Array.isArray(people) ? people : []) {
    if (!person || typeof person !== 'object') continue;
    const card: RemoteCard = {};

    const name = person.names?.[0];
    if (name) {
      card.firstName = text(name.givenName);
      card.lastName = text(name.familyName);
      card.titlePrefix = text(name.honorificPrefix);
      card.titleSuffix = text(name.honorificSuffix);
      if (!card.firstName && !card.lastName) card.lastName = text(name.displayName);
    }
    card.nickname = text(person.nicknames?.[0]?.value);

    const emails = distribute(person.emailAddresses);
    card.emailPrivate = emails.first;
    card.emailWork = emails.work;
    const phones = distribute(person.phoneNumbers);
    card.phoneMobile = phones.first;
    card.phoneWork = phones.work;

    const address = person.addresses?.[0];
    if (address) {
      const street = text(address.streetAddress).split('\n')[0].trim();
      const parts = street ? splitStreet(street) : null;
      card.street = parts ? parts.street : street;
      if (parts) card.houseNumber = parts.houseNumber;
      card.city = text(address.city);
      card.postalCode = text(address.postalCode);
      card.state = text(address.region);
      card.country = text(address.countryCode) || text(address.country);
    }

    const organization = person.organizations?.[0];
    if (organization) {
      card.organization = text(organization.name);
      card.position = text(organization.title);
      card.department = text(organization.department);
    }
    card.birthday = birthdayOf(person);

    for (const entry of Array.isArray(person.urls) ? person.urls : []) {
      const url = text(entry?.value);
      const lower = url.toLowerCase();
      if (!url) continue;
      if (lower.includes('linkedin.')) card.linkedin = card.linkedin || url;
      else if (lower.includes('xing.')) card.xing = card.xing || url;
      else if (lower.includes('github.')) card.github = card.github || url;
      else card.website = card.website || url;
    }

    for (const key of Object.keys(card) as Array<keyof RemoteCard>) {
      if (!card[key]) delete card[key];
    }
    if (Object.keys(card).length === 0) continue;

    const contact: ImportedContact = { card };
    const externalId = text(person.resourceName, 200);
    if (externalId) contact.externalId = externalId;
    const notes = text(person.biographies?.[0]?.value, 5000);
    if (notes) contact.notes = notes;
    if (emails.more.length > 0 || phones.more.length > 0) {
      contact.extra = {
        ...(emails.more.length > 0 ? { emails: emails.more } : {}),
        ...(phones.more.length > 0 ? { phones: phones.more } : {}),
      };
    }
    contacts.push(contact);
  }
  return contacts;
}

/** Holt alle Kontakte des angemeldeten Kontos, seitenweise */
export async function fetchGoogleContacts(accessToken: string): Promise<ImportedContact[]> {
  const people: GooglePerson[] = [];
  let pageToken = '';

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ personFields: PERSON_FIELDS, pageSize: '1000' });
    if (pageToken) params.set('pageToken', pageToken);

    let response: Response;
    try {
      response = await fetch(`${PEOPLE_URL}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'omit',
        cache: 'no-store',
      });
    } catch {
      throw new GoogleImportError('Google ist gerade nicht erreichbar.', 'network');
    }
    if (response.status === 401 || response.status === 403) {
      throw new GoogleImportError('Google hat den Zugriff auf die Kontakte nicht erlaubt.', 'denied');
    }
    if (!response.ok) throw new GoogleImportError('Google hat mit einem Fehler geantwortet.', 'network');

    const body = (await response.json()) as { connections?: GooglePerson[]; nextPageToken?: string };
    if (Array.isArray(body.connections)) people.push(...body.connections);
    pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : '';
    if (!pageToken) break;
  }
  return fromGooglePeople(people);
}

/** Anmeldung und Abruf in einem Schritt */
export async function importFromGoogle(signal?: AbortSignal): Promise<ImportedContact[]> {
  const token = await requestGoogleAccess(signal);
  return fetchGoogleContacts(token);
}
