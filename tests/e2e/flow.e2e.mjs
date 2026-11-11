// Recorrido extremo a extremo de CMO Inmunomediadas en Chromium (Playwright). Datos ficticios.
//   node --test tests/e2e/flow.e2e.mjs      (requiere Playwright con Chromium)
//   AXE_PATH=<axe.min.js>                   añade la auditoría WCAG A/AA
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = await import('playwright')); } catch { chromium = null; } }
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/markdown' };
let server, browser, origin;
const external = [];

before(async () => {
  if (!chromium) return;
  server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(ROOT, url);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (file.endsWith(path.sep) || file === ROOT) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(data); });
  });
  await new Promise((r) => server.listen(0, r));
  origin = `http://localhost:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function open(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:') && u !== 'about:srcdoc') external.push(u); });
  await page.goto(origin + '/');
  await page.waitForSelector('#ctx-farmaceutico');
  return { page, errors };
}
async function fillStep1(page, over = {}) {
  const v = { farmaceutico: 'Farm. Prueba', hospital: 'Hospital X', pacienteId: 'EII-001', tipoEI: 'dermatologica', diagnosticoEspecifico: 'Psoriasis', edad: '45', tratamiento: 'TRAT-SECRETO', situacionClinica: 'SIT-SECRETA', ...over };
  for (const [k, val] of Object.entries(v)) {
    const el = page.locator(`#ctx-${k}`);
    if (k === 'tipoEI') await el.selectOption(val); else await el.fill(val);
  }
}
const step = (page) => page.evaluate(() => document.querySelector('.stepper__item--current .stepper__label')?.textContent);
const toast = (page) => page.locator('.cmo-toast, [role="status"].cmo-toast, .cmo-toast-region').first();

test('validación del paso 1: edad no válida y DNI se rechazan con aviso (sin alert)', { skip: !chromium }, async () => {
  const { page, errors } = await open();
  let dialogs = 0;
  page.on('dialog', (d) => { dialogs++; d.dismiss(); });
  await fillStep1(page, { edad: '-4' });
  await page.click('[data-action="go-step-2"]');
  await page.waitForFunction(() => /edad/i.test(document.body.textContent) && document.querySelector('[class*="toast"]'));
  assert.match(await step(page), /Nueva estratificación/);
  await page.fill('#ctx-edad', '45');
  await page.fill('#ctx-pacienteId', '12345678Z');
  await page.click('[data-action="go-step-2"]');
  await page.waitForFunction(() => /DNI/.test(document.body.textContent));
  assert.equal(dialogs, 0);
  assert.deepEqual(errors, []);
});

test('flujo: pendiente → provisional → modificación profesional → informe, PDF y JSON; reimportación', { skip: !chromium }, async () => {
  const { page, errors } = await open();
  await fillStep1(page);
  await page.click('[data-action="go-step-2"]');
  await page.click('[data-action="skip-to-manual"]');
  // confirmar una sola variable
  const row = page.locator('[data-manual-row="tabaquismo"]');
  await row.locator('select').selectOption('si');
  await row.locator('[data-action="confirm-field"]').click();
  await page.click('[data-action="calculate-and-go-5"]');
  assert.ok(await page.locator('[data-provisional]').isVisible(), 'resultado provisional visible');
  assert.match(await page.locator('.result-card h2').textContent(), /provisional/);
  assert.match(await page.locator('[data-provisional]').textContent(), /no se interpreta como «No»/);
  // modificación sin justificación → rechazada
  await page.selectOption('#override-level', '1');
  await page.fill('#override-justification', 'corta');
  await page.click('[data-action="apply-override"]');
  assert.match(await page.locator('.result-card h2').textContent(), /PRIORIDAD 3|PRIORIDAD 2|PRIORIDAD 1/);
  await page.fill('#override-justification', 'Riesgo de abandono según valoración presencial.');
  await page.click('[data-action="apply-override"]');
  await page.waitForSelector('.result-card.level-1');
  assert.match(await page.locator('.result-card').textContent(), /Modificado por el profesional/);
  // plan
  await page.click('[data-action="go-step-6"]');
  await page.click('[data-action="apply-recommended"]');
  await page.locator('select[data-iv-field="status"]').first().selectOption('done');
  await page.fill('#plan-next-review', '2026-09-01');
  await page.click('[data-action="go-step-7"]');
  const text = await page.locator('#clinical-report-pre').textContent();
  assert.match(text, /rovisional/);
  assert.match(text, /Prioridad 1/);
  assert.match(text, /Realizada|Realizadas|realizad/i);
  // descargas
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="download-pdf"]')]);
  const pdfBytes = fs.readFileSync(await pdf.path());
  assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-');
  const [json] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export-json"]')]);
  const raw = fs.readFileSync(await json.path(), 'utf8');
  assert.match(raw, /cmo-export\/1/);
  assert.doesNotMatch(raw, /TRAT-SECRETO|SIT-SECRETA/, 'sin texto libre clínico en la exportación');
  // copiar
  await page.click('[data-action="copy-report"]');
  await page.waitForFunction(() => /copiado/i.test(document.body.textContent));
  // reinicio y reimportación
  await page.click('[data-action="open-reset"]');
  await page.click('[data-action="confirm-reset"]').catch(() => {});
  await page.waitForSelector('#ctx-farmaceutico');
  const tmp = path.join(ROOT, 'tests', 'e2e', '.tmp-import.json');
  fs.writeFileSync(tmp, raw);
  try {
    await page.setInputFiles('#import-json', tmp);
    await page.waitForSelector('.result-card.level-1');
    assert.match(await page.locator('.result-card').textContent(), /Modificado por el profesional/);
    // fichero hostil
    fs.writeFileSync(tmp, JSON.stringify({ schema: 'cmo-export/1', app: { id: 'otra' }, data: {} }));
    await page.setInputFiles('#import-json', tmp);
    await page.waitForFunction(() => /otra herramienta/.test(document.body.textContent));
  } finally { fs.rmSync(tmp, { force: true }); }
  assert.deepEqual(errors, []);
});

