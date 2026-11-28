/**
 * Wiederherstellung über Vertraute: Otto legt Anna und Bert als Vertraute
 * fest, verliert sein Gerät und holt sein Adressbuch auf einem neuen Gerät
 * mit ihrer Hilfe zurück.
 */

import { test, expect, type Page } from '@playwright/test';
import { openApp, onboard, fillCard, connect, sectionByTitle, CONNECT_TIMEOUT } from './helpers';

async function setUpTrust(otto: Page): Promise<void> {
  await otto.goto('/#/mehr');
  await otto.getByRole('link', { name: /Wiederherstellung über Vertraute/ }).click();
  await expect(otto.getByText('könnten dein Adressbuch auch ohne dich lesen')).toBeVisible();
  await otto.getByLabel('Anna Muster').check();
  await otto.getByLabel('Bert Beispiel').check();
  await expect(otto.getByLabel('Wie viele müssen helfen?')).toHaveValue('2');
  await otto.getByRole('button', { name: 'Einrichten' }).click();
  await expect(otto.getByTestId('trust-summary')).toHaveText('2 Vertraute, 2 davon müssen helfen');
  // Beide sind verbunden: Der Tresor wird sofort hinterlegt
  await expect(otto.getByTestId('trust-member').filter({ hasText: 'Anna Muster' })).toContainText('Hinterlegt am', { timeout: 20000 });
  await expect(otto.getByTestId('trust-member').filter({ hasText: 'Bert Beispiel' })).toContainText('Hinterlegt am', { timeout: 20000 });
}

async function help(helper: Page, code: string): Promise<void> {
  await helper.goto('/#/');
  await helper.getByRole('link', { name: /Otto Vermittler/ }).click();
  await expect(helper.getByTestId('custody-note')).toContainText('Du bist eine Vertrauensperson');
  await helper.getByRole('link', { name: 'Bei der Wiederherstellung helfen' }).click();
  await expect(helper.getByText('Erst prüfen, dann helfen')).toBeVisible();
  await helper.getByLabel('Code vom neuen Gerät').fill(code);
  await helper.getByRole('button', { name: 'Meinen Teil übergeben' }).click();
  await expect(helper.getByRole('heading', { name: 'Übergeben' })).toBeVisible({ timeout: CONNECT_TIMEOUT });
}

