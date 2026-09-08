// Estado central de la aplicación, trazabilidad de origen de cada variable,
// y gestión de privacidad del texto narrativo (no se persiste por defecto).
//
// Trazabilidad de origen por variable (encargo, sección 10):
//   'ai_confirmed'  -> la IA propuso un valor y el farmacéutico lo aceptó tal cual
//   'ai_modified'   -> la IA propuso un valor y el farmacéutico lo corrigió
//   'manual'        -> introducida manualmente, sin propuesta de IA (o rechazada)
//   'unknown'       -> marcada explícitamente como desconocida/pendiente

import { STORAGE_KEY, CASE_LIBRARY_KEY, CONTEXT_FIELDS, scoredFieldsForDiseaseType } from './config.js';
import { computeStratification } from './cmo-engine.js';
import { computeNeeds } from './needs-mapper.js';

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export function createInitialState() {
  return {
    step: 1,
    highestStepReached: 1,
    context: {
      farmaceutico: '',
      hospital: '',
      pacienteId: '',
      fechaEvaluacion: todayISO(),
      tipoEI: '',
      diagnosticoEspecifico: '',
      edad: '',
      tratamiento: '',
      situacionClinica: ''
    },
    // El texto narrativo vive SOLO en memoria durante la sesión. Nunca se
    // escribe en localStorage (ver PRIVACY.md).
    narrativeText: '',
    lastExtraction: null, // último ExtractionResult devuelto por el servicio
    // variables clínicas puntuables: fieldId -> VariableState
    variables: {},
    // variables contextuales extraíbles: fieldId -> VariableState
    contextVariables: {},
    stratification: null,
    needs: null,
    selectedInterventions: [], // ver addSelectedIntervention
    reportObservations: ''
  };
}

// VariableState: { value, confirmed, origin, aiValue, aiStatus, aiConfidence, aiEvidence, aiReasoning }
function emptyVariableState() {
  return {
    value: null,
    confirmed: false,
    origin: 'unknown',
    aiValue: null,
    aiStatus: null,
    aiConfidence: null,
    aiEvidence: '',
    aiReasoning: ''
  };
}

export function applyExtractionResult(state, extractionResult) {
  state.lastExtraction = extractionResult;
  if (!extractionResult || !Array.isArray(extractionResult.results)) return state;

  extractionResult.results.forEach((r) => {
    const isContext = CONTEXT_FIELDS.some((f) => f.id === r.variable);
    const bucket = isContext ? state.contextVariables : state.variables;
    const existing = bucket[r.variable] || emptyVariableState();
    bucket[r.variable] = {
      ...existing,
      aiValue: r.value,
      aiStatus: r.status,
      aiConfidence: r.confidence,
      aiEvidence: r.evidence,
      aiReasoning: r.reasoning_summary,
      // Un hallazgo de IA nunca se confirma solo: solo se preselecciona el
      // valor si el estado es "found" (alta confianza estructural), pero
      // sigue exigiendo confirmación humana explícita.
      value: r.status === 'found' ? r.value : existing.value,
      confirmed: false,
      origin: 'unknown'
    };
  });
  return state;
}

export function confirmVariable(state, fieldId, finalValue, { isContext = false } = {}) {
  const bucket = isContext ? state.contextVariables : state.variables;
  const existing = bucket[fieldId] || emptyVariableState();
  const hadAiValue = existing.aiValue !== null && existing.aiValue !== undefined && existing.aiStatus && existing.aiStatus !== 'not_found';
  let origin = 'manual';
  if (hadAiValue) {
    origin = existing.aiValue === finalValue ? 'ai_confirmed' : 'ai_modified';
  }
  bucket[fieldId] = { ...existing, value: finalValue, confirmed: true, origin };
  return state;
}

export function markVariableUnknown(state, fieldId, { isContext = false } = {}) {
  const bucket = isContext ? state.contextVariables : state.variables;
  const existing = bucket[fieldId] || emptyVariableState();
  bucket[fieldId] = { ...existing, value: null, confirmed: true, origin: 'unknown' };
  return state;
}

