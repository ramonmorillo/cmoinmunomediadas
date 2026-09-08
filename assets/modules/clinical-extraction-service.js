// Capa de extracción clínica. Punto único de entrada:
//
//   extractClinicalVariables(text, { clinicalFields, contextFields }) -> ExtractionResult
//
// Diseño (encargo, punto 22 "ARQUITECTURA DE IA"):
// - Nunca contiene ni transmite una clave de API de un proveedor de IA.
// - Intenta un endpoint configurable (pensado para una función serverless
//   desplegada por el propio hospital/farmacéutico, que reenvíe la petición
//   al proveedor de IA que decida, con su clave del lado servidor). Esta
//   capa no sabe ni necesita saber qué proveedor es.
// - Si no hay endpoint configurado, o la petición falla, cae a un
//   MODO DEMOSTRACIÓN heurístico local, explícitamente etiquetado como tal
//   (heuristic-extraction.js) — nunca se presenta como si fuera un resultado
//   de IA real.
// - Nunca bloquea la herramienta: cualquier fallo devuelve un resultado con
//   ok:false y un mensaje claro; la estratificación manual sigue disponible.

import { heuristicExtractClinicalFields, heuristicExtractContext } from './heuristic-extraction.js';

const REQUIRED_RESULT_KEYS = ['variable', 'value', 'status', 'confidence', 'evidence', 'reasoning_summary'];
const VALID_STATUSES = ['found', 'uncertain', 'not_found', 'contradictory'];

function getConfiguredEndpoint() {
  if (typeof window === 'undefined') return null;
  const cfg = window.CMO_APP_CONFIG;
  return (cfg && typeof cfg.extractionEndpointUrl === 'string' && cfg.extractionEndpointUrl.trim()) || null;
}

export function isAiExtractionConfigured() {
  return Boolean(getConfiguredEndpoint());
}

// Construye el payload que se enviaría a un backend de extracción real.
// Documentado en AI_POLICY.md. El backend debe reenviar `instructions` +
// `variables` + `clinicalText` al proveedor de IA que utilice, y devolver
// exclusivamente un array `results` con la forma descrita en `instructions`.
export function buildExtractionRequestPayload(text, fieldDefinitions) {
  return {
    clinicalText: text,
    variables: fieldDefinitions.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      definition: f.definition,
      criteria: f.criteria,
      allowedValues: (f.options || []).map((o) => o.value)
    })),
    instructions: EXTRACTION_INSTRUCTIONS
  };
}

export const EXTRACTION_INSTRUCTIONS = `Eres un asistente de extracción de información clínica para farmacia hospitalaria.
Para cada variable de la lista "variables", analiza EXCLUSIVAMENTE el texto de "clinicalText" y determina su valor.

REGLA FUNDAMENTAL — ausencia de información NO es una respuesta negativa:
si el texto no menciona nada relacionado con una variable, su estado debe ser "not_found" y su valor null.
Nunca conviertas silencio en "no". Nunca asumas datos no presentes en el texto.

Para cada variable, devuelve un objeto con exactamente estos campos:
{
  "variable": "<id de la variable>",
  "value": "<uno de los valores permitidos, o null>",
  "status": "found" | "uncertain" | "not_found" | "contradictory",
  "confidence": <número entre 0 y 1>,
  "evidence": "<fragmento textual breve y literal del texto que justifica el valor, o cadena vacía si no hay>",
  "reasoning_summary": "<explicación breve y verificable, una frase>",
  "needs_human_confirmation": true
}

Usa "found" solo si hay una mención clara y explícita. Usa "uncertain" si la mención es ambigua o usa
lenguaje dubitativo. Usa "contradictory" si hay menciones que se contradicen entre sí. Usa "not_found"
si no hay ninguna mención relacionada. "needs_human_confirmation" debe ser siempre true: ningún valor se da
por confirmado automáticamente. Responde ÚNICAMENTE con un JSON: un array de estos objetos, uno por variable,
sin texto adicional ni markdown.`;

