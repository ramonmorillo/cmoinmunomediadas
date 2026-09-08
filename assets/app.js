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
  buildClinicalReport,
  buildExtractionReport,
  buildHceSummary,
  copyToClipboard,
  downloadTextFile,
  reportFileName
} from './modules/export-layer.js';
import { getIntervention, INTERVENTIONS_CATALOG } from './modules/interventions-catalog.js';
import * as ui from './modules/ui.js';

let state = createInitialState();
let activeModal = null; // 'reset' | 'load' | 'custom-intervention' | null

const root = document.getElementById('app-root');
const modalLayer = document.getElementById('modal-layer');

function render() {
  root.innerHTML = `
    ${ui.renderHeader()}
    <nav class="stepper-wrap">${ui.renderStepper(state)}</nav>
    <main class="app-main" id="step-content">
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
      return ui.renderStep5(state);
    case 6:
      return ui.renderStep6(state);
    case 7:
      return ui.renderStep7(state, {
        executiveSummary: buildExecutiveSummary(state),
        clinicalReport: buildClinicalReport(state),
        extractionReport: buildExtractionReport(state)
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
}

function goToStep(n) {
  state.step = n;
  state.highestStepReached = Math.max(state.highestStepReached || 1, n);
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateStep1() {
  const missing = CONTEXT_FIELDS.filter((f) => f.required && !String(state.context[f.id] || '').trim());
  if (missing.length > 0) {
    alert('Por favor completa todos los campos obligatorios (*) antes de continuar:\n' + missing.map((f) => '· ' + f.label).join('\n'));
    return false;
  }
  return true;
}

function showToast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
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
      recomputeStratification(state);
      goToStep(5);
      break;
    case 'calculate-and-go-5':
      recomputeStratification(state);
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
      recomputeStratification(state);
      render();
      break;
    }
    case 'unknown-field': {
      const fieldId = actionEl.dataset.field;
      const isContext = actionEl.dataset.isContext === 'true';
      markVariableUnknown(state, fieldId, { isContext });
      recomputeStratification(state);
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
      recomputeStratification(state);
      render();
      break;
    }
    case 'open-reset':
      activeModal = 'reset';
      renderModal();
      break;
    case 'confirm-reset':
      state = createInitialState();
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
        state = restoreStateFromCase(found);
        activeModal = null;
        render();
      }
      break;
    }
    case 'delete-case': {
      const id = Number(actionEl.dataset.caseId);
      deleteCaseFromLibrary(id);
      renderModal();
      break;
    }
    case 'save-case': {
      const input = document.getElementById('case-name-input');
      const name = input && input.value.trim();
      if (!name) {
        alert('Introduce un nombre para el caso.');
        return;
      }
      saveCaseToLibrary(state, name);
      showToast('✓ Caso guardado (solo datos estructurados, sin texto de la HCE).');
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
        alert('Describe la intervención antes de añadirla.');
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
        notes: ''
      });
      activeModal = null;
      render();
      break;
    }
    case 'copy-report':
      copyToClipboard(buildClinicalReport(state)).then(() => showToast('✓ Informe copiado al portapapeles.'));
      break;
    case 'download-report':
      downloadTextFile(reportFileName(state, 'txt'), buildClinicalReport(state));
      break;
    case 'print-report':
      window.print();
      break;
    case 'copy-hce':
      copyToClipboard(buildHceSummary(state)).then(() => showToast('✓ Resumen para la historia clínica copiado.'));
      break;
    case 'copy-extraction-report':
      copyToClipboard(buildExtractionReport(state)).then(() => showToast('✓ Informe de extracción copiado.'));
      break;
    default:
      break;
  }
});

function pickExampleCase() {
  const keys = Object.keys(EXAMPLE_CASES);
  const menu = keys.map((k, i) => `${i + 1}. ${k}`).join('\n');
  const choice = prompt(`Elige un caso de ejemplo (escribe el número):\n${menu}`, '1');
  const idx = Number(choice) - 1;
  if (idx >= 0 && idx < keys.length) {
    state.narrativeText = EXAMPLE_CASES[keys[idx]];
    render();
  }
}

// -------------------------------------------------- Inputs sin re-render --
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.contextField) {
    state.context[t.dataset.contextField] = t.value;
    return;
  }
  if (t.id === 'narrative-text') {
    state.narrativeText = t.value;
    const meta = t.parentElement.querySelector('.textarea-meta__actions .btn--primary');
    const counter = t.parentElement.querySelector('.textarea-meta span');
    if (counter) counter.textContent = `${t.value.length.toLocaleString('es-ES')} caracteres`;
    if (meta) meta.disabled = !t.value.trim();
    return;
  }
  if (t.dataset.ivField) {
    const iv = state.selectedInterventions.find((i) => i.localId === t.dataset.localId);
    if (iv) iv[t.dataset.ivField] = t.value;
    return;
  }
  if (t.id === 'report-observations') {
    state.reportObservations = t.value;
    const pre = document.getElementById('clinical-report-pre');
    if (pre) pre.textContent = buildClinicalReport(state);
    return;
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.ivField) {
    const iv = state.selectedInterventions.find((i) => i.localId === t.dataset.localId);
    if (iv) iv[t.dataset.ivField] = t.value;
  }
});

render();
