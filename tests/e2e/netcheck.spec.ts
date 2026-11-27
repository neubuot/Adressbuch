/**
 * Verbindung prüfen: Die Ansicht fragt die Hilfsserver und zeigt ein Ergebnis.
 * Welches Ergebnis herauskommt, hängt vom Netz ab, in dem der Test läuft.
 */

import { test, expect } from '@playwright/test';
import { onboard } from './helpers';

test('Verbindung prüfen zeigt ein Ergebnis für das aktuelle Netz, ohne Adressen zu nennen', async ({ page }) => {
  await page.goto('/');
  await onboard(page, 'Max', 'Mustermann');
  await page.goto('/#/mehr');
  await page.getByRole('link', { name: /Verbindung prüfen/ }).click();

  await expect(page.getByTestId('netcheck-service')).toHaveText('erreichbar');
  await page.getByRole('button', { name: 'Jetzt prüfen' }).click();

  const detail = page.getByTestId('netcheck-detail');
  await expect(detail).toBeVisible({ timeout: 20000 });
  const text = await detail.innerText();
  expect(text).toMatch(/^Ergebnis (open|likely|strict|blocked) · eigene Adressen \d+ · von außen \d+ \((gleich|verschieden|nicht vergleichbar)\) · Umweg 0 \(nicht eingerichtet\)$/);
  // Keine IP-Adressen in der Anzeige
  expect(await page.locator('main').innerText()).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);

  await expect(page.getByRole('button', { name: 'Noch einmal prüfen' })).toBeEnabled();
});
