/**
 * Postfach: Eine Änderung kommt an, obwohl die beiden nie gleichzeitig
 * online sind.
 */

import { test, expect, type Page } from '@playwright/test';
import { openApp, onboard, fillCard, connect, sectionByTitle } from './helpers';

/** Wartet, bis die App einen Stand im Postfach abgelegt hat */
function nextDeposit(page: Page) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/box' &&
      response.ok() &&
      (response.request().postData() ?? '').includes('"put"'),
    { timeout: 20000 }
  );
}

test('Änderung kommt über das Postfach an, ohne dass beide gleichzeitig online sind', async ({ browser }) => {
  const otto = await openApp(browser);
  const anna = await openApp(browser);
  await onboard(otto.page, 'Otto', 'Vermittler');
  await onboard(anna.page, 'Anna', 'Muster');
  await fillCard(otto.page, { phoneMobile: '+49 160 1111111' });
  await connect(otto.page, anna.page, 'Nur Name und Telefon', 'Nur Name und Telefon');

  await anna.page.goto('/#/');
  await anna.page.getByRole('link', { name: /Otto Vermittler/ }).click();
  await expect(sectionByTitle(anna.page, 'Angaben')).toContainText('+49 160 1111111');

  // Anna schließt die App
  await anna.page.close();
  await expect(otto.page.getByRole('link', { name: /Anna Muster/ })).toBeHidden();
  await otto.page.goto('/#/');
  await expect(otto.page.getByRole('link', { name: /Anna Muster/ })).toContainText('Wartet auf Verbindung', { timeout: 30000 });

  // Otto ändert seine Nummer, während Anna nicht da ist, und geht dann selbst
  const deposited = nextDeposit(otto.page);
  await fillCard(otto.page, { phoneMobile: '+49 160 2222222' });
  await deposited;
  await otto.context.close();

  // Anna öffnet die App wieder: Otto ist nicht da, die neue Nummer trotzdem
  const again = await anna.context.newPage();
  await again.goto('/#/');
  const row = again.getByRole('link', { name: /Otto Vermittler/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(sectionByTitle(again, 'Angaben')).toContainText('+49 160 2222222', { timeout: 20000 });
  await expect(sectionByTitle(again, 'Angaben')).not.toContainText('+49 160 1111111');

  // Die Änderung steht auch in der Änderungsübersicht
  await again.goto('/#/aktuelles');
  await expect(again.getByText('+49 160 2222222').first()).toBeVisible();

  await anna.context.close();
});

test('Postfach ausgeschaltet: nichts wird abgelegt, nichts abgeholt', async ({ browser }) => {
  const otto = await openApp(browser);
  const anna = await openApp(browser);
  await onboard(otto.page, 'Otto', 'Vermittler');
  await onboard(anna.page, 'Anna', 'Muster');
  await fillCard(otto.page, { phoneMobile: '+49 160 1111111' });
  await connect(otto.page, anna.page, 'Nur Name und Telefon', 'Nur Name und Telefon');

  // Anna schaltet das Postfach aus und schließt die App
  await anna.page.goto('/#/mehr');
  await expect(anna.page.getByLabel(/Postfach nutzen/)).toBeChecked();
  await anna.page.getByLabel(/Postfach nutzen/).uncheck();
  await anna.page.close();

  const deposited = nextDeposit(otto.page);
  await fillCard(otto.page, { phoneMobile: '+49 160 2222222' });
  await deposited;
  await otto.context.close();

  const again = await anna.context.newPage();
  const boxRequests: string[] = [];
  again.on('request', (request) => {
    if (new URL(request.url()).pathname === '/box') boxRequests.push(request.url());
  });
  await again.goto('/#/');
  await again.getByRole('link', { name: /Otto Vermittler/ }).click();
  await expect(sectionByTitle(again, 'Angaben')).toContainText('+49 160 1111111');
  await again.waitForTimeout(4000);
  await expect(sectionByTitle(again, 'Angaben')).toContainText('+49 160 1111111');
  expect(boxRequests).toHaveLength(0);

  // Wieder eingeschaltet: Der wartende Stand kommt an
  await again.goto('/#/mehr');
  await again.getByLabel(/Postfach nutzen/).check();
  await again.goto('/#/');
  await again.getByRole('link', { name: /Otto Vermittler/ }).click();
  await expect(sectionByTitle(again, 'Angaben')).toContainText('+49 160 2222222', { timeout: 20000 });

  await anna.context.close();
});

test('Der Dienst nimmt nur gültige Fächer an und verrät nichts über fremde', async ({ request }) => {
  const slot = 'a'.repeat(32);
  const ok = await request.post('/box', { data: { put: { [slot]: 'QUJD', 'zu-kurz': 'QUJD', ['b'.repeat(32)]: 'kein base64!' } } });
  expect(ok.ok()).toBeTruthy();
  const put = (await ok.json()).put as Record<string, string>;
  expect(Object.keys(put)).toEqual([slot]);

  const got = await (await request.post('/box', { data: { get: { [slot]: '', ['c'.repeat(32)]: '' } } })).json();
  expect(Object.keys(got.got)).toEqual([slot]);
  expect(got.got[slot].data).toBe('QUJD');
  // Mit bekanntem Stand kommt nichts zurück
  const same = await (await request.post('/box', { data: { get: { [slot]: put[slot] } } })).json();
  expect(same.got).toEqual({});

  expect((await request.get('/box')).status()).toBe(405);
  expect((await request.post('/box', { data: 'kein json', headers: { 'Content-Type': 'text/plain' } })).status()).toBe(400);
  const tooMany = Object.fromEntries(Array.from({ length: 201 }, (_, index) => [index.toString(16).padStart(32, '0'), '']));
  expect((await request.post('/box', { data: { get: tooMany } })).status()).toBe(400);
  const tooBig = await (await request.post('/box', { data: { put: { ['d'.repeat(32)]: 'A'.repeat(40000) } } })).json();
  expect(tooBig.put).toEqual({});
});
