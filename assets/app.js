// Orquestador de la aplicación: estado, eventos, navegación entre los 7
// pasos. La lógica clínica vive en cmo-engine.js/config.js; este módulo solo
// coordina UI <-> datos.

import { EXAMPLE_CASES, scoredFieldsForDiseaseType, extractableContextFields, CONTEXT_FIELDS } from './modules/config.js';
import {
  createInitialState,
  applyExtractionResult,
  confirmVariable,
  markVariableUnknown,
  recomputeStratification,
  loadCaseLibrary,
  saveCaseToLibrary,
  deleteCaseFromLibrary,
  restoreStateFromCase
} from './modules/data-layer.js';
import { extractClinicalVariables } from './modules/clinical-extraction-service.js';
import {
  buildExecutiveSummary,
  buildExtractionReport,
  buildHceSummary
} from './modules/export-layer.js';
import { getIntervention, INTERVENTIONS_CATALOG } from './modules/interventions-catalog.js';
import * as ui from './modules/ui.js';
import { APP_VERSION } from './modules/config.js';
import * as A from './modules/assessment.js';
import { createReport, reportToText, reportToHtml, exportEnvelope, parseEnvelope, validateReport } from './cmo-ds/cmo-report.js';
import { reportToPdf } from './cmo-ds/cmo-pdf.js';
import { toast, confirmDialog, guardUnsaved, copyText, download, printHtml, safeFilename } from './cmo-ds/cmo-flow.js';

const VERSION = (/v(\d+(?:\.\d+)*)/.exec(APP_VERSION) || [])[1] || '';
let dirty = false; // hay datos sin guardar ni exportar
guardUnsaved(() => dirty);
const recompute = () => { recomputeStratification(state); dirty = true; };
const evaluation = () => A.evaluate(state);
const currentReport = (opts) => createReport({ ...A.buildReportInput(state, evaluation(), { version: VERSION, ...opts }) });
const fileBase = () => safeFilename('CMO-Inmunomediadas', state.context.pacienteId || state.context.hospital, state.context.fechaEvaluacion);

let state = createInitialState();
let activeModal = null; // 'reset' | 'load' | 'custom-intervention' | null

const root = document.getElementById('app-root');
const modalLayer = document.getElementById('modal-layer');

function render() {
  root.innerHTML = `
    ${ui.renderHeader()}
    <nav class="stepper-wrap">${ui.renderStepper(state)}</nav>
    <main class="app-main" id="step-content" tabindex="-1">
      ${renderCurrentStep()}
    </main>
  `;
  renderModal();
}

function renderCurrentStep() {
  switch (state.step) {
    case 1:
      return ui.renderStep1(state);
    case 2:
      return ui.renderStep2(state);
    case 3:
      return ui.renderStep3(state);
    case 4:
      return ui.renderStep4(state);
    case 5:
      return ui.renderStep5(state, evaluation());
    case 6:
      return ui.renderStep6(state);
    case 7:
      return ui.renderStep7(state, {
        executiveSummary: buildExecutiveSummary(state, evaluation()),
        clinicalReport: reportToText(currentReport()),
        extractionReport: buildExtractionReport(state),
        provisional: evaluation().provisional
      });
    default:
      return '';
  }
}

function renderModal() {
  if (!activeModal) {
    modalLayer.innerHTML = '';
    return;
  }
  if (activeModal === 'reset') modalLayer.innerHTML = ui.renderResetModal();
  else if (activeModal === 'load') modalLayer.innerHTML = ui.renderLoadModal(loadCaseLibrary());
  else if (activeModal === 'custom-intervention') modalLayer.innerHTML = ui.renderCustomInterventionModal();
  else if (activeModal === 'examples') modalLayer.innerHTML = ui.renderExamplesModal(Object.keys(EXAMPLE_CASES));
  modalLayer.querySelector('.modal button, .modal textarea, .modal input')?.focus();
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activeModal) { activeModal = null; renderModal(); }
});

function goToStep(n) {
  state.step = n;
  state.highestStepReached = Math.max(state.highestStepReached || 1, n);
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.getElementById('step-content')?.focus({ preventScroll: true });
}

