// Pruebas del adaptador al flujo común (assessment.js) y protección del motor clínico.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createInitialState, confirmVariable, markVariableUnknown, recomputeStratification, restoreStateFromCase } from '../assets/modules/data-layer.js';
import { scoredFieldsForDiseaseType } from '../assets/modules/config.js';
import { computeStratification } from '../assets/modules/cmo-engine.js';
import * as A from '../assets/modules/assessment.js';
import { createReport, reportToText, reportToHtml, validateReport, exportEnvelope, parseEnvelope } from '../assets/cmo-ds/cmo-report.js';
import { reportToPdf } from '../assets/cmo-ds/cmo-pdf.js';

const mk = (over = {}) => {
  const s = createInitialState();
  Object.assign(s.context, { tipoEI: 'dermatologica', edad: '45', hospital: 'H', farmaceutico: 'F', fechaEvaluacion: '2026-01-15' }, over);
  return s;
};
const confirmAll = (s, value = 'no') => {
  for (const f of scoredFieldsForDiseaseType(s.context.tipoEI)) confirmVariable(s, f.id, value);
  recomputeStratification(s);
};

test('huella SHA-256 de los ficheros clínicos protegidos', () => {
  const fp = JSON.parse(fs.readFileSync(new URL('./fixtures/clinical-files.sha256.json', import.meta.url), 'utf8'));
  for (const [f, h] of Object.entries(fp)) {
    const text = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/export const APP_VERSION = '[^']*';/, 'export const APP_VERSION = X;');
    assert.equal(crypto.createHash('sha256').update(text).digest('hex'), h, f);
  }
});

test('el adaptador no modifica el resultado del motor: mismo total y nivel', () => {
  const s = mk();
  confirmVariable(s, 'tabaquismo', 'si');
  recomputeStratification(s);
  const ev = A.evaluate(s);
  const direct = computeStratification({ tabaquismo: 'si' }, 'dermatologica', 45);
  assert.equal(ev.strat.total, direct.total);
  assert.equal(ev.strat.level, direct.level);
});

test('variables sin confirmar: resultado provisional, no equivale a «No», con cota superior ≥ total', () => {
  const s = mk();
  confirmVariable(s, 'tabaquismo', 'si');
  markVariableUnknown(s, 'alcoholismo_drogas');
  const ev = A.evaluate(s);
  assert.equal(ev.provisional, true);
  assert.ok(ev.pending.length > 1);
  assert.ok(ev.pending.some((f) => f.id === 'alcoholismo_drogas'), '«desconocida» sigue pendiente');
  assert.ok(ev.upper.total > ev.strat.total);
  assert.ok(ev.upper.level <= ev.strat.level);
});

test('cota superior: con embarazo pendiente la regla puede llevar a Prioridad 1', () => {
  const ev = A.evaluate(mk());
  assert.equal(ev.upper.level, 1);
  assert.equal(ev.upper.pregnancyTrigger, true);
});

test('todas confirmadas y edad válida: no provisional', () => {
  const s = mk();
  confirmAll(s, 'no');
  const ev = A.evaluate(s);
  assert.equal(ev.provisional, false);
  assert.equal(ev.upper, null);
});

test('edad: vacía, negativa o no numérica queda pendiente y no puntúa (el motor puntuaba 1 punto con edad vacía)', () => {
  for (const edad of ['', '-3', 'abc', '121']) {
    const s = mk({ edad });
    confirmAll(s, 'no');
    const ev = A.evaluate(s);
    assert.equal(ev.ageMissing, true, edad);
    assert.equal(ev.provisional, true, edad);
    assert.equal(ev.strat.total, 0, edad);
    assert.equal(s.stratification.total, 0, `estado: ${edad}`);
  }
  assert.equal(A.cleanAge('0'), 0);
  assert.equal(A.cleanAge('120'), 120);
});

test('modificación profesional: exige justificación, conserva el resultado automático y avisa si reduce', () => {
  const s = mk();
  confirmAll(s, 'no'); // P3
  s.override = { level: 1, motive: 'Riesgo social', justification: 'corta' };
  let ev = A.evaluate(s);
  assert.equal(ev.override, null);
  assert.match(ev.overrideError, /justificación/);
  assert.equal(ev.finalLevel, ev.strat.level);
  s.override.justification = 'Antecedentes de abandono terapéutico recientes.';
  ev = A.evaluate(s);
  assert.equal(ev.finalLevel, 1);
  assert.equal(ev.strat.level, 3, 'el resultado automático se conserva');
  const rep = createReport(A.buildReportInput(s, ev));
  assert.equal(rep.stratification.calculatedLevel, 'Prioridad 3');
  assert.equal(rep.stratification.finalLevel, 'Prioridad 1');
  assert.ok(rep.stratification.override.justification);
  // reducir
  s.override = { level: 3, motive: '', justification: 'Paciente estable, decisión del equipo.' };
  confirmVariable(s, 'embarazada', 'si');
  recomputeStratification(s);
  ev = A.evaluate(s);
  assert.equal(ev.strat.level, 1);
  assert.equal(ev.override.isReduction, true);
  assert.ok(A.buildReportInput(s, ev).warnings.some((w) => /reduce/.test(w)));
  // coincidir con el nivel calculado no es una modificación
  s.override = { level: 1, justification: 'x'.repeat(20) };
  assert.equal(A.evaluate(s).override, null);
});