function coerceResult(raw, fallbackFieldId) {
  const variable = (raw && raw.variable) || fallbackFieldId;
  if (!raw || typeof raw !== 'object') {
    return malformedResult(variable);
  }
  const status = VALID_STATUSES.includes(raw.status) ? raw.status : 'uncertain';
  const confidence = Number.isFinite(Number(raw.confidence)) ? Math.max(0, Math.min(1, Number(raw.confidence))) : 0.3;
  return {
    variable,
    value: status === 'not_found' ? null : raw.value ?? null,
    status,
    confidence,
    evidence: typeof raw.evidence === 'string' ? raw.evidence : '',
    reasoning_summary: typeof raw.reasoning_summary === 'string' ? raw.reasoning_summary : 'Sin justificación proporcionada por el servicio de IA.',
    needs_human_confirmation: true,
    origin: 'ai'
  };
}

function malformedResult(variable) {
  return {
    variable,
    value: null,
    status: 'uncertain',
    confidence: 0,
    evidence: '',
    reasoning_summary: 'Respuesta del servicio de IA con formato inesperado para esta variable; requiere revisión manual.',
    needs_human_confirmation: true,
    origin: 'ai'
  };
}

function normalizeAiResults(data, allFieldIds) {
  const list = Array.isArray(data) ? data : Array.isArray(data && data.results) ? data.results : null;
  if (!list) return allFieldIds.map((id) => malformedResult(id));
  const byId = new Map();
  list.forEach((item) => {
    if (item && typeof item.variable === 'string') byId.set(item.variable, item);
  });
  return allFieldIds.map((id) => coerceResult(byId.get(id), id));
}

function tagOrigin(results) {
  return results.map((r) => ({ ...r, needs_human_confirmation: true, origin: r.origin || 'ai_demo' }));
}

/**
 * @param {string} text  Texto de historia clínica pegado por el farmacéutico
 * @param {{clinicalFields: Array, contextFields: Array}} fieldSets
 * @param {{endpointUrl?: string}} [opts]
 */
export async function extractClinicalVariables(text, fieldSets, opts = {}) {
  const generatedAt = new Date().toISOString();
  const clinicalFields = fieldSets.clinicalFields || [];
  const contextFields = fieldSets.contextFields || [];
  const allFields = [...contextFields, ...clinicalFields];
  const endpoint = opts.endpointUrl || getConfiguredEndpoint();

  if (!endpoint) {
    const clinicalResults = heuristicExtractClinicalFields(text, clinicalFields);
    const contextMap = heuristicExtractContext(text);
    const contextResults = contextFields.map((f) => contextMap[f.id]).filter(Boolean);
    return {
      mode: 'demo',
      ok: true,
      generatedAt,
      endpoint: null,
      message: 'Modo demostración: búsqueda heurística de palabras clave local, no es una llamada real a un modelo de IA. Configure window.CMO_APP_CONFIG.extractionEndpointUrl para usar un servicio de IA real.',
      results: tagOrigin([...contextResults, ...clinicalResults])
    };
  }

  try {
    const payload = buildExtractionRequestPayload(text, allFields);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`El servicio de extracción respondió con estado ${response.status}`);
    }
    const data = await response.json();
    const results = normalizeAiResults(data, allFields.map((f) => f.id)).map((r) => ({ ...r, needs_human_confirmation: true, origin: 'ai' }));
    return { mode: 'ai', ok: true, generatedAt, endpoint, message: null, results };
  } catch (err) {
    return {
      mode: 'error',
      ok: false,
      generatedAt,
      endpoint,
      message: 'No ha sido posible realizar la extracción automática. Puede continuar la estratificación manualmente.',
      errorDetail: err && err.message ? err.message : String(err),
      results: []
    };
  }
}

export function validateResultShape(result) {
  return REQUIRED_RESULT_KEYS.every((key) => key in result);
}
