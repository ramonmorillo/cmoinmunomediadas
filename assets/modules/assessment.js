// Adaptador de CMO Inmunomediadas al informe único y al registro de actuaciones del núcleo CMO (assets/cmo-ds/).
// No contiene reglas clínicas: el único motor es computeStratification()/computeNeeds() (sin cambios).
// Aquí solo se calcula información de flujo: variables pendientes, cota superior, modificación profesional,
// estado de las actuaciones, informe y saneamiento de casos importados.

import {
  BLOCKS, DISEASE_TYPES, FIELD_DEFINITIONS, PRIORITY_CONFIG, AGE_GROUPS, scoredFieldsForDiseaseType, getFieldDefinition
} from './config.js';
import { computeStratification } from './cmo-engine.js';
import { computeNeeds } from './needs-mapper.js';
import { INTERVENTIONS_CATALOG, CATEGORY_LABELS, getIntervention } from './interventions-catalog.js';
import { INTERVENTION_STATUSES } from '../cmo-ds/cmo-report.js';

export const APP_ID = 'cmo-inmunomediadas';
export const TOOL_NAME = 'CMO Inmunomediadas';
export const CASE_SCHEMA = 'cmo-inmunomediadas-case/1';
export const MODEL_NAME = 'Proyecto MAPEX (SEFH, 2018) — enfermedades inflamatorias inmunomediadas';
export const MIN_JUSTIFICATION = 12;
export const DIMENSION_LABELS = { capacidad: 'Capacidad', motivacion: 'Motivación', oportunidad: 'Oportunidad' };
const ORIGINS = ['ai_confirmed', 'ai_modified', 'manual', 'unknown'];
const IV_STATUSES = ['planned', 'done', 'not_applicable'];
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');

/** Edad admisible (0–120 años); un valor no numérico o fuera de rango queda pendiente en lugar de puntuar. */
export function cleanAge(value) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 120 ? n : undefined;
}

export const looksLikeNationalId = (v) => /\b\d{8}[A-Za-z]\b/.test(String(v ?? ''));

const confirmedValues = (variables) => {
  const out = {};
  for (const [id, v] of Object.entries(variables || {})) {
    if (v && v.confirmed && v.value !== null && v.value !== undefined && v.value !== '') out[id] = v.value;
  }
  return out;
};

/** Variables puntuables aún sin valor confirmado (incluye las marcadas «desconocida»). */
export function pendingFields(state) {
  const values = confirmedValues(state.variables);
  return scoredFieldsForDiseaseType(state.context.tipoEI).filter((f) => values[f.id] === undefined);
}

const maxOption = (field) => field.options.reduce((best, o) => (typeof o.weight === 'number' && o.weight > (best?.weight ?? 0) ? o : best), null);

/**
 * Cota superior: resultado del MISMO motor si todas las pendientes tomaran su opción de mayor peso
 * (y la edad pendiente, el grupo de edad de mayor peso). Es una cota prudente, no una predicción:
 * no valora la compatibilidad clínica entre variables.
 */
export function upperBound(state) {
  const values = { ...confirmedValues(state.variables) };
  for (const f of pendingFields(state)) {
    const o = maxOption(f);
    if (o) values[f.id] = o.value;
  }
  const age = cleanAge(state.context.edad);
  const topAge = AGE_GROUPS.reduce((b, g) => (g.weight > b.weight ? g : b), AGE_GROUPS[0]);
  return computeStratification(values, state.context.tipoEI, age === undefined ? topAge.min : age);
}

/** Modificación profesional válida o motivo por el que no se aplica. */
export function checkOverride(override, calculatedLevel) {
  if (!override) return { override: null, error: '' };
  const level = Number(override.level);
  if (![1, 2, 3].includes(level)) return { override: null, error: 'Nivel de modificación no válido.' };
  if (level === calculatedLevel) return { override: null, error: 'La modificación coincide con el nivel calculado.' };
  const justification = str(override.justification, 2000);
  if (justification.length < MIN_JUSTIFICATION) return { override: null, error: `La modificación requiere una justificación de al menos ${MIN_JUSTIFICATION} caracteres.` };
  return { override: { level, motive: str(override.motive, 200), justification, isReduction: level > calculatedLevel }, error: '' };
}

/** Motor original + información de flujo. El resultado automático nunca se sobrescribe: la modificación se anota aparte. */
export function evaluate(state) {
  const values = confirmedValues(state.variables);
  const age = cleanAge(state.context.edad);
  const strat = computeStratification(values, state.context.tipoEI, age);
  const needs = computeNeeds(values);
  const pending = pendingFields(state);
  const ageMissing = age === undefined;
  const provisional = pending.length > 0 || ageMissing;
  const { override, error } = checkOverride(state.override, strat.level);
  const finalLevel = override ? override.level : strat.level;
  return {
    strat, needs, values, pending, ageMissing, provisional,
    upper: provisional ? upperBound(state) : null,
    override, overrideError: error, finalLevel, finalLabel: PRIORITY_CONFIG[finalLevel].label
  };
}

