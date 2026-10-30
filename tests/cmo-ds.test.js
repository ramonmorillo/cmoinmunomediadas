import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { APP_VERSION } from '../assets/modules/config.js';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const meta = JSON.parse(/<script type="application\/json" id="cmo-app-meta">([\s\S]*?)<\/script>/.exec(read('../index.html'))[1]);

test('firma CMO: la versión de la firma es la que declara APP_VERSION («v1»)', () => {
  assert.equal(meta.schema, 'cmo-app-meta/1');
  assert.equal(meta.appVersion, /v(\d+(?:\.\d+)*)/.exec(APP_VERSION)[1]);
});

test('firma CMO: fecha solo con estado publicado y nunca generada en tiempo de ejecución', () => {
  if (meta.status === 'released') assert.match(meta.releaseDate, /^\d{4}-\d{2}-\d{2}$/);
  else assert.equal(meta.releaseDate, null);
  assert.doesNotMatch(read('../assets/cmo-ds/cmo-author-signature.js'), /new Date\(|Date\.now\(/);
});

test('firma CMO: atribuye el modelo al Proyecto MAPEX (SEFH), como CLINICAL_MODEL.md', () => {
  assert.match(read('../CLINICAL_MODEL.md'), /Proyecto MAPEX \(SEFH, 2018\)/);
  assert.ok(meta.credits.some((c) => c.name.includes('Proyecto MAPEX (SEFH, 2018)')));
});

test('CMO Design System: copia fijada íntegra (sin ediciones manuales)', () => {
  const dir = new URL('../assets/cmo-ds/', import.meta.url);
  const man = JSON.parse(fs.readFileSync(new URL('CMO-DS-VERSION.json', dir), 'utf8'));
  assert.equal(man.version, meta.designSystem);
  for (const [f, h] of Object.entries(man.files)) {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL(f, dir))).digest('hex'), h, f);
  }
});
