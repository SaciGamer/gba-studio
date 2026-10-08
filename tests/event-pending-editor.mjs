import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import express from 'express';
import { chromium } from 'playwright';

const frontend = path.resolve('src/renderer/frontend/src');
const bundle = await build({
  stdin: { resolveDir: frontend, loader: 'tsx', contents: `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { App, ConfigProvider, Collapse, Button } from 'antd';
    import { I18nProvider } from './i18n/I18n';
    import MenuEventItem from './components/events/MenuEventItem';
    function Fixture() {
      const [actorId, setActorId] = useState('');
      const [disabled, setDisabled] = useState(false);
      return <ConfigProvider><App><I18nProvider language="pt_BR">
        <Button onClick={() => setActorId(actorId ? '' : 'actor-1')}>Toggle actor</Button>
        <Button onClick={() => setDisabled(!disabled)}>Toggle disabled</Button>
        <Collapse items={[{ key: 'event', label: 'Hide Actor', extra: <MenuEventItem
          event={{ id: 'event', command: 'EVENT_HIDE_ACTOR', args: { actorId, __comment: disabled } }}
          onRemove={() => {}} onDuplicate={() => {}} onRename={() => {}} onToggleDisable={() => {}}
        />, children: <div data-testid="event-body">Actor input</div> }]} />
      </I18nProvider></App></ConfigProvider>;
    }
    createRoot(document.getElementById('root')).render(<Fixture />);
  ` },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  alias: { '@': frontend }, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'context', setup(builder) {
    builder.onResolve({ filter: /AppContexts$/ }, () => ({ path: 'context', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default () => ({ elementSelected: { sceneType: "Top Down" } });', loader: 'js' }));
  } }],
});
const app = express();
app.get('/fixture.js', (_, response) => response.type('js').send(bundle.outputFiles[0].text));
app.get('/', (_, response) => response.type('html').send('<div id="root"></div><script src="/fixture.js"></script>'));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const label = 'Este evento tem campos obrigatórios que ainda não foram preenchidos.';
  const warning = page.getByRole('img', { name: label, exact: true });
  await warning.waitFor({ state: 'visible' });
  await warning.hover();
  await page.getByRole('tooltip').filter({ hasText: label }).waitFor({ state: 'visible' });
  await warning.click();
  assert.equal(await page.getByTestId('event-body').count(), 0, 'Warning must not expand the event');
  await page.getByRole('button', { name: 'Toggle actor', exact: true }).click();
  await warning.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Toggle actor', exact: true }).click();
  await warning.waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Toggle disabled', exact: true }).click();
  await warning.waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  console.log('Event warning UI: collapsed header, localized tooltip, input updates and disabled events passed.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
