/**
 * Kontakte direkt aus einem Microsoft-Konto holen (Outlook, Microsoft 365).
 *
 * Wie bei Google spricht der Browser unmittelbar mit Microsoft: Anmeldung in
 * einem eigenen Fenster, Zugriff nur lesend. Der Zugang gilt kurz, liegt nur
 * im Arbeitsspeicher und wird nicht gespeichert. Der eigene Server ist nicht
 * beteiligt und sieht keine Kontakte.
 *
 * Voraussetzung ist eine beim Bauen gesetzte Kennung
 * (VITE_MICROSOFT_CLIENT_ID) aus dem Microsoft Entra Admin Center:
 * App-Registrierung mit der Plattform "Single-Page-Anwendung" und
 * <Adresse der App>/oauth.html als Umleitungs-URI, dazu die delegierte
 * Berechtigung "Contacts.Read" von Microsoft Graph. Ohne Kennung bietet die
 * App diese Quelle nicht an.
 *
 * Anders als bei Google läuft die Anmeldung mit einem Einmalcode, den der
 * Browser selbst gegen den Zugang tauscht (Autorisierungscode mit PKCE).
 * Ein Client-Schlüssel wird dabei nicht gebraucht.
 */

import type { RemoteCard } from '../types';
import { splitStreet } from '../store/migrate';
import type { ImportedContact } from './vcard';
import { ImportAccessError, oauthRedirectUri, openOAuthPopup, randomToken } from './oauth-popup';

export const MICROSOFT_SOURCE_ID = 'microsoft';
export const MICROSOFT_SOURCE_NAME = 'Microsoft-Kontakte';

const SCOPE = 'https://graph.microsoft.com/Contacts.Read';
const GRAPH_ORIGIN = 'https://graph.microsoft.com';
const CONTACTS_URL = `${GRAPH_ORIGIN}/v1.0/me/contacts`;
const FIELDS =
  'id,givenName,surname,title,nickName,emailAddresses,mobilePhone,businessPhones,homePhones,homeAddress,businessAddress,companyName,jobTitle,department,birthday,businessHomePage,personalNotes';
const MAX_PAGES = 200;

export function getMicrosoftClientId(): string {
  return (import.meta.env?.VITE_MICROSOFT_CLIENT_ID ?? '').trim();
}

export function canImportFromMicrosoft(): boolean {
  return getMicrosoftClientId() !== '' && typeof crypto !== 'undefined' && !!crypto.subtle;
}

/**
 * Welche Konten sich anmelden dürfen: "common" (Standard) lässt private und
 * geschäftliche Konten zu, "consumers" nur private, "organizations" nur
 * geschäftliche. Eine Mandantenkennung beschränkt auf eine Organisation.
 */
