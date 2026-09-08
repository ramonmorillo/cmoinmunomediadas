// Capa de presentación: funciones puras que devuelven HTML a partir del
// estado. No mutan estado ni añaden listeners (eso ocurre en app.js). Mantener
// esta separación es lo que permite cambiar el diseño visual sin tocar la
// lógica clínica ni al revés.

import { BLOCKS, CONTEXT_FIELDS, PRIVACY_NOTICE, scoredFieldsForDiseaseType } from './config.js';
import { completionStats } from './data-layer.js';
import { AVAILABILITY_TIERS, CATEGORY_LABELS, INTERVENTIONS_CATALOG } from './interventions-catalog.js';

export const STEPS = [
  { id: 1, label: 'Nueva estratificación' },
  { id: 2, label: 'Historia clínica' },
  { id: 3, label: 'Revisión de variables' },
  { id: 4, label: 'Completar información' },
  { id: 5, label: 'Resultado' },
  { id: 6, label: 'Plan de intervenciones' },
  { id: 7, label: 'Informe final' }
];

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderStepper(state) {
  return `<ol class="stepper" role="list">
    ${STEPS.map((s) => {
      const status = s.id === state.step ? 'current' : s.id < state.step || s.id <= (state.highestStepReached || 1) ? 'done' : 'pending';
      const clickable = s.id <= (state.highestStepReached || 1);
      return `<li class="stepper__item stepper__item--${status}">
        <button type="button" class="stepper__btn" data-goto-step="${s.id}" ${clickable ? '' : 'disabled'} aria-current="${s.id === state.step}">
          <span class="stepper__num">${s.id}</span>
          <span class="stepper__label">${esc(s.label)}</span>
        </button>
      </li>`;
    }).join('')}
  </ol>`;
}

export function renderHeader() {
  return `<header class="app-header">
    <div class="app-header__title">
      <h1>CMO Inmunomediadas</h1>
      <p>Estratificación y Atención Farmacéutica · Modelo CMO-MAPEX (SEFH)</p>
    </div>
    <div class="app-header__actions">
      <button type="button" class="btn btn--ghost" data-action="open-load-case">Cargar caso</button>
      <button type="button" class="btn btn--danger-outline" data-action="open-reset">Nueva estratificación</button>
    </div>
  </header>`;
}

export function renderPrivacyBanner() {
  return `<div class="banner banner--privacy">⚠️ ${esc(PRIVACY_NOTICE)}</div>`;
}