function validateStep1() {
  const missing = CONTEXT_FIELDS.filter((f) => f.required && !String(state.context[f.id] || '').trim());
  if (missing.length > 0) {
    toast('Completa los campos obligatorios (*): ' + missing.map((f) => f.label).join(', '), { type: 'error' });
    return false;
  }
  if (A.cleanAge(state.context.edad) === undefined) {
    toast('La edad debe ser un número entre 0 y 120 años.', { type: 'error' });
    return false;
  }
  if (A.looksLikeNationalId(state.context.pacienteId)) {
    toast('El identificador parece un DNI: use un código seudonimizado.', { type: 'error' });
    return false;
  }
  return true;
}

function showToast(text) {
  toast(text, { type: 'info', timeout: 4000 });
}

// ------------------------------------------------------------- Extracción --
async function runAnalysis() {
  if (!state.narrativeText.trim()) return;
  state.analyzing = true;
  render();
  const clinicalFields = scoredFieldsForDiseaseType(state.context.tipoEI);
  const contextFields = extractableContextFields();
  const result = await extractClinicalVariables(state.narrativeText, { clinicalFields, contextFields });
  applyExtractionResult(state, result);
  state.analyzing = false;
  state.highestStepReached = Math.max(state.highestStepReached || 1, 3);
  render();
}

// ------------------------------------------------------- Intervenciones --
function needTitleFor(catalogItem) {
  if (!state.needs) return '';
  const active = state.needs.all.filter((n) => catalogItem.linkedNeedIds.includes(n.id));
  return active.map((n) => n.title).join('; ');
}

function toggleIntervention(catalogId, { skipRender = false } = {}) {
  dirty = true;
  const existingIdx = state.selectedInterventions.findIndex((i) => i.catalogId === catalogId);
  if (existingIdx >= 0) {
    state.selectedInterventions.splice(existingIdx, 1);
  } else {
    const item = getIntervention(catalogId);
    if (!item) return;
    state.selectedInterventions.push({
      localId: 'iv-' + Math.random().toString(36).slice(2, 10),
      catalogId: item.id,
      source: 'catalogo',
      text: item.text,
      dimension: item.dimension,
      needTitle: needTitleFor(item),
      status: 'planned',
      objective: '',
      priority: item.recommendedLevels.includes(state.stratification ? state.stratification.level : -1) ? 'alta' : '',
      responsible: '',
      followUp: '',
      notes: ''
    });
  }
  if (!skipRender) render();
}