test('Gerät verloren: zwei Vertraute geben das Adressbuch zurück, Kontakte verbinden sich wieder', async ({ browser }) => {
  const otto = await openApp(browser);
  const anna = await openApp(browser);
  const bert = await openApp(browser);
  await onboard(otto.page, 'Otto', 'Vermittler');
  await onboard(anna.page, 'Anna', 'Muster');
  await onboard(bert.page, 'Bert', 'Beispiel');
  await fillCard(otto.page, { phoneMobile: '+49 160 3333333' });
  await fillCard(anna.page, { phoneMobile: '+49 151 1111111' });

  await connect(otto.page, anna.page, 'Nur Name und Telefon', 'Nur Name und Telefon');
  await otto.page.goto('/#/');
  await connect(otto.page, bert.page, 'Nur Name und Telefon', 'Nur Name und Telefon');

  // Eine private Notiz, die nur Otto hat: Sie muss die Wiederherstellung überstehen
  await otto.page.goto('/#/');
  await otto.page.getByRole('link', { name: /Anna Muster/ }).click();
  await otto.page.getByLabel('Notizen').fill('Segeln am Bodensee');
  await otto.page.getByLabel('Notizen').blur();
  await expect(otto.page.getByText('Notiz gespeichert')).toBeVisible();

  await setUpTrust(otto.page);

  // Bei den Vertrauten steht, dass sie etwas aufbewahren
  await anna.page.goto('/#/');
  await anna.page.getByRole('link', { name: /Otto Vermittler/ }).click();
  await expect(anna.page.getByTestId('custody-note')).toBeVisible({ timeout: 15000 });

  // --- Otto verliert sein Gerät ---
  await otto.context.close();

  // Neues Gerät, leer
  const neu = await openApp(browser);
  await neu.page.getByRole('link', { name: /Ich habe Vertraute festgelegt/ }).click();
  await expect(neu.page.getByRole('heading', { name: 'Über Vertraute wiederherstellen' })).toBeVisible();
  await expect(neu.page.getByTestId('recovery-code')).toHaveText(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/, { timeout: 15000 });
  const code = ((await neu.page.getByTestId('recovery-code').textContent()) ?? '').replace(/[^A-Z0-9]/g, '');
  await expect(neu.page.getByTestId('recovery-progress')).toHaveText('Noch kein Teil erhalten.');
  await expect(neu.page.getByRole('button', { name: 'Adressbuch wiederherstellen' })).toBeDisabled();

  // Anna hilft: ein Teil genügt noch nicht
  await help(anna.page, code);
  await expect(neu.page.getByTestId('recovery-progress')).toHaveText('1 von 2 Teilen erhalten', { timeout: 15000 });
  await expect(neu.page.getByRole('listitem').filter({ hasText: 'Anna Muster' })).toBeVisible();
  await expect(neu.page.getByRole('button', { name: 'Adressbuch wiederherstellen' })).toBeDisabled();

  // Das neue Gerät wird zwischendurch neu geladen: Code und Teil bleiben
  await neu.page.reload();
  await expect(neu.page.getByTestId('recovery-code')).toHaveText(`${code.slice(0, 4)}-${code.slice(4)}`, { timeout: 15000 });
  await expect(neu.page.getByTestId('recovery-progress')).toHaveText('1 von 2 Teilen erhalten');

  // Bert hilft: jetzt reicht es
  await help(bert.page, code);
  await expect(neu.page.getByTestId('recovery-progress')).toHaveText('2 von 2 Teilen erhalten', { timeout: 15000 });
  await neu.page.getByRole('button', { name: 'Adressbuch wiederherstellen' }).click();

  // Das Adressbuch ist zurück: Name, Kontakte, private Notiz
  await expect(neu.page.locator('h1')).toHaveText('P2P Adressbuch von Otto Vermittler', { timeout: 20000 });
  await expect(neu.page.getByText('2 Kontakte', { exact: true })).toBeVisible();
  const annaZeile = neu.page.getByRole('link', { name: /Anna Muster/ });
  // Mit dem wiederhergestellten Schlüssel verbinden sich die Kontakte von selbst
  await expect(annaZeile).toContainText('Aktuell', { timeout: CONNECT_TIMEOUT });
  await annaZeile.click();
  await expect(neu.page.getByLabel('Notizen')).toHaveValue('Segeln am Bodensee');
  await expect(sectionByTitle(neu.page, 'Angaben')).toContainText('+49 151 1111111');

  // Die Einrichtung gilt weiter
  await neu.page.goto('/#/mehr');
  await expect(neu.page.getByRole('link', { name: /Wiederherstellung über Vertraute/ })).toContainText('2 Vertraute, 2 müssen helfen');

  await neu.context.close();
  await anna.context.close();
  await bert.context.close();
});

test('Vertraute ändern und aufheben: Ausgeschiedene löschen, was sie aufbewahren', async ({ browser }) => {
  const otto = await openApp(browser);
  const anna = await openApp(browser);
  const bert = await openApp(browser);
  await onboard(otto.page, 'Otto', 'Vermittler');
  await onboard(anna.page, 'Anna', 'Muster');
  await onboard(bert.page, 'Bert', 'Beispiel');
  await connect(otto.page, anna.page, 'Nur Name und Telefon', 'Nur Name und Telefon');
  await otto.page.goto('/#/');
  await connect(otto.page, bert.page, 'Nur Name und Telefon', 'Nur Name und Telefon');

  await setUpTrust(otto.page);
  await bert.page.goto('/#/');
  await bert.page.getByRole('link', { name: /Otto Vermittler/ }).click();
  await expect(bert.page.getByTestId('custody-note')).toBeVisible({ timeout: 15000 });

  // Ohne aufbewahrten Teil gibt es nichts zu übergeben
  await otto.page.getByRole('button', { name: 'Aufheben' }).click();
  await otto.page.getByRole('dialog').getByRole('button', { name: 'Aufheben' }).click();
  await expect(otto.page.getByTestId('trust-summary')).toHaveCount(0);

  await expect(bert.page.getByTestId('custody-note')).toHaveCount(0, { timeout: 15000 });
  await anna.page.goto('/#/');
  await anna.page.getByRole('link', { name: /Otto Vermittler/ }).click();
  await expect(anna.page.getByTestId('custody-note')).toHaveCount(0, { timeout: 15000 });

  await otto.page.goto('/#/mehr');
  await expect(otto.page.getByRole('link', { name: /Wiederherstellung über Vertraute/ })).toContainText('Nicht eingerichtet');

  await otto.context.close();
  await anna.context.close();
  await bert.context.close();
});
