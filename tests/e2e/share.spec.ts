/**
 * Teilen: Eine andere App übergibt dem installierten Adressbuch eine Datei.
 * Das läuft über den Service Worker, der in den übrigen Tests abgeschaltet ist.
 */

import { test, expect } from '@playwright/test';
import { onboard } from './helpers';

test.use({ serviceWorkers: 'allow' });

test('Eine aus einer anderen App geteilte Kontaktdatei landet beim Übernehmen', async ({ page }) => {
  await page.goto('/');
  await onboard(page, 'Max', 'Mustermann');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  // Android übergibt geteilte Dateien als Formular an ./share (siehe Manifest)
  const manifest = await page.evaluate(() => fetch('./manifest.webmanifest').then((response) => response.json()));
  expect(manifest.share_target.action).toBe('./share');
  const field: string = manifest.share_target.params.files[0].name;

  const answer = await page.evaluate(async (name) => {
    const form = new FormData();
    const card = 'BEGIN:VCARD\nVERSION:3.0\nN:Winter;Ida;;;\nFN:Ida Winter\nTEL;TYPE=CELL:0170 4445556\nEND:VCARD\n';
    form.append(name, new File([card], 'Ida Winter.vcf', { type: 'text/vcard' }));
    const response = await fetch('./share', { method: 'POST', body: form, redirect: 'manual' });
    return response.type;
  }, field);
  expect(answer).toBe('opaqueredirect'); // Weiterleitung zur Ansicht „Kontakte übernehmen“

  await page.goto('/#/mehr/import');
  await expect(page.getByRole('heading', { name: '1 Kontakt gefunden' })).toBeVisible();
  await expect(page.getByText('Ida Winter')).toBeVisible();

  // Die Datei liegt danach nicht mehr im Zwischenspeicher
  expect(await page.evaluate(() => caches.has('geteilte-dateien'))).toBe(false);

  await page.getByRole('button', { name: 'Kontakt übernehmen' }).click();
  await expect(page.getByRole('link', { name: /Ida Winter/ })).toBeVisible();
});
