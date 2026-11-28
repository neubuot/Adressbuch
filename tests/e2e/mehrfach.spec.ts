/**
 * Mehrfachauswahl in der Kontaktliste: suchen, alle Treffer auswählen und
 * gemeinsam löschen oder mit einem Tag versehen.
 */

import { test, expect, type Page } from '@playwright/test';
import { openApp, onboard, connect } from './helpers';

async function importCsv(page: Page, rows: string[], total = rows.length): Promise<void> {
  await page.goto('/#/mehr/import');
  const csv = ['Vorname;Nachname;Ort', ...rows, ''].join('\n');
  await page.getByLabel('Datei auswählen').setInputFiles({ name: 'liste.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: `${rows.length} Kontakte übernehmen` }).click();
  await expect(page.getByText(`${total} Kontakte`, { exact: true })).toBeVisible();
}

test('Suchen, alle Treffer auswählen, löschen: der Rest bleibt', async ({ browser }) => {
  const { context, page } = await openApp(browser);
  await onboard(page, 'Otto', 'Vermittler');
  const rows = [
    ...Array.from({ length: 12 }, (_, index) => `Probe;Eintrag ${index + 1};Nirgendwo`),
    'Clara;Sommer;Konstanz',
    'Dirk;Winter;Hamburg',
  ];
  await importCsv(page, rows);

  // Ohne Auswahlmodus führt eine Zeile zum Kontakt
  await expect(page.getByRole('link', { name: /Clara Sommer/ })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);

  await page.getByLabel('Kontakte durchsuchen').fill('Probe');
  await expect(page.getByText('12 von 14 Kontakten')).toBeVisible();

  await page.getByRole('button', { name: 'Auswählen' }).click();
  await expect(page.getByTestId('bulk-count')).toHaveText('Nichts ausgewählt');
  await expect(page.getByRole('button', { name: 'Löschen', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Alle 12 Treffer auswählen' }).click();
  await expect(page.getByTestId('bulk-count')).toHaveText('12 ausgewählt');

  // Einen wieder abwählen, die Auswahl übersteht eine andere Suche
  await page.getByRole('checkbox', { name: /Probe Eintrag 7/ }).uncheck();
  await expect(page.getByTestId('bulk-count')).toHaveText('11 ausgewählt');
  await page.getByLabel('Kontakte durchsuchen').fill('');
  await expect(page.getByTestId('bulk-count')).toHaveText('11 ausgewählt');
  await expect(page.getByRole('checkbox', { name: /Clara Sommer/ })).not.toBeChecked();

  // Abbrechen löscht nichts
  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: '11 Kontakte löschen?' })).toBeVisible();
  await expect(dialog.getByTestId('bulk-linked')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(page.getByText('14 Kontakte', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await dialog.getByRole('button', { name: '11 Kontakte löschen' }).click();
  await expect(page.getByText('11 Kontakte gelöscht.')).toBeVisible();

  // Zurück in der normalen Liste: drei übrig
  await expect(page.getByText('3 Kontakte', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Probe Eintrag 7/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Clara Sommer/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Dirk Winter/ })).toBeVisible();

  // Auch nach dem Neuladen
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByText('3 Kontakte', { exact: true })).toBeVisible();

  await context.close();
});

test('Tag an mehrere vergeben und wieder entfernen', async ({ browser }) => {
  const { context, page } = await openApp(browser);
  await onboard(page, 'Otto', 'Vermittler');
  await page.goto('/#/mehr/tags');
  await page.getByLabel('Neuer Tag').fill('Verein');
  await page.getByRole('button', { name: 'Tag anlegen' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Verein' })).toBeVisible();

  await importCsv(page, ['Clara;Sommer;Konstanz', 'Dirk;Winter;Hamburg', 'Emil;Herbst;Hamburg']);

  await page.getByLabel('Kontakte durchsuchen').fill('Hamburg');
  await page.getByRole('button', { name: 'Auswählen' }).click();
  await page.getByRole('button', { name: 'Alle 2 Treffer auswählen' }).click();
  await page.getByLabel('Tag vergeben').selectOption({ label: 'Verein' });
  await expect(page.getByText('Tag „Verein“ an 2 Kontakte vergeben.')).toBeVisible();
  await page.getByRole('button', { name: 'Fertig' }).click();

  await page.getByLabel('Kontakte durchsuchen').fill('');
  await page.getByRole('button', { name: 'Verein' }).click();
  await expect(page.getByText('2 von 3 Kontakten')).toBeVisible();
  await expect(page.getByRole('link', { name: /Clara Sommer/ })).toBeHidden();

  // Bei einem wieder entfernen
  await page.getByRole('button', { name: 'Auswählen' }).click();
  await page.getByRole('checkbox', { name: /Dirk Winter/ }).check();
  await page.getByLabel('Tag entfernen').selectOption({ label: 'Verein' });
  await expect(page.getByText('Tag „Verein“ bei 1 Kontakt entfernt.')).toBeVisible();
  await expect(page.getByText('1 von 3 Kontakten')).toBeVisible();

  await context.close();
});

test('Verbundene Kontakte in der Auswahl: Der Dialog sagt, was das bedeutet', async ({ browser }) => {
  const otto = await openApp(browser);
  const anna = await openApp(browser);
  await onboard(otto.page, 'Otto', 'Vermittler');
  await onboard(anna.page, 'Anna', 'Muster');
  await connect(otto.page, anna.page, 'Nur Name und Telefon', 'Nur Name und Telefon');
  await importCsv(otto.page, ['Clara;Sommer;Konstanz', 'Dirk;Winter;Hamburg'], 3);

  await otto.page.goto('/#/');
  await expect(otto.page.getByText('3 Kontakte', { exact: true })).toBeVisible();
  await otto.page.getByRole('button', { name: 'Auswählen' }).click();
  await otto.page.getByRole('button', { name: 'Alle 3 auswählen' }).click();
  await otto.page.getByRole('button', { name: 'Löschen', exact: true }).click();
  const dialog = otto.page.getByRole('dialog');
  await expect(dialog.getByTestId('bulk-linked')).toContainText('Einer davon ist ein verbundener Kontakt.');
  await dialog.getByRole('button', { name: '3 Kontakte löschen' }).click();
  await expect(otto.page.getByText('3 Kontakte gelöscht.')).toBeVisible();
  await expect(otto.page.getByText('Hier erscheinen die Menschen')).toBeVisible();

  await otto.context.close();
  await anna.context.close();
});
