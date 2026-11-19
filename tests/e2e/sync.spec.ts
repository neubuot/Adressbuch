/**
 * Zwei Browser-Instanzen: verbinden, Freigabe ändern, Karte ändern, widerrufen
 */

import { test, expect } from '@playwright/test';
import { openApp, onboard, fillCard, connect, sectionByTitle, CONNECT_TIMEOUT } from './helpers';

test('Freigabe und Kartenänderungen kommen beim Kontakt an', async ({ browser }) => {
  const anna = await openApp(browser);
  const bert = await openApp(browser);

  await onboard(anna.page, 'Anna', 'Muster');
  await onboard(bert.page, 'Bert', 'Beispiel');
  await fillCard(anna.page, {
    phoneMobile: '+49 151 1111111',
    emailPrivate: 'anna@example.org',
    city: 'Berlin',
  });
  await fillCard(bert.page, { phoneMobile: '+49 170 2222222' });

  // --- Verbinden: Anna gibt Name und Telefon frei, Bert ebenso ---
  await connect(anna.page, bert.page, 'Nur Name und Telefon', 'Nur Name und Telefon');

  await bert.page.getByRole('link', { name: 'Kontakt ansehen' }).click();
  await expect(bert.page.getByRole('heading', { name: 'Anna Muster', level: 2 })).toBeVisible();
  const annaBeiBert = sectionByTitle(bert.page, 'Angaben');
  await expect(annaBeiBert).toContainText('+49 151 1111111');
  await expect(annaBeiBert).not.toContainText('anna@example.org');
  await expect(bert.page.getByText('Aktuell', { exact: true })).toBeVisible();

  // --- "Was sieht dieser Kontakt von mir?" ---
  await anna.page.getByRole('link', { name: 'Kontakt ansehen' }).click();
  const vorschau = sectionByTitle(anna.page, 'Was Bert Beispiel von mir sieht');
  await expect(vorschau).toContainText('Nur Name und Telefon');
  await expect(vorschau).toContainText('+49 151 1111111');
  await expect(vorschau).not.toContainText('anna@example.org');

  // --- Freigabe nachträglich erweitern: muss bei Bert ankommen ---
  await anna.page.getByRole('link', { name: 'Freigabe ändern' }).click();
  await anna.page.getByLabel('Privat', { exact: true }).check();
  await expect(sectionByTitle(anna.page, /So sieht Bert Beispiel deine Karte/)).toContainText('anna@example.org');
  await anna.page.getByRole('button', { name: 'Freigabe speichern' }).click();

  await expect(annaBeiBert).toContainText('anna@example.org', { timeout: 15000 });
  await expect(annaBeiBert).toContainText('Berlin');

  // --- Kartenfeld ändern: muss bei Bert ankommen, mit altem und neuem Wert ---
  await fillCard(anna.page, { phoneMobile: '+49 151 9999999' });
  await expect(annaBeiBert).toContainText('+49 151 9999999', { timeout: 15000 });
  await expect(annaBeiBert).not.toContainText('+49 151 1111111');

  await bert.page.goto('/#/aktuelles');
  const aenderung = bert.page.getByRole('listitem').filter({ hasText: 'Anna Muster hat die Mobilnummer geändert' });
  await expect(aenderung).toContainText('+49 151 1111111');
  await expect(aenderung).toContainText('+49 151 9999999');
  await expect(bert.page.getByText('Anna Muster hat die private E-Mail-Adresse ergänzt')).toBeVisible();

  // --- Freigabe einschränken: Felder verschwinden bei Bert ---
  await anna.page.goto('/#/');
  await anna.page.getByRole('link', { name: /Bert Beispiel/ }).click();
  await anna.page.getByRole('link', { name: 'Freigabe ändern' }).click();
  await anna.page.getByLabel('Nur Name und Telefon', { exact: true }).check();
  await anna.page.getByRole('button', { name: 'Freigabe speichern' }).click();

  await bert.page.goto('/#/');
  await bert.page.getByRole('link', { name: /Anna Muster/ }).click();
  await expect(annaBeiBert).not.toContainText('anna@example.org', { timeout: 15000 });
  await expect(annaBeiBert).toContainText('+49 151 9999999');

  // --- Widerrufen: ehrlicher Hinweis, danach sieht Bert nichts mehr ---
  await anna.page.getByRole('button', { name: 'Freigabe widerrufen' }).click();
  const dialog = anna.page.getByRole('dialog');
  await expect(dialog).toContainText('lässt sich nicht zurückholen');
  await dialog.getByRole('button', { name: 'Freigabe widerrufen' }).click();
  await expect(sectionByTitle(anna.page, 'Was Bert Beispiel von mir sieht')).toContainText('Nichts freigegeben');

  await expect(bert.page.getByText('Anna Muster gibt dir im Moment keine Angaben frei.')).toBeVisible({ timeout: 15000 });
  // Der Name bleibt bei Bert bekannt
  await expect(bert.page.getByRole('heading', { name: 'Anna Muster', level: 2 })).toBeVisible();

  await anna.context.close();
  await bert.context.close();
});

test('Nach dem Neuladen verbinden sich Kontakte von selbst wieder; Änderungen von unterwegs werden nachgeholt', async ({ browser }) => {
  const anna = await openApp(browser);
  const bert = await openApp(browser);
  await onboard(anna.page, 'Anna', 'Muster');
  await onboard(bert.page, 'Bert', 'Beispiel');
  await fillCard(anna.page, { phoneMobile: '0151 1' });
  await connect(anna.page, bert.page, 'Nur Name und Telefon', 'Nur Name und Telefon');

  // Bert schließt die App
  await bert.page.goto('about:blank');
  await anna.page.goto('/#/');
  await expect(anna.page.getByRole('link', { name: /Bert Beispiel/ })).toContainText('Wartet auf Verbindung', { timeout: CONNECT_TIMEOUT });

  // Anna ändert ihre Nummer, während Bert nicht da ist
  await fillCard(anna.page, { phoneMobile: '0151 2' });

  // Bert öffnet die App wieder: Verbindung und Änderung kommen von selbst
  await bert.page.goto('/');
  const zeile = bert.page.getByRole('link', { name: /Anna Muster/ });
  await expect(zeile).toContainText('Aktuell', { timeout: CONNECT_TIMEOUT });
  await zeile.click();
  await expect(sectionByTitle(bert.page, 'Angaben')).toContainText('0151 2', { timeout: 15000 });

  // Erstelldatum steht über dem letzten Abgleich
  const verlauf = sectionByTitle(bert.page, 'Verlauf');
  const labels = await verlauf.locator('dt').allTextContents();
  expect(labels).toEqual(['Angelegt am', 'Zuletzt abgeglichen']);
  await expect(verlauf.locator('dd').first()).toHaveText(/^\d{2}\.\d{2}\.\d{4}$/);

  await anna.context.close();
  await bert.context.close();
});

test('Ein Code ohne offene Einladung führt nicht zu einer Verbindung', async ({ browser }) => {
  const anna = await openApp(browser);
  await onboard(anna.page, 'Anna', 'Muster');
  await anna.page.goto('/#/verbinden');
  await anna.page.getByText('Ich habe einen Code').click();
  await anna.page.getByLabel('Oder Code eintippen').fill('abcd-efgh');
  await anna.page.getByRole('button', { name: 'Verbinden', exact: true }).click();
  await expect(anna.page.getByText('Einen Moment …')).toBeVisible();
  await anna.page.goto('/#/');
  await expect(anna.page.getByText('Hier erscheinen die Menschen')).toBeVisible();
  await anna.context.close();
});
