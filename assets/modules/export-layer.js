// Generación de informes y utilidades de exportación/copia. Todo el
// contenido se construye EXCLUSIVAMENTE a partir de datos confirmados por el
// farmacéutico (encargo, "PRINCIPIO FUNDAMENTAL"). No se generan
// diagnósticos ni conclusiones no sustentadas por las variables confirmadas.

import { BLOCKS, DISEASE_TYPES, getFieldDefinition } from './config.js';
import { getConfirmedClinicalValues, completionStats, buildValidationLog } from './data-layer.js';
import { CATEGORY_LABELS } from './interventions-catalog.js';

const DIMENSION_LABELS = { capacidad: 'Capacidad', motivacion: 'Motivación', oportunidad: 'Oportunidad' };
const ORIGIN_LABELS = {
  ai_confirmed: 'IA (confirmada sin cambios)',
  ai_modified: 'IA (corregida por el farmacéutico)',
  manual: 'Entrada manual',
  unknown: 'Desconocida / no disponible'
};

function diseaseLabel(tipoEI) {
  const found = DISEASE_TYPES.find((d) => d.id === tipoEI);
  return found ? found.label : tipoEI || '—';
}

function formatDate(iso) {
  if (!iso) return new Date().toLocaleDateString('es-ES');
  try {
    return new Date(iso).toLocaleDateString('es-ES');
  } catch (err) {
    return iso;
  }
}

// Aviso de provisionalidad / modificación profesional que acompaña al nivel en los resúmenes.
function levelNote(ev) {
  if (!ev) return '';
  const parts = [];
  if (ev.override) parts.push(`nivel final ${ev.finalLabel} por modificación profesional (modelo: ${ev.strat.levelLabel})`);
  if (ev.provisional) parts.push(`PROVISIONAL: ${ev.pending.length} variable(s) sin confirmar${ev.upper ? `, puntuación máxima posible ${ev.upper.total}` : ''}`);
  return parts.length ? ` [${parts.join('; ')}]` : '';
}

// ---- Resumen inteligente (sección 19) ----
export function buildExecutiveSummary(state, ev) {
  const { stratification, needs, context, selectedInterventions } = state;
  if (!stratification) return '';
  const note = levelNote(ev);
  const dims = ['capacidad', 'motivacion', 'oportunidad'].filter((d) => needs && needs[d] && needs[d].length > 0);
  const dimsText = dims.length ? dims.map((d) => DIMENSION_LABELS[d]).join(' y ') : 'ninguna dimensión destacada';
  const topFactors = stratification.contributingFactors.slice(0, 3).map((f) => f.label).join(', ') || 'ninguno con puntuación relevante';

  const edadTexto = context.edad ? `${context.edad} años` : '';
  const diagnostico = context.diagnosticoEspecifico || diseaseLabel(context.tipoEI) || 'enfermedad inmunomediada';

  return `Paciente ${edadTexto ? edadTexto + ', ' : ''}con ${diagnostico}, clasificado en ${stratification.levelLabel} (${stratification.total}/${stratification.maxPossible} puntos)${
    stratification.pregnancyTrigger ? ' — prioridad determinada por embarazo/deseo gestacional' : ''
  }${note}. Los principales factores que condicionan la estratificación son: ${topFactors}. Se identifican necesidades predominantes en ${dimsText}. Se han seleccionado ${selectedInterventions.length} intervención(es) farmacéutica(s).`;
}

// ---- Informe de extracción IA (sección 18) ----
export function buildExtractionReport(state) {
  const log = buildValidationLog(state);
  const lines = [];
  lines.push('INFORME DE EXTRACCIÓN AUTOMÁTICA — TRAZABILIDAD');
  lines.push('');
  if (!state.lastExtraction) {
    lines.push('No se ha ejecutado ninguna extracción automática en esta sesión (estratificación manual).');
    return lines.join('\n');
  }
  lines.push(`Modo de extracción: ${state.lastExtraction.mode === 'ai' ? 'IA real (endpoint configurado)' : state.lastExtraction.mode === 'demo' ? 'Modo demostración (heurística local, no es IA real)' : 'Error / no disponible'}`);
  lines.push(`Fecha/hora: ${state.lastExtraction.generatedAt}`);
  lines.push('');

  const byOrigin = { ai_confirmed: [], ai_modified: [], manual: [], unknown: [] };
  log.forEach((row) => {
    const field = getFieldDefinition(row.variable);
    const label = field ? field.label : row.variable;
    const bucket =
      row.finalValue === null
        ? 'unknown'
        : row.modifiedByPharmacist
        ? 'ai_modified'
        : row.aiStatus === 'found' && row.matched
        ? 'ai_confirmed'
        : 'manual';
    byOrigin[bucket].push({ ...row, label });
  });

  lines.push(`Variables encontradas automáticamente y confirmadas sin cambios: ${byOrigin.ai_confirmed.length}`);
  lines.push(`Variables propuestas por IA y corregidas por el farmacéutico: ${byOrigin.ai_modified.length}`);
  lines.push(`Variables introducidas/confirmadas manualmente: ${byOrigin.manual.length}`);
  lines.push(`Variables sin determinar: ${byOrigin.unknown.length}`);
  lines.push('');
  lines.push('Detalle:');
  log.forEach((row) => {
    const field = getFieldDefinition(row.variable);
    const label = field ? field.label : row.variable;
    lines.push(
      `  · ${label} — IA: ${row.aiValue ?? '(sin propuesta)'} [${row.aiStatus || '—'}, confianza ${
        row.aiConfidence !== null && row.aiConfidence !== undefined ? Math.round(row.aiConfidence * 100) + '%' : '—'
      }] → Final: ${row.finalValue ?? '(no determinado)'} ${row.modifiedByPharmacist ? '(corregida)' : ''}`
    );
  });

  return lines.join('\n');
}

// ---- Resumen compacto para pegar en la HCE (sección 20) ----
export function buildHceSummary(state, ev) {
  const { context, stratification } = state;
  if (!stratification) return '';
  const note = levelNote(ev);
  const fecha = formatDate(context.fechaEvaluacion);
  const factores = stratification.contributingFactors.slice(0, 3).map((f) => f.label).join(', ') || 'sin factores relevantes adicionales';
  return `[${fecha}] Atención Farmacéutica – Estratificación CMO-MAPEX. ${diseaseLabel(context.tipoEI)}${
    context.diagnosticoEspecifico ? ` (${context.diagnosticoEspecifico})` : ''
  }. ${stratification.levelLabel} — ${stratification.total}/${stratification.maxPossible} puntos${
    stratification.pregnancyTrigger ? ' (prioridad por embarazo/deseo gestacional)' : ''
  }${note}. Factores principales: ${factores}. Seguimiento: ${stratification.followUp}. Farmacéutico: ${context.farmaceutico || '[firma]'}.`;
}

export async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
  return ok;
}

export function downloadTextFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function reportFileName(state, extension) {
  const fecha = state.context.fechaEvaluacion || new Date().toISOString().split('T')[0];
  const hospital = state.context.hospital ? `${state.context.hospital.replace(/\s+/g, '_')}-` : '';
  const dx = (state.context.diagnosticoEspecifico || 'informe').replace(/\s+/g, '_');
  return `CMO-Inmunomediadas-${hospital}${dx}-${fecha}.${extension}`;
}

export { CATEGORY_LABELS, DIMENSION_LABELS, ORIGIN_LABELS };