// ---------------------------------------------------------------- Paso 1 --
export function renderStep1(state) {
  const ctx = state.context;
  const field = (id) => CONTEXT_FIELDS.find((f) => f.id === id);
  const input = (id, opts = {}) => {
    const f = field(id);
    const value = esc(ctx[id]);
    if (f.type === 'select') {
      return `<select id="ctx-${id}" data-context-field="${id}">
        <option value="">Seleccionar…</option>
        ${f.options.map((o) => `<option value="${o.id}" ${ctx[id] === o.id ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
      </select>`;
    }
    if (f.type === 'textarea') {
      return `<textarea id="ctx-${id}" data-context-field="${id}" rows="3" ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''}>${value}</textarea>`;
    }
    return `<input id="ctx-${id}" data-context-field="${id}" type="${f.type}" value="${value}" ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''}/>`;
  };

  return `
  ${renderPrivacyBanner()}
  <section class="card">
    <h2>Datos del profesional y centro</h2>
    <div class="form-grid form-grid--3">
      <label>Farmacéutico *${input('farmaceutico', { placeholder: 'Nombre del farmacéutico' })}</label>
      <label>Hospital/Centro *${input('hospital', { placeholder: 'Nombre del hospital' })}</label>
      <label>Fecha de evaluación *${input('fechaEvaluacion')}</label>
    </div>
    <div class="form-grid">
      <label>Identificador pseudonimizado del paciente (opcional)${input('pacienteId', { placeholder: 'Ej. EII-014' })}</label>
    </div>
  </section>

  <section class="card">
    <h2>Datos del paciente</h2>
    <div class="form-grid">
      <label>Tipo de enfermedad inflamatoria inmunomediada *${input('tipoEI')}</label>
      <label>Diagnóstico específico *${input('diagnosticoEspecifico', { placeholder: 'Ej. Artritis reumatoide seropositiva' })}</label>
      <label>Edad (años) *${input('edad', { placeholder: 'Ej. 52' })}</label>
      <label>Tratamiento actual para la EI *${input('tratamiento', { placeholder: 'Fármaco(s), dosis, pauta' })}</label>
      <label>Situación clínica reciente *${input('situacionClinica', { placeholder: 'Actividad de la enfermedad, brotes recientes…' })}</label>
    </div>
  </section>

  <div class="step-actions">
    <button type="button" class="btn btn--primary" data-action="go-step-2">Continuar a historia clínica →</button>
  </div>`;
}

// ---------------------------------------------------------------- Paso 2 --
export function renderStep2(state) {
  const text = state.narrativeText || '';
  const count = text.length;
  const statusBox = state.lastExtraction ? renderExtractionStatus(state.lastExtraction) : '';
  return `
  <section class="card">
    <h2>Importar información clínica</h2>
    <p class="muted">Pega aquí el texto de la historia clínica (antecedentes, tratamiento, analíticas, actividad de la enfermedad, adherencia, situación social…). La IA extraerá lo que encuentre; todo debe ser revisado por ti antes de usarse en el cálculo.</p>
    ${renderPrivacyBanner()}
    <textarea id="narrative-text" rows="14" placeholder="Pega aquí el texto de la historia clínica…">${esc(text)}</textarea>
    <div class="textarea-meta">
      <span>${count.toLocaleString('es-ES')} caracteres</span>
      <div class="textarea-meta__actions">
        <button type="button" class="btn btn--ghost" data-action="clear-text">Borrar texto</button>
        <button type="button" class="btn btn--secondary" data-action="try-examples">Probar con un caso de ejemplo</button>
        <button type="button" class="btn btn--primary" data-action="analyze-text" ${text.trim() ? '' : 'disabled'}>
          ${state.analyzing ? 'Analizando…' : 'Analizar historia clínica'}
        </button>
      </div>
    </div>
    ${statusBox}
  </section>
  <div class="step-actions step-actions--split">
    <button type="button" class="btn btn--ghost" data-action="go-step-1">← Volver</button>
    <button type="button" class="btn btn--secondary" data-action="skip-to-manual">Continuar sin IA (manual) →</button>
    ${state.lastExtraction ? '<button type="button" class="btn btn--primary" data-action="go-step-3">Revisar información extraída →</button>' : ''}
  </div>`;
}

function renderExtractionStatus(extraction) {
  if (extraction.mode === 'demo') {
    return `<div class="banner banner--info">🧪 <strong>Modo demostración.</strong> ${esc(extraction.message)}</div>`;
  }
  if (extraction.mode === 'error') {
    return `<div class="banner banner--warning">⚠️ ${esc(extraction.message)} ${extraction.errorDetail ? `<span class="muted">(${esc(extraction.errorDetail)})</span>` : ''}</div>`;
  }
  if (extraction.mode === 'ai') {
    return `<div class="banner banner--success">✅ Extracción completada mediante el servicio de IA configurado.</div>`;
  }
  return '';
}

// ---------------------------------------------------------------- Paso 3 --
const STATUS_LABELS = {
  found: 'Alta confianza',
  uncertain: 'Dudosa / incompleta',
  not_found: 'No encontrada',
  contradictory: 'Contradictoria'
};

function fieldOptionsSelect(field, currentValue, dataAttrs) {
  return `<select ${dataAttrs}>
    <option value="">— Sin determinar —</option>
    ${field.options.map((o) => `<option value="${esc(o.value)}" ${currentValue === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
  </select>`;
}

function renderReviewRow(field, varState, isContext, allowBulk) {
  const status = varState.aiStatus || 'not_found';
  const confidencePct = varState.aiConfidence !== null && varState.aiConfidence !== undefined ? Math.round(varState.aiConfidence * 100) : null;
  const evidenceId = `evid-${isContext ? 'ctx-' : ''}${field.id}`;
  const isSelect = field.type !== 'text' && field.type !== 'textarea' && field.type !== 'number';
  const valueControl = isSelect
    ? fieldOptionsSelect(field, varState.value, `data-review-value data-field="${field.id}" data-is-context="${isContext}"`)
    : `<input type="${field.type === 'number' ? 'number' : 'text'}" data-review-value data-field="${field.id}" data-is-context="${isContext}" value="${esc(varState.value)}"/>`;

  return `<div class="review-row ${varState.confirmed ? 'review-row--confirmed' : ''}" data-review-row="${field.id}">
    <div class="review-row__main">
      <div class="review-row__label">
        <span class="badge badge--${status}">${STATUS_LABELS[status] || status}</span>
        <strong>${esc(field.label)}</strong>
        ${confidencePct !== null ? `<span class="muted">confianza ${confidencePct}%</span>` : ''}
      </div>
      <div class="review-row__value">${valueControl}</div>
    </div>
    ${varState.aiEvidence ? `
      <details class="review-row__evidence">
        <summary>Ver evidencia</summary>
        <blockquote id="${evidenceId}">${esc(varState.aiEvidence)}</blockquote>
        ${varState.aiReasoning ? `<p class="muted">${esc(varState.aiReasoning)}</p>` : ''}
      </details>` : varState.aiReasoning ? `<p class="muted review-row__reasoning">${esc(varState.aiReasoning)}</p>` : ''}
    <div class="review-row__actions">
      ${allowBulk ? `<label class="checkbox-inline"><input type="checkbox" data-bulk-select data-field="${field.id}" data-is-context="${isContext}" checked/> Incluir en confirmación</label>` : ''}
      <button type="button" class="btn btn--sm btn--primary" data-action="confirm-field" data-field="${field.id}" data-is-context="${isContext}">Aceptar</button>
      <button type="button" class="btn btn--sm btn--ghost" data-action="unknown-field" data-field="${field.id}" data-is-context="${isContext}">Marcar desconocida</button>
    </div>
  </div>`;
}

export function renderStep3(state) {
  const clinicalFields = scoredFieldsForDiseaseType(state.context.tipoEI);
  const contextFields = CONTEXT_FIELDS.filter((f) => f.extractable);

  const allRows = [
    ...contextFields.map((f) => ({ field: f, varState: state.contextVariables[f.id] || {}, isContext: true })),
    ...clinicalFields.map((f) => ({ field: f, varState: state.variables[f.id] || {}, isContext: false }))
  ];

  const groups = {
    found: allRows.filter((r) => (r.varState.aiStatus || 'not_found') === 'found'),
    uncertain: allRows.filter((r) => (r.varState.aiStatus || 'not_found') === 'uncertain'),
    contradictory: allRows.filter((r) => (r.varState.aiStatus || 'not_found') === 'contradictory'),
    not_found: allRows.filter((r) => (r.varState.aiStatus || 'not_found') === 'not_found')
  };

  const section = (key, title, allowBulk) => {
    if (groups[key].length === 0) return '';
    return `<section class="card" data-review-group="${key}">
      <div class="card__header">
        <h3>${title} <span class="muted">(${groups[key].length})</span></h3>
        ${allowBulk ? `<button type="button" class="btn btn--sm btn--secondary" data-action="bulk-confirm" data-group="${key}">Confirmar seleccionadas</button>` : ''}
      </div>
      ${groups[key].map((r) => renderReviewRow(r.field, r.varState, r.isContext, allowBulk)).join('')}
    </section>`;
  };

  return `
  <section class="card card--muted">
    <p>Revisa cada variable identificada. La IA solo <strong>sugiere</strong>: ninguna variable dudosa se da por confirmada automáticamente. Corrige el valor si es necesario antes de aceptar.</p>
  </section>
  ${section('found', 'Información encontrada con alta confianza', true)}
  ${section('uncertain', 'Información dudosa o incompleta', false)}
  ${section('contradictory', 'Información contradictoria', false)}
  ${section('not_found', 'Información no encontrada', false)}
  <div class="step-actions step-actions--split">
    <button type="button" class="btn btn--ghost" data-action="go-step-2">← Volver</button>
    <button type="button" class="btn btn--primary" data-action="go-step-4">Continuar a completar información →</button>
  </div>`;
}

// ---------------------------------------------------------------- Paso 4 --
export function renderStep4(state) {
  const stats = completionStats(state);
  const clinicalFields = scoredFieldsForDiseaseType(state.context.tipoEI);
  const pending = clinicalFields.filter((f) => !(state.variables[f.id] && state.variables[f.id].confirmed));
  const confirmed = clinicalFields.filter((f) => state.variables[f.id] && state.variables[f.id].confirmed);

  const renderManualRow = (field) => {
    const vs = state.variables[field.id] || {};
    return `<div class="manual-row" data-manual-row="${field.id}">
      <label>${esc(field.label)}
        <span class="hint">${esc(field.criteria)}</span>
        ${fieldOptionsSelect(field, vs.value, `data-manual-value data-field="${field.id}"`)}
      </label>
      <div class="manual-row__actions">
        <button type="button" class="btn btn--sm btn--primary" data-action="confirm-field" data-field="${field.id}" data-is-context="false">Confirmar</button>
        <button type="button" class="btn btn--sm btn--ghost" data-action="unknown-field" data-field="${field.id}" data-is-context="false">Desconocida</button>
      </div>
    </div>`;
  };

  return `
  <section class="card card--muted">
    <p><strong>Se han identificado/confirmado automáticamente ${stats.confirmed} de ${stats.total} variables necesarias.</strong>
    ${stats.pending > 0 ? `Quedan ${stats.pending} por completar.` : 'No queda ninguna variable pendiente.'}</p>
  </section>

  ${pending.length > 0 ? `<section class="card">
    <h3>Variables pendientes</h3>
    ${pending.map(renderManualRow).join('')}
  </section>` : ''}

  <section class="card card--collapsible">
    <details ${pending.length === 0 ? 'open' : ''}>
      <summary>Ver también las ${confirmed.length} variables ya confirmadas</summary>
      ${confirmed.map(renderManualRow).join('')}
    </details>
  </section>

  <div class="step-actions step-actions--split">
    <button type="button" class="btn btn--ghost" data-action="go-step-3">← Volver</button>
    <button type="button" class="btn btn--primary" data-action="calculate-and-go-5">Calcular estratificación →</button>
  </div>`;
}

// ---------------------------------------------------------------- Paso 5 --
export function renderStep5(state) {
  const s = state.stratification;
  if (!s) return '<p>No hay resultado calculado todavía.</p>';
  const levelClass = `level-${s.level}`;
  return `
  <section class="card result-card ${levelClass}">
    <div class="result-card__main">
      <h2>NIVEL DE PRIORIDAD ${s.level}</h2>
      <p class="result-card__score">Puntuación: ${s.total}/${s.maxPossible} puntos</p>
      <p class="muted">Seguimiento: ${esc(s.followUp)}</p>
      ${s.pregnancyTrigger ? '<p class="tag tag--alert">⚠️ Prioridad 1 aplicada por regla especial de embarazo/deseo gestacional</p>' : ''}
    </div>
  </section>

  <section class="card">
    <h3>Desglose por bloque</h3>
    <div class="breakdown-grid">
      ${BLOCKS.filter((b) => s.breakdown[b.id].max > 0).map((b) => {
        const bk = s.breakdown[b.id];
        const pct = bk.max ? Math.round((bk.points / bk.max) * 100) : 0;
        return `<div class="breakdown-item">
          <span class="muted">${esc(b.label)}</span>
          <strong>${bk.points}/${bk.max}</strong>
          <div class="progress"><div class="progress__bar" style="width:${pct}%"></div></div>
        </div>`;
      }).join('')}
    </div>
  </section>

  <section class="card">
    <h3>Principales factores que determinan esta prioridad</h3>
    ${s.contributingFactors.length === 0 ? '<p class="muted">Ninguna variable confirmada ha aportado puntuación.</p>' : `
    <ul class="factor-list">
      ${s.contributingFactors.map((f) => `<li><strong>${esc(f.label)}</strong>: ${esc(f.optionLabel)} — ${f.points} puntos</li>`).join('')}
    </ul>`}
  </section>

  <div class="step-actions step-actions--split">
    <button type="button" class="btn btn--ghost" data-action="go-step-4">← Volver</button>
    <button type="button" class="btn btn--primary" data-action="go-step-6">Continuar a plan de intervenciones →</button>
  </div>`;
}

// ---------------------------------------------------------------- Paso 6 --
function renderNeedsBlock(state) {
  const needs = state.needs;
  if (!needs) return '';
  const dims = [
    ['capacidad', 'Capacidad'],
    ['motivacion', 'Motivación'],
    ['oportunidad', 'Oportunidad']
  ];
  return `<section class="card">
    <h3>Necesidades identificadas</h3>
    <div class="needs-grid">
      ${dims.map(([id, label]) => `<div class="needs-col needs-col--${id}">
        <h4>${label}</h4>
        ${needs[id].length === 0 ? '<p class="muted">Sin necesidades identificadas</p>' : needs[id].map((n) => `<div class="need-chip" data-need-id="${n.id}">
          <strong>${esc(n.title)}</strong>
          <span class="muted">${n.linkedVariables.map((v) => esc(v.label)).join(', ')}</span>
        </div>`).join('')}
      </div>`).join('')}
    </div>
  </section>`;
}

function renderInterventionCard(intervention, state) {
  const selected = state.selectedInterventions.find((i) => i.catalogId === intervention.id);
  const recommended = state.stratification && intervention.recommendedLevels.includes(state.stratification.level);
  return `<div class="intervention-card ${selected ? 'intervention-card--selected' : ''}" data-catalog-id="${intervention.id}">
    <label class="checkbox-inline">
      <input type="checkbox" data-action="toggle-intervention" data-catalog-id="${intervention.id}" ${selected ? 'checked' : ''}/>
      <span>${esc(intervention.text)}</span>
    </label>
    <div class="intervention-card__meta">
      ${recommended ? '<span class="tag tag--recommended">Recomendada para este nivel</span>' : ''}
      <span class="tag tag--tier-${intervention.tier}">${AVAILABILITY_TIERS[intervention.tier].label}</span>
    </div>
  </div>`;
}

export function renderStep6(state) {
  const categories = ['seguimiento', 'educacion', 'coordinacion'];
  return `
  ${renderNeedsBlock(state)}

  <section class="card">
    <div class="card__header">
      <h3>Catálogo de intervenciones</h3>
      <button type="button" class="btn btn--sm btn--secondary" data-action="apply-recommended">Seleccionar recomendadas para este nivel</button>
    </div>
    <p class="muted">Marca solo las intervenciones que realmente vas a llevar a cabo. La disponibilidad (básica/avanzada/dependiente del centro) es orientativa: decide según tus recursos.</p>
    ${categories.map((cat) => `
      <h4 class="category-title">${CATEGORY_LABELS[cat]}</h4>
      <div class="intervention-list">
        ${INTERVENTIONS_CATALOG.filter((i) => i.category === cat).map((i) => renderInterventionCard(i, state)).join('')}
      </div>
    `).join('')}
  </section>

  <section class="card">
    <div class="card__header">
      <h3>Intervenciones seleccionadas (${state.selectedInterventions.length})</h3>
      <button type="button" class="btn btn--sm btn--secondary" data-action="add-custom-intervention">+ Añadir intervención personalizada</button>
    </div>
    ${state.selectedInterventions.length === 0 ? '<p class="muted">Aún no has seleccionado ninguna intervención.</p>' : state.selectedInterventions.map(renderSelectedInterventionForm).join('')}
  </section>

  <div class="step-actions step-actions--split">
    <button type="button" class="btn btn--ghost" data-action="go-step-5">← Volver</button>
    <button type="button" class="btn btn--primary" data-action="go-step-7">Generar informe final →</button>
  </div>`;
}

function renderSelectedInterventionForm(iv) {
  return `<div class="selected-intervention" data-local-id="${iv.localId}">
    <div class="selected-intervention__header">
      <strong>${esc(iv.text)}</strong>
      <button type="button" class="btn btn--sm btn--danger-outline" data-action="remove-intervention" data-local-id="${iv.localId}">Quitar</button>
    </div>
    <div class="form-grid form-grid--3">
      <label>Objetivo farmacoterapéutico
        <input type="text" data-iv-field="objective" data-local-id="${iv.localId}" value="${esc(iv.objective)}" placeholder="Ej. Mejorar la adherencia al tratamiento biológico"/>
      </label>
      <label>Prioridad
        <select data-iv-field="priority" data-local-id="${iv.localId}">
          <option value="">Sin especificar</option>
          <option value="alta" ${iv.priority === 'alta' ? 'selected' : ''}>Alta</option>
          <option value="media" ${iv.priority === 'media' ? 'selected' : ''}>Media</option>
          <option value="baja" ${iv.priority === 'baja' ? 'selected' : ''}>Baja</option>
        </select>
      </label>
      <label>Responsable
        <input type="text" data-iv-field="responsible" data-local-id="${iv.localId}" value="${esc(iv.responsible)}" placeholder="Opcional"/>
      </label>
      <label>Seguimiento / plazo
        <input type="text" data-iv-field="followUp" data-local-id="${iv.localId}" value="${esc(iv.followUp)}" placeholder="Ej. Próxima visita"/>
      </label>
      <label class="form-grid__wide">Observaciones
        <input type="text" data-iv-field="notes" data-local-id="${iv.localId}" value="${esc(iv.notes)}"/>
      </label>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- Paso 7 --
export function renderStep7(state, { executiveSummary, clinicalReport, extractionReport }) {
  return `
  <section class="card card--muted">
    <h3>Resumen para el farmacéutico</h3>
    <p>${esc(executiveSummary)}</p>
  </section>

  <section class="card">
    <div class="card__header">
      <h3>Informe de estratificación CMO</h3>
      <div class="btn-group">
        <button type="button" class="btn btn--sm btn--secondary" data-action="copy-report">Copiar informe</button>
        <button type="button" class="btn btn--sm btn--secondary" data-action="download-report">Descargar .txt</button>
        <button type="button" class="btn btn--sm btn--secondary" data-action="print-report">Imprimir</button>
      </div>
    </div>
    <pre class="report-pre" id="clinical-report-pre">${esc(clinicalReport)}</pre>
  </section>

  <section class="card">
    <label>Observaciones (editable)
      <textarea id="report-observations" rows="3">${esc(state.reportObservations)}</textarea>
    </label>
  </section>

  <section class="card">
    <div class="card__header">
      <h3>Texto para historia clínica electrónica</h3>
      <button type="button" class="btn btn--sm btn--primary" data-action="copy-hce">Copiar resumen para historia clínica</button>
    </div>
  </section>

  <section class="card">
    <details>
      <summary>Informe de extracción por IA (trazabilidad)</summary>
      <pre class="report-pre">${esc(extractionReport)}</pre>
      <button type="button" class="btn btn--sm btn--secondary" data-action="copy-extraction-report">Copiar informe de extracción</button>
    </details>
  </section>

  <section class="card">
    <div class="card__header">
      <h3>Guardar este caso</h3>
    </div>
    <div class="inline-form">
      <input type="text" id="case-name-input" placeholder="Nombre para identificar el caso guardado"/>
      <button type="button" class="btn btn--secondary" data-action="save-case">Guardar caso (solo datos estructurados, sin texto de la HCE)</button>
    </div>
  </section>

  <div class="step-actions step-actions--split">
    <button type="button" class="btn btn--ghost" data-action="go-step-6">← Volver</button>
    <button type="button" class="btn btn--danger-outline" data-action="open-reset">Nueva estratificación</button>
  </div>`;
}

// -------------------------------------------------------------- Modales --
export function renderResetModal() {
  return `<div class="modal-backdrop" data-modal="reset">
    <div class="modal">
      <h3>⚠️ Confirmar nueva estratificación</h3>
      <p>Se borrarán la historia clínica pegada, la extracción realizada, todas las variables, confirmaciones, la puntuación, el estrato y el informe generado. Esta acción no se puede deshacer.</p>
      <div class="modal__actions">
        <button type="button" class="btn btn--ghost" data-action="close-modal">Cancelar</button>
        <button type="button" class="btn btn--danger" data-action="confirm-reset">Sí, borrar todo y empezar de nuevo</button>
      </div>
    </div>
  </div>`;
}

export function renderLoadModal(cases) {
  return `<div class="modal-backdrop" data-modal="load">
    <div class="modal modal--wide">
      <h3>Cargar caso guardado</h3>
      ${cases.length === 0 ? '<p class="muted">No hay casos guardados en este navegador.</p>' : `<div class="case-list">
        ${cases.map((c) => `<div class="case-row">
          <div>
            <strong>${esc(c.nombre)}</strong>
            <span class="muted">${new Date(c.fecha).toLocaleDateString('es-ES')} · ${c.stratification ? c.stratification.levelLabel : ''}</span>
          </div>
          <div class="btn-group">
            <button type="button" class="btn btn--sm btn--primary" data-action="load-case" data-case-id="${c.id}">Cargar</button>
            <button type="button" class="btn btn--sm btn--danger-outline" data-action="delete-case" data-case-id="${c.id}">Eliminar</button>
          </div>
        </div>`).join('')}
      </div>`}
      <div class="modal__actions">
        <button type="button" class="btn btn--ghost" data-action="close-modal">Cerrar</button>
      </div>
    </div>
  </div>`;
}

export function renderCustomInterventionModal() {
  return `<div class="modal-backdrop" data-modal="custom-intervention">
    <div class="modal">
      <h3>Añadir intervención personalizada</h3>
      <div class="form-grid">
        <label>Descripción de la intervención *
          <textarea id="custom-iv-text" rows="2"></textarea>
        </label>
        <label>Dimensión CMO
          <select id="custom-iv-dimension">
            <option value="capacidad">Capacidad</option>
            <option value="motivacion">Motivación</option>
            <option value="oportunidad">Oportunidad</option>
          </select>
        </label>
      </div>
      <div class="modal__actions">
        <button type="button" class="btn btn--ghost" data-action="close-modal">Cancelar</button>
        <button type="button" class="btn btn--primary" data-action="confirm-custom-intervention">Añadir</button>
      </div>
    </div>
  </div>`;
}

export function renderSaveConfirmToast(text) {
  return `<div class="toast">${esc(text)}</div>`;
}
