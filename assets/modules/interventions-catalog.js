// Catálogo de intervenciones farmacéuticas seleccionables. El contenido
// reutiliza íntegramente los textos ya validados del Plan de Atención
// Farmacéutica del Modelo CMO-MAPEX (SEFH) presentes en la herramienta
// original (ver ANALYSIS.md), reorganizados como tarjetas independientes en
// lugar de bloques de texto fijo por nivel. La clasificación por
// disponibilidad (básica/avanzada/dependiente del centro) y la vinculación a
// necesidades CMO es una propuesta editable: el farmacéutico decide qué
// intervenciones ejecuta realmente.
//
// tier: 'basica' | 'avanzada' | 'centro'
// recommendedLevels: niveles de prioridad (1|2|3) para los que el modelo
//   original la recomendaba explícitamente.

export const AVAILABILITY_TIERS = {
  basica: { label: 'Básica', description: 'Disponible prácticamente en cualquier consulta de farmacia hospitalaria.' },
  avanzada: { label: 'Avanzada', description: 'Requiere recursos, tiempo o herramientas adicionales.' },
  centro: { label: 'Dependiente del centro', description: 'Depende de programas, profesionales o infraestructura específicos del centro.' }
};

export const INTERVENTIONS_CATALOG = [
  {
    id: 'seg-revision-conciliacion',
    category: 'seguimiento',
    dimension: 'capacidad',
    tier: 'basica',
    text: 'Revisión, validación y conciliación del tratamiento completo (EI + concomitante)',
    recommendedLevels: [1, 2, 3],
    linkedNeedIds: ['cap-manejo-regimen', 'opo-seguridad-medicamento']
  },
  {
    id: 'seg-control-adherencia',
    category: 'seguimiento',
    dimension: 'motivacion',
    tier: 'basica',
    text: 'Control de adherencia y desarrollo de intervenciones específicas',
    recommendedLevels: [1, 2, 3],
    linkedNeedIds: ['mot-adherencia']
  },
  {
    id: 'seg-adaptado-necesidades',
    category: 'seguimiento',
    dimension: 'oportunidad',
    tier: 'basica',
    text: 'Seguimiento adaptado a las necesidades individuales del paciente',
    recommendedLevels: [1, 2, 3],
    linkedNeedIds: []
  },
  {
    id: 'seg-coordinacion-siguiente-visita',
    category: 'seguimiento',
    dimension: 'oportunidad',
    tier: 'basica',
    text: 'Coordinación de la siguiente visita con el médico y el departamento de citaciones',
    recommendedLevels: [1, 2, 3],
    linkedNeedIds: ['opo-coordinacion-asistencial']
  },
  {
    id: 'seg-plan-accion-ram',
    category: 'seguimiento',
    dimension: 'oportunidad',
    tier: 'avanzada',
    text: 'Plan de acción entre niveles asistenciales para reacciones adversas, con vías rápidas de comunicación permanente',
    recommendedLevels: [1],
    linkedNeedIds: ['cap-actividad-no-controlada', 'opo-seguridad-medicamento']
  },
  {
    id: 'seg-objetivos-corto-plazo',
    category: 'seguimiento',
    dimension: 'oportunidad',
    tier: 'basica',
    text: 'Establecer objetivos a corto plazo según el Modelo CMO en consultas externas',
    recommendedLevels: [1],
    linkedNeedIds: []
  },
  {
    id: 'edu-promocion-adherencia',
    category: 'educacion',
    dimension: 'motivacion',
    tier: 'basica',
    text: 'Promoción activa de la adherencia',
    recommendedLevels: [1, 2, 3],
    linkedNeedIds: ['mot-adherencia']
  },
  {
    id: 'edu-informacion-enfermedad',
    category: 'educacion',
    dimension: 'capacidad',
    tier: 'basica',
    text: 'Información sobre la enfermedad y el tratamiento (posología, conservación) y prevención de reacciones adversas',
    recommendedLevels: [1, 2, 3],
    linkedNeedIds: ['cap-manejo-regimen', 'cap-actividad-no-controlada']
  },
  {
    id: 'edu-material-personalizado',
    category: 'educacion',
    dimension: 'capacidad',
    tier: 'basica',
    text: 'Material personalizado (hoja de medicación)',
    recommendedLevels: [1, 2],
    linkedNeedIds: ['cap-manejo-regimen', 'opo-comunicacion']
  },
  {
    id: 'edu-habitos-vida-saludable',
    category: 'educacion',
    dimension: 'capacidad',
    tier: 'basica',
    text: 'Educación sobre hábitos de vida saludable',
    recommendedLevels: [1, 2, 3],
    linkedNeedIds: ['cap-habitos']
  },
  {
    id: 'edu-paciente-activo',
    category: 'educacion',
    dimension: 'motivacion',
    tier: 'basica',
    text: 'Fomento de un paciente activo e informado que se corresponsabilice de su tratamiento',
    recommendedLevels: [1, 2, 3],
    linkedNeedIds: ['mot-psicologico', 'mot-calidad-vida']
  },
  {
    id: 'edu-recursos-digitales',
    category: 'educacion',
    dimension: 'oportunidad',
    tier: 'avanzada',
    text: 'Recursos web y aplicaciones informativas',
    recommendedLevels: [1, 2, 3],
    linkedNeedIds: ['opo-comunicacion']
  },
  {
    id: 'coord-unificacion-criterios',
    category: 'coordinacion',
    dimension: 'oportunidad',
    tier: 'avanzada',
    text: 'Unificación de criterios entre profesionales (médico, enfermería) y niveles asistenciales (especializada, primaria, oficina de farmacia)',
    recommendedLevels: [1, 2],
    linkedNeedIds: ['opo-coordinacion-asistencial']
  },
  {
    id: 'coord-programa-agentes',
    category: 'coordinacion',
    dimension: 'oportunidad',
    tier: 'avanzada',
    text: 'Programa de actuación con todos los agentes implicados',
    recommendedLevels: [1, 2],
    linkedNeedIds: ['opo-coordinacion-asistencial']
  },
  {
    id: 'coord-actuaciones-consensuadas',
    category: 'coordinacion',
    dimension: 'oportunidad',
    tier: 'avanzada',
    text: 'Definición de actuaciones consensuadas específicas para el paciente entre profesionales (registradas en la historia clínica)',
    recommendedLevels: [1, 2],
    linkedNeedIds: ['opo-coordinacion-asistencial']
  },
  {
    id: 'coord-comites-biologicos',
    category: 'coordinacion',
    dimension: 'oportunidad',
    tier: 'centro',
    text: 'Participación en comités de biológicos',
    recommendedLevels: [1, 2, 3],
    linkedNeedIds: ['opo-seguridad-medicamento']
  },
  {
    id: 'coord-servicios-sociales-psicologia',
    category: 'coordinacion',
    dimension: 'oportunidad',
    tier: 'centro',
    text: 'Coordinación con Servicios Sociales o Psicología/Psiquiatría',
    recommendedLevels: [1, 2],
    linkedNeedIds: ['opo-soporte-social', 'mot-psicologico']
  },
  {
    id: 'coord-asociaciones-pacientes',
    category: 'coordinacion',
    dimension: 'oportunidad',
    tier: 'centro',
    text: 'Colaboración con asociaciones de pacientes',
    recommendedLevels: [1, 2, 3],
    linkedNeedIds: ['opo-soporte-social']
  },
  {
    id: 'coord-programas-objetivos-farmacoterapeuticos',
    category: 'coordinacion',
    dimension: 'oportunidad',
    tier: 'avanzada',
    text: 'Desarrollo de programas orientados a objetivos farmacoterapéuticos',
    recommendedLevels: [1, 2, 3],
    linkedNeedIds: ['cap-manejo-regimen']
  },
  {
    id: 'coord-reuniones-especialidades',
    category: 'coordinacion',
    dimension: 'oportunidad',
    tier: 'centro',
    text: 'Reuniones periódicas con Reumatología/Dermatología/Digestivo para coordinación sobre indicadores de eficacia y adherencia',
    recommendedLevels: [1],
    linkedNeedIds: ['opo-coordinacion-asistencial']
  }
];

export const CATEGORY_LABELS = {
  seguimiento: 'Seguimiento farmacoterapéutico',
  educacion: 'Educación y formación',
  coordinacion: 'Coordinación asistencial'
};

export function recommendedInterventionIds(level) {
  return INTERVENTIONS_CATALOG.filter((i) => i.recommendedLevels.includes(level)).map((i) => i.id);
}

export function interventionsForNeed(needId) {
  return INTERVENTIONS_CATALOG.filter((i) => i.linkedNeedIds.includes(needId));
}

export function getIntervention(id) {
  return INTERVENTIONS_CATALOG.find((i) => i.id === id) || null;
}
