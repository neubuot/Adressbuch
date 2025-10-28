/**
 * Unit-Tests für Policy-Engine
 */

import { describe, it, expect } from 'vitest';
import { projectFields, validatePolicy } from './policy';
import type { AddressCard } from '../types';

describe('Policy Engine', () => {
  const testCard: AddressCard = {
    id: '123',
    firstName: 'Max',
    lastName: 'Mustermann',
    street: 'Musterstraße 1',
    postalCode: '12345',
    city: 'Berlin',
    country: 'Deutschland',
    email: 'max@example.com',
    phone: '+49123456789',
    birthday: '1990-01-01',
    organization: 'Musterfirma',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  describe('projectFields', () => {
    it('sollte nur erlaubte Felder zurückgeben', () => {
      const allowedFields = ['firstName', 'lastName', 'email'];
      const result = projectFields(testCard, allowedFields);

      expect(result).toEqual({
        firstName: 'Max',
        lastName: 'Mustermann',
        email: 'max@example.com',
      });
    });

    it('sollte leeres Objekt zurückgeben, wenn keine Felder erlaubt sind', () => {
      const result = projectFields(testCard, []);
      expect(result).toEqual({});
    });

    it('sollte ungültige Felder ignorieren', () => {
      const allowedFields = ['firstName', 'invalidField', 'email'];
      const result = projectFields(testCard, allowedFields);

      expect(result).toEqual({
        firstName: 'Max',
        email: 'max@example.com',
      });
    });

    it('sollte alle Felder zurückgeben, wenn alle erlaubt sind', () => {
      const allowedFields = [
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
      const result = projectFields(testCard, allowedFields);

      expect(result).toEqual(testCard);
    });
  });

  describe('validatePolicy', () => {
    it('sollte gültige Policies akzeptieren', () => {
      expect(validatePolicy(['firstName', 'lastName', 'email'])).toBe(true);
      expect(validatePolicy(['street', 'city', 'postalCode'])).toBe(true);
      expect(validatePolicy([])).toBe(true);
    });

    it('sollte Custom-Felder akzeptieren', () => {
      expect(validatePolicy(['firstName', 'custom.twitter'])).toBe(true);
      expect(validatePolicy(['custom.field1', 'custom.field2'])).toBe(true);
    });

    it('sollte ungültige Felder ablehnen', () => {
      expect(validatePolicy(['firstName', 'invalidField'])).toBe(false);
      expect(validatePolicy(['notAField'])).toBe(false);
    });
  });
});
