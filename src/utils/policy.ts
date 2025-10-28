/**
 * Policy-Engine für feldgenaue Freigabe
 */

import type { AddressCard } from '../types';

/**
 * Projiziert eine AddressCard auf erlaubte Felder
 * Gibt nur die Felder zurück, die in der Whitelist stehen
 */
export function projectFields(
  card: AddressCard,
  allowedFields: string[]
): Partial<AddressCard> {
  const result: Partial<AddressCard> = {};

  for (const field of allowedFields) {
    if (field in card) {
      (result as unknown as Record<string, unknown>)[field] = (card as unknown as Record<string, unknown>)[field];
    }
  }

  return result;
}

/**
 * Prüft, ob alle Felder in der Policy gültig sind
 */
export function validatePolicy(allowedFields: string[]): boolean {
  const validFields = [
    'id',
    'firstName',
    'lastName',
    'street',
    'postalCode',
    'city',
    'country',
    'email',
    'phone',
    'birthday',
    'organization',
    'updatedAt',
  ];

  return allowedFields.every((field) => {
    // Custom-Felder müssen mit 'custom.' beginnen
    if (field.startsWith('custom.')) {
      return true;
    }
    return validFields.includes(field);
  });
}

/**
 * Standard-Policies für schnelle Auswahl
 */
export const POLICY_PRESETS = {
  none: [],
  minimal: ['firstName', 'lastName', 'email'],
  business: ['firstName', 'lastName', 'email', 'phone', 'organization'],
  address: ['firstName', 'lastName', 'street', 'postalCode', 'city', 'country'],
  full: [
    'firstName',
    'lastName',
    'street',
    'postalCode',
    'city',
    'country',
    'email',
    'phone',
    'birthday',
    'organization',
  ],
} as const;

/**
 * Gibt lesbare Label für Felder zurück
 */
export function getFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    firstName: 'Vorname',
    lastName: 'Nachname',
    street: 'Straße',
    postalCode: 'PLZ',
    city: 'Stadt',
    country: 'Land',
    email: 'E-Mail',
    phone: 'Telefon',
    birthday: 'Geburtstag',
    organization: 'Organisation',
  };

  if (field.startsWith('custom.')) {
    return field.substring(7); // "custom." entfernen
  }

  return labels[field] || field;
}
