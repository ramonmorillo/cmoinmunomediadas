// Traduce variables clínicas CONFIRMADAS en necesidades agrupadas según la
// filosofía CMO (Capacidad · Motivación · Oportunidad). Cada necesidad
// declara qué variables la originan, para mantener la trazabilidad
// dato -> necesidad que pide el encargo (sección 12).
//
// Esto es una capa de AYUDA interpretativa, no clínica automática: el
// farmacéutico decide qué necesidades son realmente relevantes para el
// plan de atención farmacéutica (ver interventions-catalog.js).

import { getFieldDefinition } from './config.js';

export const NEEDS_CATALOG = [
  {
    id: 'cap-manejo-regimen',
    dimension: 'capacidad',
    title: 'Dificultad potencial para el manejo del régimen terapéutico',
    triggerFieldIds: ['polimedicacion', 'naive_terapia', 'deterioro_cognitivo_funcional']
  },
  {
    id: 'cap-limitacion-funcional',
    dimension: 'capacidad',
    title: 'Limitación funcional o cognitiva que puede dificultar el autocuidado',
    triggerFieldIds: ['deterioro_cognitivo_funcional', 'discapacidad_funcional']
  },
  {
    id: 'cap-habitos',
    dimension: 'capacidad',
    title: 'Hábitos con impacto potencial en la respuesta al tratamiento',
    triggerFieldIds: ['alcoholismo_drogas', 'tabaquismo']
  },
  {
    id: 'cap-actividad-no-controlada',
    dimension: 'capacidad',
    title: 'Actividad de la enfermedad no controlada o reacciones adversas recientes',
    triggerFieldIds: ['actividad_enfermedad', 'reacciones_adversas', 'dolor_presente']
  },
  {
    id: 'mot-adherencia',
    dimension: 'motivacion',
    title: 'Riesgo de falta de adherencia al tratamiento',
    triggerFieldIds: ['falta_adherencia']
  },
  {
    id: 'mot-calidad-vida',
    dimension: 'motivacion',
    title: 'Calidad de vida relacionada con la salud disminuida',
    triggerFieldIds: ['calidad_vida_baja']
  },
  {
    id: 'mot-psicologico',
    dimension: 'motivacion',
    title: 'Problemas psicológicos que pueden condicionar la motivación terapéutica',
    triggerFieldIds: ['problemas_psicologicos']
  },
  {
    id: 'opo-comunicacion',
    dimension: 'oportunidad',
    title: 'Barreras de comunicación o comprensión',
    triggerFieldIds: ['barreras_comunicacion']
  },
  {
    id: 'opo-soporte-social',
    dimension: 'oportunidad',
    title: 'Ausencia de soporte social o familiar',
    triggerFieldIds: ['sin_soporte_social']
  },
  {
    id: 'opo-conciliacion-laboral',
    dimension: 'oportunidad',
    title: 'Dificultad de conciliación laboral con el seguimiento farmacoterapéutico',
    triggerFieldIds: ['situacion_laboral_dificil']
  },
  {
    id: 'opo-coordinacion-asistencial',
    dimension: 'oportunidad',
    title: 'Complejidad de coordinación asistencial',
    triggerFieldIds: ['multidisciplinariedad', 'hospitalizaciones_urgencias']
  },
  {
    id: 'opo-seguridad-medicamento',
    dimension: 'oportunidad',
    title: 'Riesgo relacionado con la seguridad del medicamento',
    triggerFieldIds: ['medicamento_alto_riesgo', 'interacciones', 'medicamento_reciente']
  },
  {
    id: 'opo-comorbilidad-compleja',
    dimension: 'oportunidad',
    title: 'Comorbilidad clínica o complicaciones asociadas a la enfermedad de base',
    triggerFieldIds: [
      'comorbilidades_2mas',
      'insuficiencia_renal_hepatica',
      'comorbilidades_cv_diabetes',
      'complicaciones_intestinales',
      'problemas_nutricionales'
    ]
  },
  {
    id: 'opo-cambio-tratamiento',
    dimension: 'oportunidad',
    title: 'Cambio reciente de tratamiento que requiere seguimiento estrecho',
    triggerFieldIds: ['modificacion_regimen']
  },
  {
    id: 'opo-embarazo',
    dimension: 'oportunidad',
    title: 'Necesidad de coordinación con Ginecología / planificación familiar',
    triggerFieldIds: ['embarazada', 'deseo_embarazo']
  }
];

function isPositive(fieldId, value) {
  if (value === undefined || value === null || value === '') return false;
  const field = getFieldDefinition(fieldId);
  if (!field) return false;
  const option = (field.options || []).find((o) => o.value === value);
  return Boolean(option && typeof option.weight === 'number' && option.weight > 0);
}

/**
 * @param {Record<string,string>} confirmedValues
 * @returns {{capacidad: Array, motivacion: Array, oportunidad: Array, all: Array}}
 */
export function computeNeeds(confirmedValues) {
  const grouped = { capacidad: [], motivacion: [], oportunidad: [] };
  const all = [];

  NEEDS_CATALOG.forEach((need) => {
    const linkedVariables = need.triggerFieldIds
      .filter((fid) => isPositive(fid, confirmedValues[fid]))
      .map((fid) => {
        const field = getFieldDefinition(fid);
        return { id: fid, label: field ? field.label : fid, value: confirmedValues[fid] };
      });

    if (linkedVariables.length === 0) return;

    const entry = { ...need, linkedVariables };
    grouped[need.dimension].push(entry);
    all.push(entry);
  });

  return { ...grouped, all };
}
