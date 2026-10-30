// Casos de referencia (pruebas de caracterización) del motor CMO Inmunomediadas.
// Congelan el comportamiento clínico ACTUAL de assets/modules/cmo-engine.js y config.js con valores
// literales. Si una prueba falla, el comportamiento clínico ha cambiado: exige revisión clínica explícita,
// nunca actualizar la prueba sin ella. Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as config from '../assets/modules/config.js';
import { computeStratification } from '../assets/modules/cmo-engine.js';

const si = (...ids) => Object.fromEntries(ids.map((id) => [id, 'si']));
const run = (vals, tipo = 'dermatologica', edad = 45) => computeStratification(vals, tipo, edad);

test('instantánea del modelo: pesos, bloques, grupos de edad y umbrales sin cambios', () => {
  const snap = JSON.parse(fs.readFileSync(new URL('./fixtures/modelo-clinico.snapshot.json', import.meta.url), 'utf8'));
  const now = {
    blocks: config.BLOCKS.map((b) => ({ id: b.id, maxPoints: b.maxPoints })),
    ageGroups: config.AGE_GROUPS.map((g) => ({ value: g.value, weight: g.weight, min: g.min, max: g.max })),
    thresholds: config.PRIORITY_THRESHOLDS,
    priorityConfig: config.PRIORITY_CONFIG,
    fields: config.FIELD_DEFINITIONS.map((f) => ({ id: f.id, block: f.block, appliesTo: f.appliesTo, options: (f.options || []).map((o) => [o.value, o.weight]) }))
  };
  assert.deepEqual(JSON.parse(JSON.stringify(now)), snap);
});

test('umbrales literales: P1 ≥ 31, P2 ≥ 18, P3 por debajo', () => {
  assert.deepEqual(config.PRIORITY_THRESHOLDS, { level1: 31, level2: 18 });
});

test('sin variables confirmadas: solo puntúa el grupo de edad (18-69 → 2), Prioridad 3', () => {
  const r = run({});
  assert.equal(r.total, 2);
  assert.equal(r.level, 3);
  assert.equal(r.levelLabel, 'Prioridad 3');
  assert.equal(r.maxPossible, 71);
});

test('grupos de edad: ≤12 → 1, 13-17 → 3, 18-69 → 2, ≥70 → 2; edad negativa, no numérica o indefinida → 0', () => {
  for (const [edad, pts] of [[0, 1], [12, 1], [13, 3], [17, 3], [18, 2], [69, 2], [70, 2], [110, 2], [undefined, 0], [-1, 0], ['abc', 0]]) {
    assert.equal(computeStratification({}, 'dermatologica', edad).total, pts, `edad ${edad}`);
  }
});

test('HALLAZGO documentado: edad vacía (estado inicial de la app) puntúa como «≤12 años» (+1)', () => {
  // Comportamiento actual (no corregido): Number('') === 0 → grupo ≤12. data-layer.js inicia edad: ''.
  // Pendiente de decisión clínica del autor; ver CHANGELOG. Esta prueba fija lo que hace hoy el motor.
  for (const edad of ['', ' ', null]) {
    assert.equal(config.ageToGroup(edad), '≤12', JSON.stringify(edad));
    assert.equal(run({}, 'dermatologica', edad).total, 1, JSON.stringify(edad));
  }
});

test('frontera P2/P3: 17 puntos → P3; 18 puntos → P2', () => {
  // edad 45 (2) + naive 4 + adherencia 4 + polimedicación 3 + interacciones 3 = 16; + sexo 1 = 17; + tabaco 2 = 19
  const base = si('naive_terapia', 'falta_adherencia', 'polimedicacion', 'interacciones');
  assert.equal(run(base).total, 16);
  const r17 = run({ ...base, ...si('sexo_mujer') });
  assert.equal(r17.total, 17); assert.equal(r17.level, 3);
  const r18 = run({ ...base, ...si('comorbilidades_2mas') });
  assert.equal(r18.total, 18); assert.equal(r18.level, 2);
});