test('informe: provisional lo indica; definitivo no tiene pendientes y valida', () => {
  const p = mk();
  const rp = createReport(A.buildReportInput(p, A.evaluate(p)));
  assert.equal(rp.status, 'provisional');
  assert.ok(rp.stratification.pending.length > 0);
  assert.match(reportToText(rp), /rovisional/);
  assert.deepEqual(validateReport(rp), []);
  const f = mk();
  confirmAll(f, 'no');
  const rf = createReport(A.buildReportInput(f, A.evaluate(f)));
  assert.equal(rf.status, 'final');
  assert.deepEqual(validateReport(rf), []);
  assert.ok(reportToPdf(rf).length > 500);
});

test('informe: escapa HTML y las actuaciones tienen estado', () => {
  const s = mk({ hospital: '<img src=x onerror=alert(1)>' });
  confirmAll(s, 'no');
  s.selectedInterventions.push({ localId: 'a', catalogId: null, source: 'manual', text: '<b>Hecha</b>', dimension: 'capacidad', status: 'done' },
    { localId: 'b', catalogId: null, source: 'manual', text: 'Prevista', dimension: 'capacidad' },
    { localId: 'c', catalogId: null, source: 'manual', text: 'Nula', dimension: 'capacidad', status: 'not_applicable' });
  const rep = createReport(A.buildReportInput(s, A.evaluate(s)));
  assert.equal(rep.interventions.done.length, 1);
  assert.equal(rep.interventions.planned.length, 1);
  assert.equal(rep.interventions.notApplicableCount, 1);
  const html = reportToHtml(rep);
  assert.doesNotMatch(html, /<img|<b>/);
});

test('exportación sin texto libre clínico ni identificadores directos', () => {
  const s = mk({ diagnosticoEspecifico: 'AR', tratamiento: 'secreto-trat', situacionClinica: 'secreto-sit' });
  s.narrativeText = 'TEXTO-HCE';
  const rep = createReport(A.buildReportInput(s, A.evaluate(s), { includeFreeText: false }));
  const env = exportEnvelope({ app: { id: A.APP_ID }, exportedAt: '2026-01-01T00:00:00Z', report: rep, data: A.caseData({ ...s, context: { ...s.context, diagnosticoEspecifico: '', tratamiento: '', situacionClinica: '' } }), dataSchema: A.CASE_SCHEMA });
  const json = JSON.stringify(env);
  assert.doesNotMatch(json, /secreto-|TEXTO-HCE/);
  assert.ok(parseEnvelope(json, { appId: A.APP_ID }).ok);
  assert.equal(parseEnvelope(json, { appId: 'otra' }).ok, false);
});

test('importación segura: ids desconocidos, valores no válidos, __proto__ y resultado almacenado se descartan', () => {
  const hostile = JSON.parse(`{
    "context": {"tipoEI":"dermatologica","edad":"-5","pacienteId":"12345678Z","hospital":"<script>x</script>"},
    "variables": {"tabaquismo":{"value":"si","confirmed":true,"origin":"manual"},"inventada":{"value":"si","confirmed":true},
      "polimedicacion":{"value":"valor-raro","confirmed":true}, "__proto__":{"confirmed":true}, "constructor":{"value":"si","confirmed":true}},
    "stratification": {"total":99,"level":1},
    "override": {"level":9,"justification":"aaaaaaaaaaaaaaaaaaaa"},
    "selectedInterventions": [{"catalogId":"no-existe","text":"x"},{"text":"ok","status":"hackeado"},{"localId":"__proto__"}]
  }`);
  const clean = A.sanitizeCase(hostile);
  assert.equal(clean.context.edad, '');
  assert.equal(clean.context.pacienteId, '');
  assert.deepEqual(Object.keys(clean.variables).sort(), ['polimedicacion', 'tabaquismo']);
  assert.equal(clean.variables.polimedicacion.confirmed, false);
  assert.equal(clean.override, null);
  assert.equal(clean.selectedInterventions.length, 1);
  assert.equal(clean.selectedInterventions[0].status, 'planned');
  assert.equal(clean.stratification, undefined);
  const st = restoreStateFromCase(clean);
  assert.equal(st.stratification.total, 2, 'solo tabaquismo=2; sin edad válida no suma edad');
  assert.equal({}.polluted, undefined);
});

test('caso guardado: ida y vuelta conserva variables, modificación y plan, y se recalcula', () => {
  const s = mk();
  confirmVariable(s, 'tabaquismo', 'si');
  s.override = { level: 2, motive: 'm', justification: 'Justificación suficiente.' };
  s.plan = { nextReview: '2026-07-01', notes: 'n' };
  recomputeStratification(s);
  const back = restoreStateFromCase(A.sanitizeCase(JSON.parse(JSON.stringify(A.caseData(s)))));
  assert.equal(back.stratification.total, s.stratification.total);
  assert.equal(back.override.level, 2);
  assert.equal(back.plan.nextReview, '2026-07-01');
});

test('el informe no usa new Date() para la fecha de versión ni de evaluación', () => {
  assert.doesNotMatch(fs.readFileSync(new URL('../assets/modules/assessment.js', import.meta.url), 'utf8'), /new Date\(|Date\.now\(/);
});
