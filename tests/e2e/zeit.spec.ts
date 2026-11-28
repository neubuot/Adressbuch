/**
 * Freigabe auf Zeit: Die Frist kommt beim Kontakt an, und nach Ablauf
 * verschwinden die Angaben auf beiden Seiten von selbst.
 */

import { test, expect } from '@playwright/test';
import { openApp, onboard, fillCard, connect, sectionByTitle } from './helpers';

test('Befristete Freigabe: Frist kommt an, nach Ablauf bleibt nur der Name', async ({ browser }) => {
  const anna = await openApp(browser);
  const bert = await openApp(browser);
  // Die Uhr beider Seiten lässt sich später vorstellen
  await anna.page.clock.install();
  await bert.page.clock.install();
  await anna.page.reload();
  await bert.page.reload();

  await onboard(anna.page, 'Anna', 'Muster');
  await onboard(bert.page, 'Bert', 'Beispiel');
  await fillCard(anna.page, { phoneMobile: '+49 151 1111111', street: 'Seeweg', city: 'Konstanz' });
  await connect(anna.page, bert.page, 'Privat', 'Nur Name und Telefon');

  await bert.page.getByRole('link', { name: 'Kontakt ansehen' }).click();
  const annaBeiBert = sectionByTitle(bert.page, 'Angaben');
  await expect(annaBeiBert).toContainText('Seeweg');

  // Anna befristet die Freigabe auf eine Woche
  await anna.page.getByRole('link', { name: 'Kontakt ansehen' }).click();
  await anna.page.getByRole('link', { name: 'Freigabe ändern' }).click();
  await anna.page.getByLabel('Dauer der Freigabe').selectOption('7');
  await expect(anna.page.getByText('Was Bert Beispiel in dieser Zeit abschreibt')).toBeVisible();
  await anna.page.getByRole('button', { name: 'Freigabe speichern' }).click();

  await expect(anna.page.getByTestId('share-limit')).toContainText('Befristet bis zum');
  await expect(anna.page.getByTestId('share-limit')).toContainText('nur noch dein Name');

  // Bert sieht die Frist
  await expect(bert.page.getByTestId('remote-limit')).toContainText('Anna Muster gibt dir diese Angaben bis zum', { timeout: 15000 });
  await expect(annaBeiBert).toContainText('Seeweg');

  // Acht Tage später, Bert zuerst: Seine App entfernt die Angaben von selbst
  await bert.page.clock.fastForward(8 * 24 * 60 * 60 * 1000);
  await expect(annaBeiBert).not.toContainText('Seeweg', { timeout: 15000 });
  await expect(annaBeiBert).not.toContainText('+49 151 1111111');
  await expect(bert.page.getByRole('heading', { name: 'Anna Muster', level: 2 })).toBeVisible();
  await expect(bert.page.getByTestId('remote-limit')).toHaveCount(0);

  // Bei Anna steht die Freigabe danach auf dem Namen, ohne Frist
  await anna.page.clock.fastForward(8 * 24 * 60 * 60 * 1000);
  const vorschau = sectionByTitle(anna.page, 'Was Bert Beispiel von mir sieht');
  await expect(vorschau).not.toContainText('Seeweg', { timeout: 15000 });
  await expect(vorschau).toContainText('Anna');
  await expect(anna.page.getByTestId('share-limit')).toHaveCount(0);

  await anna.context.close();
  await bert.context.close();
});

test('Befristung bis zu einem Datum: ein vergangenes Datum wird abgelehnt', async ({ browser }) => {
  const anna = await openApp(browser);
  const bert = await openApp(browser);
  await onboard(anna.page, 'Anna', 'Muster');
  await onboard(bert.page, 'Bert', 'Beispiel');
  await connect(anna.page, bert.page, 'Nur Name und Telefon', 'Nur Name und Telefon');

  await anna.page.getByRole('link', { name: 'Kontakt ansehen' }).click();
  await anna.page.getByRole('link', { name: 'Freigabe ändern' }).click();
  await anna.page.getByLabel('Dauer der Freigabe').selectOption('date');
  await anna.page.getByLabel('Freigegeben bis einschließlich').fill('2020-01-01');
  await anna.page.getByRole('button', { name: 'Freigabe speichern' }).click();
  await expect(anna.page.getByRole('alert')).toContainText('Datum, das in der Zukunft liegt');

  await anna.page.getByLabel('Freigegeben bis einschließlich').fill('2099-12-31');
  await anna.page.getByLabel('Nichts mehr').check();
  await anna.page.getByRole('button', { name: 'Freigabe speichern' }).click();
  await expect(anna.page.getByTestId('share-limit')).toContainText('31.12.2099');
  await expect(anna.page.getByTestId('share-limit')).toContainText('nichts mehr');

  await expect(async () => {
    await bert.page.goto('/#/');
    await bert.page.getByRole('link', { name: /Anna Muster/ }).click();
    await expect(bert.page.getByTestId('remote-limit')).toContainText('31.12.2099', { timeout: 3000 });
  }).toPass({ timeout: 20000 });
  await expect(bert.page.getByTestId('remote-limit')).toContainText('verschwinden sie hier von selbst');

  await anna.context.close();
  await bert.context.close();
});