export const interventionStatus = (iv) => (IV_STATUSES.includes(iv?.status) ? iv.status : 'planned');

const ivLabel = (iv) => {
  const extra = [iv.objective && `Objetivo: ${iv.objective}`, iv.responsible && `Responsable: ${iv.responsible}`, iv.followUp && `Seguimiento: ${iv.followUp}`, iv.notes && `Obs.: ${iv.notes}`].filter(Boolean);
  return extra.length ? `${iv.text} — ${extra.join('; ')}` : iv.text;
};

export function buildReportInput(state, ev, { version = '', includeFreeText = true } = {}) {
  const ctx = state.context;
  const disease = DISEASE_TYPES.find((d) => d.id === ctx.tipoEI);
  const blockLabel = (id) => BLOCKS.find((b) => b.id === id)?.label || id;
  const selected = state.selectedInterventions || [];
  const group = (iv) => (iv.catalogId ? CATEGORY_LABELS[getIntervention(iv.catalogId)?.category] || 'Intervención' : 'Intervención personalizada');
  const by = (status) => selected.filter((iv) => interventionStatus(iv) === status).map((iv) => ({ group: group(iv), label: ivLabel(iv) }));
  const selectedIds = new Set(selected.map((iv) => iv.catalogId).filter(Boolean));
  const recommended = INTERVENTIONS_CATALOG.filter((i) => i.recommendedLevels.includes(ev.finalLevel) && !selectedIds.has(i.id))
    .map((i) => ({ group: CATEGORY_LABELS[i.category], label: i.text }));
  const warnings = [];
  if (ev.provisional) {
    const parts = [];
    if (ev.pending.length) parts.push(`${ev.pending.length} variable(s) sin confirmar`);
    if (ev.ageMissing) parts.push('edad no válida o ausente');
    warnings.push(`Resultado provisional: ${parts.join(' y ')}. Una variable sin confirmar no se ha considerado negativa: no puntúa.`);
    warnings.push(`Si las pendientes resultaran positivas, la puntuación podría alcanzar hasta ${ev.upper.total} puntos (${ev.upper.levelLabel}); cota superior orientativa.`);
  }
  if (ev.override?.isReduction) warnings.push('La modificación profesional reduce la intensidad asistencial respecto a la prioridad calculada: justificación obligatoria y revisión por el equipo.');
  if (ev.overrideError && state.override) warnings.push(`Modificación no aplicada: ${ev.overrideError}`);
  if (ev.strat.pregnancyTrigger && ev.override && ev.override.level !== 1) warnings.push('La prioridad calculada procede de la regla de embarazo/deseo gestacional (Prioridad 1).');
  const confirmedNeeds = ev.needs.all.map((n) => ({ dimension: DIMENSION_LABELS[n.dimension] || n.dimension, label: n.title, detail: n.linkedVariables.map((v) => v.label).join(', ') }));
  let potential = [];
  if (ev.provisional) {
    const maxValues = { ...ev.values };
    for (const f of ev.pending) { const o = maxOption(f); if (o) maxValues[f.id] = o.value; }
    const have = new Set(ev.needs.all.map((n) => n.id));
    potential = computeNeeds(maxValues).all.filter((n) => !have.has(n.id))
      .map((n) => ({ dimension: DIMENSION_LABELS[n.dimension] || n.dimension, label: n.title, detail: 'pendiente de confirmar variables' }));
  }
  const context = [
    { label: 'Tipo de enfermedad inmunomediada', value: disease?.label || '' },
    { label: 'Edad (años)', value: ctx.edad === '' ? '' : String(cleanAge(ctx.edad) ?? '') }
  ];
  if (includeFreeText) {
    context.push({ label: 'Diagnóstico específico', value: ctx.diagnosticoEspecifico }, { label: 'Tratamiento actual', value: ctx.tratamiento }, { label: 'Situación clínica', value: ctx.situacionClinica });
  }
  return {
    title: 'Estratificación CMO — Enfermedades inmunomediadas',
    tool: { name: TOOL_NAME, version },
    model: { name: MODEL_NAME, source: 'Modelo de Atención Farmacéutica CMO (Capacidad–Motivación–Oportunidad), Proyecto MAPEX (SEFH).' },
    evaluationDate: isoDate(ctx.fechaEvaluacion), status: ev.provisional ? 'provisional' : 'final',
    hospital: ctx.hospital, pharmacist: ctx.farmaceutico, patientId: ctx.pacienteId,
    context,
    stratification: {
      score: ev.strat.total, maxScore: ev.strat.maxPossible,
      subtotals: BLOCKS.filter((b) => ev.strat.breakdown[b.id].max > 0).map((b) => ({ label: b.label, points: ev.strat.breakdown[b.id].points, max: ev.strat.breakdown[b.id].max })),
      calculatedLevel: ev.strat.levelLabel, finalLevel: ev.finalLabel, levelCode: ev.finalLevel,
      rules: ev.strat.pregnancyTrigger ? ['Embarazo o deseo gestacional confirmado → Prioridad 1 automática.'] : [],
      override: ev.override ? { level: PRIORITY_CONFIG[ev.override.level].label, motive: ev.override.motive, justification: ev.override.justification } : null,
      pending: [...ev.pending.map((f) => f.label), ...(ev.ageMissing ? ['Edad'] : [])]
    },
    factors: ev.strat.contributingFactors.map((f) => ({ dimension: blockLabel(f.block), label: f.label, detail: f.optionLabel, points: f.points })),
    needs: { confirmed: confirmedNeeds, potential },
    interventions: { done: by('done'), planned: by('planned'), recommended, notApplicableCount: by('not_applicable').length },
    plan: { periodicity: PRIORITY_CONFIG[ev.finalLevel].followUp, nextReview: isoDate(state.plan?.nextReview), notes: state.reportObservations || state.plan?.notes || '' },
    warnings
  };
}

