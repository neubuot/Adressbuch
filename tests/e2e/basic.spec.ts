/**
 * E2E-Tests für grundlegende Funktionalität
 */

import { test, expect } from '@playwright/test';

test('App lädt erfolgreich', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('P2P Adressbuch');
});

test('Navigation funktioniert', async ({ page }) => {
  await page.goto('/');

  // Klicke auf "Meine Adresse"
  await page.click('text=Meine Adresse');
  await expect(page.locator('h2')).toContainText('Meine Adresse');

  // Zurück zum Dashboard
  await page.click('text=Dashboard');
  await expect(page.locator('h2')).toContainText('Dashboard');
});

test('Profil kann bearbeitet werden', async ({ page }) => {
  await page.goto('/');
  await page.click('text=Meine Adresse');

  // Fülle Formular aus
  await page.fill('#firstName', 'Max');
  await page.fill('#lastName', 'Mustermann');
  await page.fill('#email', 'max@example.com');

  // Speichern
  await page.click('button:has-text("Speichern")');

  // Warte auf Alert
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('gespeichert');
    dialog.accept();
  });
});