test('frontera P1/P2: 30 puntos → P2; 31 puntos → P1', () => {
  // 2 (edad) + 4+4+3+3+3+3 (farmaco) = 22; + 3+3+2 (clínica) = 30; + sexo 1 = 31
  const base = si('naive_terapia', 'falta_adherencia', 'polimedicacion', 'interacciones', 'reacciones_adversas', 'medicamento_alto_riesgo',
    'insuficiencia_renal_hepatica', 'actividad_enfermedad', 'comorbilidades_2mas');
  const r30 = run(base);
  assert.equal(r30.total, 30); assert.equal(r30.level, 2);
  const r31 = run({ ...base, ...si('sexo_mujer') });
  assert.equal(r31.total, 31); assert.equal(r31.level, 1);
  assert.equal(r31.followUp, 'Valoración semestral (cada 6 meses)');
});

test('regla especial: embarazo o deseo gestacional → Prioridad 1 con cualquier puntuación', () => {
  const emb = run(si('embarazada'));
  assert.equal(emb.total, 5); assert.equal(emb.level, 1); assert.equal(emb.pregnancyTrigger, true);
  const deseo = run(si('deseo_embarazo'));
  assert.equal(deseo.total, 4); assert.equal(deseo.level, 1); assert.equal(deseo.pregnancyTrigger, true);
});

test('variable sin confirmar (vacía/ausente) no puntúa: nunca equivale a «No» ni a «Sí»', () => {
  assert.equal(run({ naive_terapia: '' }).total, 2);
  assert.equal(run({ naive_terapia: null }).total, 2);
  assert.equal(run({ naive_terapia: 'no' }).total, 2);
  assert.equal(run({ naive_terapia: 'valor-desconocido' }).total, 2);
});

test('bloque específico depende del tipo de EI', () => {
  assert.equal(run({ comorbilidades_cv_diabetes: 'mas-una' }, 'dermatologica').total, 4);
  assert.equal(run({ comorbilidades_cv_diabetes: 'mas-una' }, 'musculo-esqueletica').total, 2, 'variable dermatológica no aplica');
  assert.equal(run(si('discapacidad_funcional', 'dolor_presente'), 'musculo-esqueletica').total, 4);
  assert.equal(run(si('complicaciones_intestinales', 'problemas_nutricionales'), 'gastro-intestinal').total, 4);
  assert.equal(run({}, '').breakdown.especifica.max, 0, 'sin tipo de EI, el bloque específico no tiene máximo');
});

test('HALLAZGO documentado: el bloque demográfico puede alcanzar 11 puntos aunque su máximo declarado es 9', () => {
  // Comportamiento actual (no corregido): sexo 1 + edad 13-17 (3) + obesidad 2 + embarazo 3 + deseo 2 = 11.
  // Pendiente de decisión clínica del autor; ver CHANGELOG. Esta prueba fija lo que hace hoy el motor.
  const r = run(si('sexo_mujer', 'peso_obesidad', 'embarazada', 'deseo_embarazo'), 'dermatologica', 16);
  assert.equal(r.breakdown.demografica.points, 11);
  assert.equal(r.breakdown.demografica.max, 9);
  assert.equal(r.level, 1);
});

test('desglose y factores contribuyentes ordenados de mayor a menor', () => {
  const r = run(si('falta_adherencia', 'tabaquismo', 'sexo_mujer'));
  assert.deepEqual(r.breakdown, {
    demografica: { points: 3, max: 9 }, sociosanitaria: { points: 2, max: 21 }, clinica: { points: 0, max: 14 },
    farmacoterapeutica: { points: 4, max: 25 }, especifica: { points: 0, max: 2 }
  });
  assert.deepEqual(r.contributingFactors.map((f) => f.points), [4, 2, 2, 1]);
});