// ---- Casos: esquema, saneamiento e importación segura ----
/** Datos estructurados del caso. Nunca incluye el texto narrativo ni evidencias textuales de la HCE. */
export function caseData(state) {
  return {
    schema: CASE_SCHEMA,
    context: { ...state.context },
    variables: Object.fromEntries(Object.entries(state.variables).map(([id, v]) => [id, { value: v.value, confirmed: v.confirmed, origin: v.origin }])),
    override: state.override || null,
    selectedInterventions: state.selectedInterventions,
    plan: state.plan,
    reportObservations: state.reportObservations
  };
}

/**
 * Saneamiento de un caso (importado o de localStorage): solo ids y valores del modelo, textos acotados,
 * sin resultados almacenados (el resultado siempre se recalcula con el motor).
 */
export function sanitizeCase(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const c = src.context && typeof src.context === 'object' ? src.context : {};
  const tipoEI = DISEASE_TYPES.some((d) => d.id === c.tipoEI) ? c.tipoEI : '';
  const age = cleanAge(c.edad);
  const context = {
    farmaceutico: str(c.farmaceutico, 200), hospital: str(c.hospital, 200), pacienteId: looksLikeNationalId(c.pacienteId) ? '' : str(c.pacienteId, 60),
    fechaEvaluacion: isoDate(c.fechaEvaluacion), tipoEI, diagnosticoEspecifico: str(c.diagnosticoEspecifico, 300),
    edad: age === undefined ? '' : String(age), tratamiento: str(c.tratamiento, 2000), situacionClinica: str(c.situacionClinica, 2000)
  };
  const variables = {};
  for (const [id, v] of Object.entries(src.variables && typeof src.variables === 'object' ? src.variables : {})) {
    const field = FIELD_DEFINITIONS.find((f) => f.id === id);
    if (!field || !v || typeof v !== 'object') continue;
    const valid = field.options.some((o) => o.value === v.value);
    const confirmed = v.confirmed === true;
    variables[id] = { value: valid ? v.value : null, confirmed: confirmed && (valid || v.value === null), origin: ORIGINS.includes(v.origin) ? v.origin : 'manual' };
  }
  const o = src.override && typeof src.override === 'object' ? src.override : null;
  const override = o && [1, 2, 3].includes(Number(o.level)) ? { level: Number(o.level), motive: str(o.motive, 200), justification: str(o.justification, 2000) } : null;
  const ivs = (Array.isArray(src.selectedInterventions) ? src.selectedInterventions : []).slice(0, 100).map((iv, i) => {
    const cat = iv && iv.catalogId ? getIntervention(iv.catalogId) : null;
    if (iv && iv.catalogId && !cat) return null;
    const text = cat ? cat.text : str(iv?.text, 600);
    if (!text) return null;
    return {
      localId: `iv-imp-${i}`, catalogId: cat ? cat.id : null, source: cat ? 'catalogo' : 'manual', text,
      dimension: cat ? cat.dimension : ['capacidad', 'motivacion', 'oportunidad'].includes(iv?.dimension) ? iv.dimension : 'capacidad',
      needTitle: str(iv?.needTitle, 400), objective: str(iv?.objective, 400), priority: ['alta', 'media', 'baja'].includes(iv?.priority) ? iv.priority : '',
      responsible: str(iv?.responsible, 200), followUp: str(iv?.followUp, 200), notes: str(iv?.notes, 600), status: interventionStatus(iv)
    };
  }).filter(Boolean);
  const p = src.plan && typeof src.plan === 'object' ? src.plan : {};
  return {
    context, variables, override, selectedInterventions: ivs,
    plan: { nextReview: isoDate(p.nextReview), notes: str(p.notes, 2000) },
    reportObservations: str(src.reportObservations, 4000)
  };
}

export { INTERVENTION_STATUSES, getFieldDefinition };
