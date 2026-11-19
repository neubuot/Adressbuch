/**
 * Grundfunktionen: Einstieg, Titel, Navigation, eigene Karte
 */

import { test, expect } from '@playwright/test';
import { onboard, fillCard } from './helpers';

test('Erster Start fragt nur nach dem Namen; der Titel folgt dem Namen', async ({ page }) => {
  await page.goto('/');

  // Ohne Namen: nur "P2P Adressbuch"
  await expect(page.locator('h1')).toHaveText('P2P Adressbuch');
  await expect(page).toHaveTitle('P2P Adressbuch');
  await expect(page.getByRole('button', { name: 'Fertig' })).toBeDisabled();

  await onboard(page, 'Ottmar', 'Neuburger');

  // Mit Namen: "P2P Adressbuch von Vorname Nachname" (mit Leerzeichen)
  await expect(page.locator('h1')).toHaveText('P2P Adressbuch von Ottmar Neuburger');
  await expect(page).toHaveTitle('P2P Adressbuch von Ottmar Neuburger');
  await expect(page.getByRole('heading', { name: 'Kontakte' })).toBeVisible();
});

test('Der Titel passt sich an, wenn nur ein Namensteil vorhanden ist', async ({ page }) => {
  await page.goto('/');
  await onboard(page, 'Max', 'Mustermann');

  await fillCard(page, { lastName: '' });
  await expect(page.locator('h1')).toHaveText('P2P Adressbuch von Max');

  await fillCard(page, { firstName: '  Erika ', lastName: 'Beispiel' });
  await expect(page.locator('h1')).toHaveText('P2P Adressbuch von Erika Beispiel');
});

test('Navigation führt zu allen Bereichen und die Zurück-Taste funktioniert', async ({ page }) => {
  await page.goto('/');
  await onboard(page, 'Max', 'Mustermann');
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });

  await nav.getByRole('link', { name: 'Meine Karte' }).click();
  await expect(page.getByRole('heading', { name: 'Meine Karte' })).toBeVisible();

  await nav.getByRole('link', { name: 'Aktuelles' }).click();
  await expect(page.getByRole('heading', { name: 'Aktuelles' })).toBeVisible();

  await nav.getByRole('link', { name: 'Mehr' }).click();
  await expect(page.getByRole('heading', { name: 'Mehr', exact: true })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Aktuelles' })).toBeVisible();

  await nav.getByRole('link', { name: 'Kontakte' }).click();
  await expect(page.getByRole('heading', { name: 'Kontakte' })).toBeVisible();
});

test('Die Karte zeigt zuerst nur die wichtigsten Felder und bleibt nach dem Neuladen erhalten', async ({ page }) => {
  await page.goto('/');
  await onboard(page, 'Max', 'Mustermann');
  await page.goto('/#/karte');

  await expect(page.locator('#phoneMobile')).toBeVisible();
  await expect(page.locator('#linkedin')).toBeHidden();

  await fillCard(page, {
    phoneMobile: '+49 170 1234567',
    emailPrivate: 'max@example.org',
    linkedin: 'max-mustermann',
    country: 'de',
  });

  await page.reload();
  await expect(page.locator('#firstName')).toHaveValue('Max');
  await expect(page.locator('#phoneMobile')).toHaveValue('+49 170 1234567');
  await expect(page.locator('#country')).toHaveValue('DE');
  await page.locator('summary', { hasText: 'Telefon, E-Mail und Internet' }).click();
  await expect(page.locator('#linkedin')).toHaveValue('max-mustermann');
});

test('Die Oberfläche verwendet keine Fachbegriffe', async ({ page }) => {
  await page.goto('/');
  await onboard(page, 'Max', 'Mustermann');

  for (const path of ['/#/', '/#/verbinden', '/#/karte', '/#/aktuelles', '/#/mehr', '/#/mehr/sicherung', '/#/mehr/export', '/#/mehr/import', '/#/mehr/tags']) {
    await page.goto(path);
    await expect(page.locator('h2').first()).toBeVisible();
    const text = (await page.locator('body').innerText()).replace(/P2P Adressbuch/g, '');
    expect(text, `Fachbegriff auf ${path}`).not.toMatch(/\b(Peer|Fingerprint|Raumcode|Raum-Code|Sync|Synchronisation|Policy|Signaling|WebRTC|P2P)\b/i);
  }
});
