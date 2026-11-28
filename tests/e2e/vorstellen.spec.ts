/**
 * Vorstellen: Otto kennt Anna und Bert und macht die beiden miteinander
 * bekannt. Sie werden verbunden, sobald beide zugestimmt haben, ohne Code.
 */

import { test, expect } from '@playwright/test';
import { openApp, onboard, fillCard, connect, sectionByTitle, CONNECT_TIMEOUT } from './helpers';

test('Zwei Kontakte einander vorstellen: nach beider Zustimmung sind sie verbunden', async ({ browser }) => {
  const otto = await openApp(browser);
  const anna = await openApp(browser);
  const bert = await openApp(browser);
  await onboard(otto.page, 'Otto', 'Vermittler');
  await onboard(anna.page, 'Anna', 'Muster');
  await onboard(bert.page, 'Bert', 'Beispiel');
  await fillCard(anna.page, { phoneMobile: '+49 151 1111111', city: 'Berlin' });
  await fillCard(bert.page, { phoneMobile: '+49 170 2222222' });

  await connect(otto.page, anna.page, 'Nur Name und Telefon', 'Nur Name und Telefon');
  await otto.page.goto('/#/');
  await connect(otto.page, bert.page, 'Nur Name und Telefon', 'Nur Name und Telefon');

  // Otto stellt Anna und Bert einander vor
  await otto.page.goto('/#/');
  await otto.page.getByRole('link', { name: /Anna Muster/ }).click();
  await otto.page.getByRole('link', { name: 'Jemandem vorstellen' }).click();
  await expect(otto.page.getByText('Beide erfahren nur den Namen des anderen')).toBeVisible();
  await otto.page.getByRole('button', { name: 'Anna Muster und Bert Beispiel einander vorstellen' }).click();

  // Beide sehen die Vorstellung unter Aktuelles, mit Zähler in der Navigation
  await expect(anna.page.getByRole('navigation').getByRole('link', { name: /Aktuelles/ })).toContainText('1', { timeout: 15000 });
  await anna.page.goto('/#/aktuelles');
  await expect(anna.page.getByTestId('intro')).toContainText('Otto Vermittler möchte dich mit Bert Beispiel bekannt machen');
  await bert.page.goto('/#/aktuelles');
  await expect(bert.page.getByTestId('intro')).toContainText('Otto Vermittler möchte dich mit Anna Muster bekannt machen', { timeout: 15000 });

  // Bei Otto ist die Vorstellung erledigt, sobald beide sie erhalten haben
  await expect(otto.page.getByRole('button', { name: 'Anna Muster und Bert Beispiel einander vorstellen' })).toBeVisible({ timeout: 15000 });

  // Anna nimmt an: Solange Bert nicht zugestimmt hat, entsteht keine Verbindung
  await anna.page.getByRole('link', { name: 'Annehmen' }).click();
  await expect(anna.page.getByRole('heading', { name: 'Mit Bert Beispiel verbinden?' })).toBeVisible();
  await anna.page.getByLabel('Privat', { exact: true }).check();
  await anna.page.getByRole('button', { name: 'Annehmen' }).click();
  await expect(anna.page.getByTestId('intro')).toContainText('Du wartest auf Bert Beispiel');
  await anna.page.goto('/#/');
  await expect(anna.page.getByText('1 Kontakt', { exact: true })).toBeVisible();

  // Bert nimmt an: Jetzt werden beide verbunden
  await bert.page.getByRole('link', { name: 'Annehmen' }).click();
  await bert.page.getByRole('button', { name: 'Annehmen' }).click();
  await expect(bert.page.getByRole('heading', { name: 'Aktuelles', level: 2 })).toBeVisible();

  await bert.page.goto('/#/');
  const annaBeiBert = bert.page.getByRole('link', { name: /Anna Muster/ });
  await expect(annaBeiBert).toContainText('Aktuell', { timeout: CONNECT_TIMEOUT });
  await annaBeiBert.click();
  // Anna hat „Privat“ gewählt: Bert sieht auch den Ort
  await expect(sectionByTitle(bert.page, 'Angaben')).toContainText('+49 151 1111111', { timeout: 15000 });
  await expect(sectionByTitle(bert.page, 'Angaben')).toContainText('Berlin');

  const bertBeiAnna = anna.page.getByRole('link', { name: /Bert Beispiel/ });
  await expect(bertBeiAnna).toContainText('Aktuell', { timeout: CONNECT_TIMEOUT });
  await bertBeiAnna.click();
  await expect(sectionByTitle(anna.page, 'Angaben')).toContainText('+49 170 2222222', { timeout: 15000 });
  // Woher der Kontakt stammt, steht in den eigenen Notizen
  await anna.page.getByText('Woher kenne ich Bert Beispiel?').click();
  await expect(anna.page.getByLabel('Kennengelernt über')).toHaveValue('Vorgestellt von Otto Vermittler');

  // Unter Aktuelles ist die Vorstellung verschwunden
  await anna.page.goto('/#/aktuelles');
  await expect(anna.page.getByTestId('intro')).toHaveCount(0);

  await otto.context.close();
  await anna.context.close();
  await bert.context.close();
});

test('Abgelehnte Vorstellung: keine Verbindung, die andere Seite kann ihre Zusage zurückziehen', async ({ browser }) => {
  const otto = await openApp(browser);
  const anna = await openApp(browser);
  const bert = await openApp(browser);
  await onboard(otto.page, 'Otto', 'Vermittler');
  await onboard(anna.page, 'Anna', 'Muster');
  await onboard(bert.page, 'Bert', 'Beispiel');
  await connect(otto.page, anna.page, 'Nur Name und Telefon', 'Nur Name und Telefon');
  await otto.page.goto('/#/');
  await connect(otto.page, bert.page, 'Nur Name und Telefon', 'Nur Name und Telefon');

  await otto.page.goto('/#/');
  await otto.page.getByRole('link', { name: /Bert Beispiel/ }).click();
  await otto.page.getByRole('link', { name: 'Jemandem vorstellen' }).click();
  await otto.page.getByRole('button', { name: 'Bert Beispiel und Anna Muster einander vorstellen' }).click();

  await anna.page.goto('/#/aktuelles');
  await expect(anna.page.getByTestId('intro')).toBeVisible({ timeout: 15000 });
  await anna.page.getByRole('link', { name: 'Annehmen' }).click();
  await anna.page.getByRole('button', { name: 'Annehmen' }).click();
  await expect(anna.page.getByTestId('intro')).toContainText('Du wartest auf Bert Beispiel');

  await bert.page.goto('/#/aktuelles');
  await expect(bert.page.getByTestId('intro')).toBeVisible({ timeout: 15000 });
  await bert.page.getByRole('button', { name: 'Ablehnen' }).click();
  await expect(bert.page.getByTestId('intro')).toHaveCount(0);

  // Auch nach einer Weile und einem Neustart entsteht keine Verbindung
  await bert.page.reload();
  await anna.page.reload();
  await anna.page.waitForTimeout(4000);
  await bert.page.goto('/#/');
  await expect(bert.page.getByText('1 Kontakt', { exact: true })).toBeVisible();
  await anna.page.goto('/#/');
  await expect(anna.page.getByText('1 Kontakt', { exact: true })).toBeVisible();

  await anna.page.goto('/#/aktuelles');
  await expect(anna.page.getByTestId('intro')).toContainText('Du wartest auf Bert Beispiel');
  await anna.page.getByRole('button', { name: 'Zurückziehen' }).click();
  await expect(anna.page.getByTestId('intro')).toHaveCount(0);

  await otto.context.close();
  await anna.context.close();
  await bert.context.close();
});