export function getConfirmedClinicalValues(state) {
  const out = {};
  Object.entries(state.variables).forEach(([id, v]) => {
    if (v.confirmed && v.value !== null && v.value !== undefined && v.value !== '') out[id] = v.value;
  });
  return out;
}

export function recomputeStratification(state) {
  const confirmed = getConfirmedClinicalValues(state);
  state.stratification = computeStratification(confirmed, state.context.tipoEI, state.context.edad);
  state.needs = computeNeeds(confirmed);
  return state;
}

export function completionStats(state) {
  const fields = scoredFieldsForDiseaseType(state.context.tipoEI);
  const total = fields.length;
  const confirmed = fields.filter((f) => state.variables[f.id] && state.variables[f.id].confirmed).length;
  return { total, confirmed, pending: total - confirmed };
}

export function addSelectedIntervention(state, intervention) {
  state.selectedInterventions.push(intervention);
  return state;
}

export function removeSelectedIntervention(state, localId) {
  state.selectedInterventions = state.selectedInterventions.filter((i) => i.localId !== localId);
  return state;
}

// ---- Trazabilidad IA vs. confirmado (encargo, sección 24 — preparado para
// validación futura, sin necesitar base de datos ahora) ----
export function buildValidationLog(state) {
  const rows = [];
  const collect = (bucket, isContext) => {
    Object.entries(bucket).forEach(([id, v]) => {
      if (v.aiStatus === null && !v.confirmed) return;
      rows.push({
        variable: id,
        isContext,
        aiValue: v.aiValue,
        aiStatus: v.aiStatus,
        aiConfidence: v.aiConfidence,
        finalValue: v.confirmed ? v.value : null,
        matched: v.confirmed && v.aiStatus === 'found' ? v.aiValue === v.value : null,
        modifiedByPharmacist: v.origin === 'ai_modified'
      });
    });
  };
  collect(state.variables, false);
  collect(state.contextVariables, true);
  return rows;
}

// ---- Guardado opcional de casos (solo datos estructurados) ----
// Nunca se persiste narrativeText ni evidencias textuales (fragmentos de la
// HCE), solo valores confirmados y resultado. Ver PRIVACY.md.
export function serializeCaseForStorage(state, nombre) {
  return {
    id: Date.now(),
    nombre,
    fecha: new Date().toISOString(),
    context: { ...state.context },
    variables: Object.fromEntries(
      Object.entries(state.variables).map(([id, v]) => [id, { value: v.value, confirmed: v.confirmed, origin: v.origin }])
    ),
    stratification: state.stratification,
    selectedInterventions: state.selectedInterventions,
    reportObservations: state.reportObservations
  };
}

export function loadCaseLibrary() {
  try {
    const raw = localStorage.getItem(CASE_LIBRARY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

export function saveCaseToLibrary(state, nombre) {
  const cases = loadCaseLibrary();
  const serialized = serializeCaseForStorage(state, nombre);
  cases.push(serialized);
  localStorage.setItem(CASE_LIBRARY_KEY, JSON.stringify(cases));
  return serialized;
}

export function deleteCaseFromLibrary(id) {
  const cases = loadCaseLibrary().filter((c) => c.id !== id);
  localStorage.setItem(CASE_LIBRARY_KEY, JSON.stringify(cases));
  return cases;
}

export function restoreStateFromCase(savedCase) {
  const state = createInitialState();
  state.context = { ...state.context, ...savedCase.context };
  Object.entries(savedCase.variables || {}).forEach(([id, v]) => {
    state.variables[id] = { ...emptyVariableState(), ...v };
  });
  state.stratification = savedCase.stratification || null;
  state.selectedInterventions = savedCase.selectedInterventions || [];
  state.reportObservations = savedCase.reportObservations || '';
  const confirmed = getConfirmedClinicalValues(state);
  state.needs = computeNeeds(confirmed);
  state.step = 5;
  state.highestStepReached = 7;
  return state;
}

// STORAGE_KEY se reserva para un futuro autosave de sesión (no narrativo).
// Actualmente no se usa para evitar cualquier riesgo de persistencia
// accidental de texto clínico; ver PRIVACY.md.
export { STORAGE_KEY };
