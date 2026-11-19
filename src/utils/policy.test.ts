/**
 * Unit-Tests für die Freigabe-Regeln
 */

import { describe, it, expect } from 'vitest';
import { projectFields, validatePolicy, sanitizeRemoteCard, POLICY_PRESETS } from './policy';
import { createEmptyCard, ADDRESS_CARD_FIELDS, type AddressCard } from '../types';
import { describeShare, matchPreset, SHARE_PRESETS, CARD_FIELDS } from '../model/fields';

const testCard: AddressCard = {
  ...createEmptyCard('00000000-0000-4000-8000-000000000000'),
  firstName: 'Max',
  lastName: 'Mustermann',
  street: 'Musterstraße',
  houseNumber: '1',
  postalCode: '12345',
  city: 'Berlin',
  country: 'DE',
  emailPrivate: 'max@example.com',
  phoneMobile: '+49123456789',
  birthday: '1990-01-01',
  organization: 'Musterfirma',
};

describe('projectFields', () => {
  it('gibt nur freigegebene Felder zurück', () => {
    expect(projectFields(testCard, ['firstName', 'lastName', 'emailPrivate'])).toEqual({
      firstName: 'Max',
      lastName: 'Mustermann',
      emailPrivate: 'max@example.com',
    });
  });

  it('gibt ohne Freigabe nichts zurück', () => {
    expect(projectFields(testCard, [])).toEqual({});
  });

  it('überträgt weder leere noch unbekannte Felder noch Interna', () => {
    const result = projectFields(testCard, ['firstName', 'fax', 'id', 'updatedAt', 'gibtEsNicht']);
    expect(result).toEqual({ firstName: 'Max' });
  });
});

describe('validatePolicy', () => {
  it('akzeptiert bekannte Felder', () => {
    expect(validatePolicy(['firstName', 'phoneMobile'])).toBe(true);
    expect(validatePolicy([...ADDRESS_CARD_FIELDS])).toBe(true);
  });

  it('lehnt unbekannte und alte Feldnamen ab', () => {
    expect(validatePolicy(['firstName', 'email'])).toBe(false);
    expect(validatePolicy(['notes'])).toBe(false);
  });
});

describe('sanitizeRemoteCard', () => {
  it('übernimmt nur bekannte Textfelder', () => {
    const result = sanitizeRemoteCard({
      firstName: 'Anna',
      phoneMobile: 123,
      notes: 'privat',
      __proto__: { x: 1 },
      city: '',
    });
    expect(result).toEqual({ firstName: 'Anna' });
  });

  it('verkraftet unbrauchbare Eingaben', () => {
    expect(sanitizeRemoteCard(null)).toEqual({});
    expect(sanitizeRemoteCard('text')).toEqual({});
  });
});

describe('Vorlagen', () => {
  it('enthalten nur gültige Felder', () => {
    for (const preset of SHARE_PRESETS) {
      expect(validatePolicy(preset.fields)).toBe(true);
    }
    expect(POLICY_PRESETS.none).toEqual([]);
  });

  it('werden wiedererkannt und beschrieben', () => {
    expect(matchPreset(['lastName', 'phoneMobile', 'firstName'])?.id).toBe('namePhone');
    expect(describeShare([])).toBe('Nichts freigegeben');
    expect(describeShare(['firstName'])).toBe('1 Angabe');
    expect(describeShare(CARD_FIELDS.map((f) => f.key))).toBe('Alles');
  });

  it('jedes Kartenfeld hat eine Beschreibung', () => {
    expect(CARD_FIELDS.map((f) => f.key).sort()).toEqual([...ADDRESS_CARD_FIELDS].sort());
  });
});