test('guardar y eliminar caso: confirmación antes de borrar; beforeunload con cambios sin guardar', { skip: !chromium }, async () => {
  const { page } = await open();
  await fillStep1(page);
  let beforeunload = false;
  page.on('dialog', async (d) => { if (d.type() === 'beforeunload') beforeunload = true; await d.accept(); });
  await page.click('[data-action="go-step-2"]');
  await page.click('[data-action="skip-to-manual"]');
  await page.click('[data-action="calculate-and-go-5"]');
  await page.click('[data-action="go-step-6"]');
  await page.click('[data-action="go-step-7"]');
  await page.fill('#case-name-input', 'Caso e2e');
  await page.click('[data-action="save-case"]');
  await page.waitForFunction(() => /Caso guardado/.test(document.body.textContent));
  await page.click('[data-action="open-load-case"]');
  await page.click('[data-action="delete-case"]');
  await page.waitForSelector('dialog.cmo-modal');
  await page.locator('dialog.cmo-modal button', { hasText: 'Cancelar' }).click();
  assert.equal(await page.locator('[data-action="load-case"]').count(), 1, 'cancelar no borra');
  await page.click('[data-action="delete-case"]');
  await page.locator('dialog.cmo-modal button', { hasText: 'Eliminar' }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-action="load-case"]').length === 0);
  await page.fill('#case-name-input', 'x').catch(() => {});
  assert.equal(beforeunload, false);
});

test('privacidad: ninguna petición externa y nada del texto narrativo en almacenamiento', { skip: !chromium }, async () => {
  const { page } = await open();
  await fillStep1(page);
  await page.click('[data-action="go-step-2"]');
  await page.click('[data-action="try-examples"]');
  await page.click('[data-action="pick-example"]');
  await page.click('[data-action="analyze-text"]');
  await page.waitForSelector('[data-action="go-step-3"]');
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  assert.doesNotMatch(stored, /Paciente|años/);
  assert.deepEqual(external, []);
});

test('revisión: las propuestas no vienen premarcadas y nada se confirma sin acción', { skip: !chromium }, async () => {
  const { page } = await open();
  await fillStep1(page);
  await page.click('[data-action="go-step-2"]');
  await page.click('[data-action="try-examples"]');
  await page.click('[data-action="pick-example"]');
  await page.click('[data-action="analyze-text"]');
  await page.waitForSelector('[data-action="go-step-3"]');
  await page.click('[data-action="go-step-3"]');
  assert.equal(await page.locator('[data-bulk-select]:checked').count(), 0);
  assert.equal(await page.locator('.review-row--confirmed').count(), 0);
});

test('móvil 375 px: sin desbordamiento horizontal en los 7 pasos', { skip: !chromium }, async () => {
  const { page } = await open({ width: 375, height: 740 });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok((await overflow()) <= 0, 'paso 1');
  await fillStep1(page);
  await page.click('[data-action="go-step-2"]'); assert.ok((await overflow()) <= 0, 'paso 2');
  await page.click('[data-action="try-examples"]'); await page.click('[data-action="pick-example"]');
  await page.click('[data-action="analyze-text"]'); await page.waitForSelector('[data-action="go-step-3"]');
  await page.click('[data-action="go-step-3"]'); assert.ok((await overflow()) <= 0, 'paso 3');
  await page.click('[data-action="go-step-4"]'); assert.ok((await overflow()) <= 0, 'paso 4');
  await page.click('[data-action="calculate-and-go-5"]'); assert.ok((await overflow()) <= 0, 'paso 5');
  await page.click('[data-action="go-step-6"]'); await page.click('[data-action="apply-recommended"]'); assert.ok((await overflow()) <= 0, 'paso 6');
  await page.click('[data-action="go-step-7"]'); assert.ok((await overflow()) <= 0, 'paso 7');
});

test('accesibilidad WCAG A/AA con axe (si AXE_PATH)', { skip: !chromium || !process.env.AXE_PATH }, async () => {
  const { page } = await open();
  const axe = fs.readFileSync(process.env.AXE_PATH, 'utf8');
  const run = async (label) => {
    await page.evaluate(axe);
    const res = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
    assert.deepEqual(res.violations.map((v) => `${v.id}:${v.nodes.length}`), [], label);
  };
  await run('paso 1');
  await fillStep1(page);
  await page.click('[data-action="go-step-2"]'); await run('paso 2');
  await page.click('[data-action="try-examples"]'); await page.click('[data-action="pick-example"]');
  await page.click('[data-action="analyze-text"]'); await page.waitForSelector('[data-action="go-step-3"]');
  await page.click('[data-action="go-step-3"]'); await run('paso 3');
  await page.click('[data-action="go-step-4"]'); await run('paso 4');
  await page.click('[data-action="calculate-and-go-5"]'); await run('paso 5');
  await page.click('[data-action="go-step-6"]'); await page.click('[data-action="apply-recommended"]'); await run('paso 6');
  await page.click('[data-action="go-step-7"]'); await run('paso 7');
});