function authority(): string {
  const tenant = (import.meta.env?.VITE_MICROSOFT_TENANT ?? '').trim();
  return `https://login.microsoftonline.com/${/^[A-Za-z0-9.-]+$/.test(tenant) ? tenant : 'common'}/oauth2/v2.0`;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Prüfsumme des Geheimwerts, mit der Microsoft den späteren Tausch prüft */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/**
 * Öffnet das Anmeldefenster von Microsoft und liefert einen kurzlebigen
 * Zugang. Muss direkt aus einem Tipp oder Klick heraus aufgerufen werden.
 */
export async function requestMicrosoftAccess(signal?: AbortSignal): Promise<string> {
  const state = randomToken();
  const verifier = randomToken(48);
  const redirectUri = oauthRedirectUri();
  const clientId = getMicrosoftClientId();

  const url = pkceChallenge(verifier).then((challenge) => {
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      // Antwort hinter dem #, damit der Code nicht in Protokollen des Servers landet
      response_mode: 'fragment',
      scope: SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return `${authority()}/authorize?${params.toString()}`;
  });

  // Das Fenster öffnet sich sofort, noch im selben Klick
  const result = await openOAuthPopup(url, state, 'adressbuch-microsoft', signal);
  const code = result.get('code');
  if (!code) throw new ImportAccessError('Microsoft hat den Zugriff nicht erlaubt.', 'denied');

  let response: Response;
  try {
    response = await fetch(`${authority()}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        scope: SCOPE,
      }).toString(),
      credentials: 'omit',
      cache: 'no-store',
      signal,
    });
  } catch {
    if (signal?.aborted) throw new ImportAccessError('Die Anmeldung wurde abgebrochen.', 'cancelled');
    throw new ImportAccessError('Microsoft ist gerade nicht erreichbar.', 'network');
  }
  if (!response.ok) throw new ImportAccessError('Microsoft hat den Zugriff nicht erlaubt.', 'denied');
  const body = (await response.json()) as { access_token?: unknown };
  if (typeof body.access_token !== 'string' || !body.access_token) {
    throw new ImportAccessError('Microsoft hat den Zugriff nicht erlaubt.', 'denied');
  }
  return body.access_token;
}

// --- Zuordnung ---

interface GraphAddress {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  countryOrRegion?: string | null;
}

/** Ausschnitt eines Kontakts aus Microsoft Graph */
export interface GraphContact {
  id?: string;
  givenName?: string | null;
  surname?: string | null;
  title?: string | null;
  nickName?: string | null;
  emailAddresses?: Array<{ address?: string | null; name?: string | null }> | null;
  mobilePhone?: string | null;
  businessPhones?: string[] | null;
  homePhones?: string[] | null;
  homeAddress?: GraphAddress | null;
  businessAddress?: GraphAddress | null;
  companyName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  birthday?: string | null;
  businessHomePage?: string | null;
  personalNotes?: string | null;
}

function text(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function list(values: unknown): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of Array.isArray(values) ? values : []) {
    const entry = text(value);
    if (entry && !seen.has(entry)) {
      seen.add(entry);
      result.push(entry);
    }
  }
  return result;
}

function hasAddress(address: GraphAddress | null | undefined): address is GraphAddress {
  return !!address && [address.street, address.city, address.postalCode, address.countryOrRegion].some((part) => text(part));
}

/** Übersetzt Kontakte aus Microsoft Graph in Einträge für den Import */
export function fromGraphContacts(items: GraphContact[]): ImportedContact[] {
  const contacts: ImportedContact[] = [];

  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== 'object') continue;
    const card: RemoteCard = {};

    card.firstName = text(item.givenName);
    card.lastName = text(item.surname);
    card.titlePrefix = text(item.title);
    card.nickname = text(item.nickName);

    // Microsoft kennzeichnet E-Mail-Adressen nicht als privat oder geschäftlich
    const emails = list((item.emailAddresses ?? []).map((entry) => entry?.address));
    card.emailPrivate = emails[0] ?? '';
    card.emailWork = emails[1] ?? '';

    const mobile = text(item.mobilePhone);
    const business = list(item.businessPhones);
    const home = list(item.homePhones);
    card.phoneMobile = mobile || home[0] || '';
    card.phoneWork = business[0] ?? '';
    const usedPhones = new Set([card.phoneMobile, card.phoneWork]);
    const morePhones = [...home, ...business].filter((value) => !usedPhones.has(value));

    const address = hasAddress(item.homeAddress) ? item.homeAddress : hasAddress(item.businessAddress) ? item.businessAddress : null;
    if (address) {
      const street = text(address.street).split('\n')[0].trim();
      const parts = street ? splitStreet(street) : null;
      card.street = parts ? parts.street : street;
      if (parts) card.houseNumber = parts.houseNumber;
      card.city = text(address.city);
      card.postalCode = text(address.postalCode);
      card.state = text(address.state);
      card.country = text(address.countryOrRegion);
    }

    card.organization = text(item.companyName);
    card.position = text(item.jobTitle);
    card.department = text(item.department);
    // Microsoft liefert den Geburtstag als Zeitpunkt; gebraucht wird nur der Tag
    const birthday = text(item.birthday).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (birthday) card.birthday = `${birthday[1]}-${birthday[2]}-${birthday[3]}`;

    const page = text(item.businessHomePage);
    const lower = page.toLowerCase();
    if (lower.includes('linkedin.')) card.linkedin = page;
    else if (lower.includes('xing.')) card.xing = page;
    else if (lower.includes('github.')) card.github = page;
    else card.website = page;

    for (const key of Object.keys(card) as Array<keyof RemoteCard>) {
      if (!card[key]) delete card[key];
    }
    if (Object.keys(card).length === 0) continue;

    const contact: ImportedContact = { card };
    const externalId = text(item.id, 200);
    if (externalId) contact.externalId = externalId;
    const notes = text(item.personalNotes, 5000);
    if (notes) contact.notes = notes;
    const moreEmails = emails.slice(2, 22);
    if (moreEmails.length > 0 || morePhones.length > 0) {
      contact.extra = {
        ...(moreEmails.length > 0 ? { emails: moreEmails } : {}),
        ...(morePhones.length > 0 ? { phones: morePhones.slice(0, 20) } : {}),
      };
    }
    contacts.push(contact);
  }
  return contacts;
}

/** Holt alle Kontakte aus dem Standardordner des angemeldeten Kontos, seitenweise */
export async function fetchMicrosoftContacts(accessToken: string, signal?: AbortSignal): Promise<ImportedContact[]> {
  const items: GraphContact[] = [];
  let next = `${CONTACTS_URL}?${new URLSearchParams({ $top: '100', $select: FIELDS }).toString()}`;

  for (let page = 0; page < MAX_PAGES && next; page++) {
    let response: Response;
    try {
      response = await fetch(next, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'omit',
        cache: 'no-store',
        signal,
      });
    } catch {
      if (signal?.aborted) throw new ImportAccessError('Die Anmeldung wurde abgebrochen.', 'cancelled');
      throw new ImportAccessError('Microsoft ist gerade nicht erreichbar.', 'network');
    }
    if (response.status === 401 || response.status === 403) {
      throw new ImportAccessError('Microsoft hat den Zugriff auf die Kontakte nicht erlaubt.', 'denied');
    }
    if (!response.ok) throw new ImportAccessError('Microsoft hat mit einem Fehler geantwortet.', 'network');

    const body = (await response.json()) as { value?: GraphContact[]; '@odata.nextLink'?: unknown };
    if (Array.isArray(body.value)) items.push(...body.value);
    const link = body['@odata.nextLink'];
    // Der Zugang geht nur an Microsoft Graph, auch wenn die Antwort etwas anderes nennt
    next = typeof link === 'string' && link.startsWith(`${GRAPH_ORIGIN}/`) ? link : '';
  }
  return fromGraphContacts(items);
}

/** Anmeldung und Abruf in einem Schritt */
export async function importFromMicrosoft(signal?: AbortSignal): Promise<ImportedContact[]> {
  const token = await requestMicrosoftAccess(signal);
  return fetchMicrosoftContacts(token, signal);
}