// -------------------------------------------------------------- Eventos --
// Delegados en `document` (no en `root`) porque los modales se renderizan en
// `modalLayer`, un elemento hermano de `root`: un listener en `root` nunca
// recibiría los clics de los botones dentro de un modal.
document.addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  const gotoEl = e.target.closest('[data-goto-step]');

  if (gotoEl) {
    const n = Number(gotoEl.dataset.gotoStep);
    if (n <= (state.highestStepReached || 1)) goToStep(n);
    return;
  }
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  switch (action) {
    case 'go-step-1':
      goToStep(1);
      break;
    case 'go-step-2':
      if (validateStep1()) goToStep(2);
      break;
    case 'go-step-3':
      goToStep(3);
      break;
    case 'go-step-4':
      goToStep(4);
      break;
    case 'go-step-5':
      recompute();
      goToStep(5);
      break;
    case 'calculate-and-go-5':
      recompute();
      goToStep(5);
      break;
    case 'go-step-6':
      goToStep(6);
      break;
    case 'go-step-7':
      goToStep(7);
      break;
    case 'skip-to-manual':
      goToStep(4);
      break;
    case 'clear-text':
      state.narrativeText = '';
      state.lastExtraction = null;
      render();
      break;
    case 'try-examples':
      pickExampleCase();
      break;
    case 'pick-example': {
      const text = EXAMPLE_CASES[actionEl.dataset.example];
      if (text) { state.narrativeText = text; dirty = true; }
      activeModal = null;
      render();
      break;
    }
    case 'bulk-select-all':
      actionEl.closest('[data-review-group]')?.querySelectorAll('[data-bulk-select]').forEach((cb) => { cb.checked = true; });
      break;
    case 'apply-override': {
      const level = document.getElementById('override-level')?.value || '';
      if (!level) {
        state.override = null;
      } else {
        const draft = { level: Number(level), motive: document.getElementById('override-motive')?.value || '', justification: document.getElementById('override-justification')?.value || '' };
        const { error } = A.checkOverride(draft, state.stratification.level);
        if (error) { toast(error, { type: 'error' }); return; }
        state.override = draft;
      }
      dirty = true;
      render();
      toast(state.override ? 'Modificación profesional aplicada; el resultado automático se conserva.' : 'Modificación retirada.');
      break;
    }
    case 'analyze-text':
      runAnalysis();
      break;
    case 'confirm-field': {
      const fieldId = actionEl.dataset.field;
      const isContext = actionEl.dataset.isContext === 'true';
      const row = actionEl.closest('[data-review-row], [data-manual-row]');
      const control = row ? row.querySelector('[data-review-value],[data-manual-value]') : null;
      const value = control ? control.value : '';
      confirmVariable(state, fieldId, value === '' ? null : value, { isContext });
      recompute();
      render();
      break;
    }
    case 'unknown-field': {
      const fieldId = actionEl.dataset.field;
      const isContext = actionEl.dataset.isContext === 'true';
      markVariableUnknown(state, fieldId, { isContext });
      recompute();
      render();
      break;
    }
    case 'bulk-confirm': {
      const section = actionEl.closest('[data-review-group]');
      if (!section) break;
      section.querySelectorAll('[data-bulk-select]:checked').forEach((cb) => {
        const fieldId = cb.dataset.field;
        const isContext = cb.dataset.isContext === 'true';
        const row = cb.closest('[data-review-row]');
        const control = row ? row.querySelector('[data-review-value]') : null;
        const value = control ? control.value : '';
        confirmVariable(state, fieldId, value === '' ? null : value, { isContext });
      });
      recompute();
      render();
      break;
    }
    case 'open-reset':
      if (!dirty) { state = createInitialState(); render(); break; }
      activeModal = 'reset';
      renderModal();
      break;
    case 'confirm-reset':
      state = createInitialState();
      dirty = false;
      activeModal = null;
      render();
      break;
    case 'open-load-case':
      activeModal = 'load';
      renderModal();
      break;
    case 'close-modal':
      activeModal = null;
      renderModal();
      break;
    case 'load-case': {
      const id = Number(actionEl.dataset.caseId);
      const found = loadCaseLibrary().find((c) => c.id === id);
      if (found) {
        state = restoreStateFromCase({ ...found, ...A.sanitizeCase(found) });
        dirty = false;
        activeModal = null;
        render();
      }
      break;
    }
    case 'delete-case': {
      const id = Number(actionEl.dataset.caseId);
      confirmDialog({ title: 'Eliminar caso guardado', message: 'El caso se eliminará de este navegador y no se podrá recuperar.', confirmLabel: 'Eliminar', danger: true })
        .then((ok) => { if (ok) { deleteCaseFromLibrary(id); renderModal(); toast('Caso eliminado.'); } });
      break;
    }
    case 'save-case': {
      const input = document.getElementById('case-name-input');
      const name = input && input.value.trim();
      if (!name) {
        toast('Introduce un nombre para el caso.', { type: 'error' });
        return;
      }
      try {
        saveCaseToLibrary(state, name);
        dirty = false;
        showToast('Caso guardado (solo datos estructurados, sin texto de la HCE).');
      } catch (err) {
        toast('No se pudo guardar el caso en este navegador (almacenamiento no disponible o lleno). Exporte el JSON.', { type: 'error' });
      }
      break;
    }
    case 'toggle-intervention':
      toggleIntervention(actionEl.dataset.catalogId);
      break;
    case 'apply-recommended': {
      if (!state.stratification) break;
      const level = state.stratification.level;
      INTERVENTIONS_CATALOG.filter((i) => i.recommendedLevels.includes(level))
        .filter((i) => !state.selectedInterventions.some((s) => s.catalogId === i.id))
        .forEach((i) => toggleIntervention(i.id, { skipRender: true }));
      render();
      break;
    }
    case 'remove-intervention': {
      const localId = actionEl.dataset.localId;
      state.selectedInterventions = state.selectedInterventions.filter((i) => i.localId !== localId);
      dirty = true;
      render();
      break;
    }
    case 'add-custom-intervention':
      activeModal = 'custom-intervention';
      renderModal();
      break;
    case 'confirm-custom-intervention': {
      const text = document.getElementById('custom-iv-text')?.value.trim();
      const dimension = document.getElementById('custom-iv-dimension')?.value;
      if (!text) {
        toast('Describe la intervención antes de añadirla.', { type: 'error' });
        return;
      }
      state.selectedInterventions.push({
        localId: 'iv-' + Math.random().toString(36).slice(2, 10),
        catalogId: null,
        source: 'manual',
        text,
        dimension,
        needTitle: '',
        objective: '',
        priority: '',
        responsible: '',
        followUp: '',
        notes: '',
        status: 'planned'
      });
      dirty = true;
      activeModal = null;
      render();
      break;
    }
    case 'copy-report':
      copyText(reportToText(currentReport())).then((ok) => toast(ok ? 'Informe copiado al portapapeles.' : 'No se pudo copiar: use «Descargar .txt».', { type: ok ? 'info' : 'error' }));
      break;
    case 'download-report':
      download(`${fileBase()}.txt`, reportToText(currentReport()));
      break;
    case 'download-pdf':
      download(`${fileBase()}.pdf`, reportToPdf(currentReport()), 'application/pdf');
      toast('PDF generado en el navegador.');
      break;
    case 'print-report': {
      const r = currentReport();
      printHtml(reportToHtml(r), r.title);
      break;
    }
    case 'export-json': {
      const report = currentReport({ includeFreeText: false });
      const errors = validateReport(report);
      if (errors.length) { toast(errors.join(' '), { type: 'error' }); break; }
      const env = exportEnvelope({
        app: { id: A.APP_ID, name: A.TOOL_NAME, version: VERSION }, exportedAt: new Date().toISOString(), report,
        data: A.caseData({ ...state, context: { ...state.context, diagnosticoEspecifico: '', tratamiento: '', situacionClinica: '' } }), dataSchema: A.CASE_SCHEMA
      });
      download(`${fileBase()}.json`, JSON.stringify(env, null, 2), 'application/json');
      dirty = false;
      toast('JSON exportado (sin texto libre ni historia clínica).');
      break;
    }
    case 'copy-hce':
      copyText(buildHceSummary(state, evaluation())).then((ok) => showToast(ok ? 'Resumen para la historia clínica copiado.' : 'No se pudo copiar el resumen.'));
      break;
    case 'copy-extraction-report':
      copyText(buildExtractionReport(state)).then((ok) => showToast(ok ? 'Informe de extracción copiado.' : 'No se pudo copiar el informe.'));
      break;
    default:
      break;
  }
});

function pickExampleCase() {
  activeModal = 'examples';
  renderModal();
}

// -------------------------------------------------- Inputs sin re-render --
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.contextField) {
    state.context[t.dataset.contextField] = t.value;
    dirty = true;
    return;
  }
  if (t.id === 'narrative-text') {
    state.narrativeText = t.value;
    dirty = true;
    const meta = t.parentElement.querySelector('.textarea-meta__actions .btn--primary');
    const counter = t.parentElement.querySelector('.textarea-meta span');
    if (counter) counter.textContent = `${t.value.length.toLocaleString('es-ES')} caracteres`;
    if (meta) meta.disabled = !t.value.trim();
    return;
  }
  if (t.dataset.ivField) {
    const iv = state.selectedInterventions.find((i) => i.localId === t.dataset.localId);
    if (iv) { iv[t.dataset.ivField] = t.value; dirty = true; }
    return;
  }
  if (t.id === 'report-observations') {
    state.reportObservations = t.value;
    dirty = true;
    const pre = document.getElementById('clinical-report-pre');
    if (pre) pre.textContent = reportToText(currentReport());
    return;
  }
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.ivField) {
    const iv = state.selectedInterventions.find((i) => i.localId === t.dataset.localId);
    if (iv) { iv[t.dataset.ivField] = t.value; dirty = true; }
  }
  if (t.id === 'plan-next-review') { state.plan.nextReview = t.value; dirty = true; }
  if (t.id === 'import-json') {
    const file = t.files && t.files[0];
    t.value = '';
    if (!file) return;
    if (dirty && !(await confirmDialog({ title: 'Importar caso', message: 'Hay cambios sin guardar que se perderán al importar.', confirmLabel: 'Importar', danger: true }))) return;
    const parsed = parseEnvelope(await file.text(), { appId: A.APP_ID });
    if (!parsed.ok) { toast(parsed.error, { type: 'error' }); return; }
    if (parsed.value.dataSchema !== A.CASE_SCHEMA) { toast('Versión de esquema no compatible con esta herramienta.', { type: 'error' }); return; }
    const clean = A.sanitizeCase(parsed.value.data);
    state = restoreStateFromCase(clean);
    dirty = false;
    render();
    toast('Caso importado y recalculado con el motor actual; revise las variables antes de usarlo.');
  }
});

render();
