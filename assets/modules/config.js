// Fuente de verdad del modelo clínico CMO-MAPEX (SEFH 2018) para enfermedades
// inflamatorias inmunomediadas (EII). Ningún otro módulo debe contener pesos,
// umbrales ni reglas clínicas hardcodeadas: todos deben leerlos de aquí.
//
// Ver ANALYSIS.md para la trazabilidad de estas cifras respecto a la
// herramienta original. No modificar variables, pesos, bloques ni umbrales
// sin una razón clínica documentada.

export const APP_VERSION = 'CMO Inmunomediadas v1 · Septiembre 2026';
export const STORAGE_KEY = 'cmo-inmunomediadas-v1-state';
export const CASE_LIBRARY_KEY = 'cmo-inmunomediadas-v1-casos';

export const DISEASE_TYPES = [
  {
    id: 'dermatologica',
    label: 'Dermatológica',
    hint: 'Psoriasis, dermatitis atópica, hidradenitis supurativa…'
  },
  {
    id: 'musculo-esqueletica',
    label: 'Músculo-esquelética',
    hint: 'Artritis reumatoide, espondiloartritis, artritis psoriásica…'
  },
  {
    id: 'gastro-intestinal',
    label: 'Gastro-intestinal',
    hint: 'Enfermedad de Crohn, colitis ulcerosa…'
  }
];

export const BLOCKS = [
  { id: 'demografica', label: 'Variables demográficas', maxPoints: 9 },
  { id: 'sociosanitaria', label: 'Variables sociosanitarias', maxPoints: 21 },
  { id: 'clinica', label: 'Variables clínicas', maxPoints: 14 },
  { id: 'farmacoterapeutica', label: 'Variables farmacoterapéuticas', maxPoints: 25 },
  { id: 'especifica', label: 'Variables específicas según tipo de EI', maxPoints: 2 }
];

// Bandas de edad (bloque demográfico). edad_grupo se deriva automáticamente
// del campo contextual "edad" introducido en el paso 1 — no se pide como
// variable de extracción independiente.
export const AGE_GROUPS = [
  { value: '≤12', label: '≤ 12 años', weight: 1, min: 0, max: 12 },
  { value: '13-17', label: '13-17 años', weight: 3, min: 13, max: 17 },
  { value: '18-69', label: '18-69 años', weight: 2, min: 18, max: 69 },
  { value: '≥70', label: '≥ 70 años', weight: 2, min: 70, max: 200 }
];

export function ageToGroup(age) {
  const n = Number(age);
  if (!Number.isFinite(n) || n < 0) return '';
  const found = AGE_GROUPS.find((g) => n >= g.min && n <= g.max);
  return found ? found.value : '';
}

function booleanOptions(weightYes) {
  return [
    { value: 'no', label: 'No', weight: 0 },
    { value: 'si', label: 'Sí', weight: weightYes }
  ];
}

// Cada entrada es una variable clínica del modelo. `appliesTo` = 'all' o un
// array con los tipoEI para los que aplica (bloque específico).
// `extractable` indica si se ofrece a la extracción por IA (todas lo son,
// salvo edad_grupo que es derivada).
export const FIELD_DEFINITIONS = [
  // ---- Bloque 1: Demográficas (máx. 9) ----
  {
    id: 'sexo_mujer',
    block: 'demografica',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Sexo femenino',
    definition: 'El paciente es de sexo femenino.',
    criteria: 'Marcar "Sí" solo si consta explícitamente en el texto que el paciente es mujer.',
    options: booleanOptions(1)
  },
  {
    id: 'peso_obesidad',
    block: 'demografica',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Obesidad (IMC ≥30 kg/m²)',
    definition: 'El paciente presenta obesidad, con un IMC igual o superior a 30 kg/m².',
    criteria: 'Marcar "Sí" solo si el IMC ≥30 consta explícitamente, o si el texto menciona "obesidad" de forma expresa.',
    options: booleanOptions(2)
  },
  {
    id: 'embarazada',
    block: 'demografica',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Embarazada',
    definition: 'La paciente está embarazada en el momento de la evaluación.',
    criteria: 'Marcar "Sí" solo si el embarazo consta explícitamente.',
    options: booleanOptions(3),
    specialRule: 'pregnancy_trigger'
  },
  {
    id: 'deseo_embarazo',
    block: 'demografica',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Deseo gestacional',
    definition: 'La paciente expresa deseo de quedarse embarazada próximamente.',
    criteria: 'Marcar "Sí" solo si el deseo gestacional consta explícitamente referido por la paciente o el equipo clínico.',
    options: booleanOptions(2),
    specialRule: 'pregnancy_trigger'
  },

  // ---- Bloque 2: Sociosanitarias (máx. 21) ----
  {
    id: 'alcoholismo_drogas',
    block: 'sociosanitaria',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Alcoholismo y/o drogadicción',
    definition: 'Consumo problemático de alcohol y/o de otras sustancias.',
    criteria: 'Marcar "Sí" solo si hay mención explícita de consumo de riesgo, abuso o dependencia de alcohol u otras drogas.',
    options: booleanOptions(3),
    cmoDimension: 'capacidad'
  },
  {
    id: 'tabaquismo',
    block: 'sociosanitaria',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Tabaquismo',
    definition: 'El paciente es fumador activo.',
    criteria: 'Marcar "Sí" solo si consta consumo activo de tabaco.',
    options: booleanOptions(2),
    cmoDimension: 'capacidad'
  },
  {
    id: 'barreras_comunicacion',
    block: 'sociosanitaria',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Barreras de comunicación',
    definition: 'Barreras idiomáticas, culturales o cognitivas que dificultan la comunicación clínica.',
    criteria: 'Marcar "Sí" solo si el texto menciona explícitamente dificultades de idioma, comprensión o comunicación.',
    options: booleanOptions(3),
    cmoDimension: 'oportunidad'
  },
  {
    id: 'sin_soporte_social',
    block: 'sociosanitaria',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Sin soporte social/familiar',
    definition: 'Ausencia de red de apoyo social o familiar.',
    criteria: 'Marcar "Sí" solo si consta explícitamente que el paciente vive solo sin apoyo, o carece de soporte familiar/social.',
    options: booleanOptions(3),
    cmoDimension: 'oportunidad'
  },
  {
    id: 'situacion_laboral_dificil',
    block: 'sociosanitaria',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Actividad laboral dificulta el cumplimiento',
    definition: 'La situación laboral del paciente dificulta el cumplimiento del tratamiento o el seguimiento.',
    criteria: 'Marcar "Sí" solo si se menciona explícitamente incompatibilidad horaria/laboral con el tratamiento o las visitas.',
    options: booleanOptions(2),
    cmoDimension: 'oportunidad'
  },
  {
    id: 'calidad_vida_baja',
    block: 'sociosanitaria',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Calidad de vida disminuida',
    definition: 'Calidad de vida relacionada con la salud disminuida (p. ej. escalas DLQI, SIBDQ, AIMS).',
    criteria: 'Marcar "Sí" solo si consta una puntuación de escala de calidad de vida alterada, o una afirmación explícita de calidad de vida disminuida.',
    options: booleanOptions(3),
    cmoDimension: 'motivacion'
  },
  {
    id: 'problemas_psicologicos',
    block: 'sociosanitaria',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Problemas psicológicos/psiquiátricos',
    definition: 'Ansiedad, depresión u otro problema psiquiátrico relevante.',
    criteria: 'Marcar "Sí" solo si hay diagnóstico, tratamiento o mención clínica explícita de ansiedad, depresión u otro trastorno psiquiátrico.',
    options: booleanOptions(3),
    cmoDimension: 'motivacion'
  },
  {
    id: 'deterioro_cognitivo_funcional',
    block: 'sociosanitaria',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Deterioro cognitivo o dependencia funcional',
    definition: 'Deterioro cognitivo o dependencia funcional relevante (p. ej. Pfeiffer, Katz).',
    criteria: 'Marcar "Sí" solo si consta una prueba/escala alterada o una mención clínica explícita de deterioro cognitivo o dependencia para actividades básicas.',
    options: booleanOptions(2),
    cmoDimension: 'capacidad'
  },

  // ---- Bloque 3: Clínicas (máx. 14) ----
  {
    id: 'comorbilidades_2mas',
    block: 'clinica',
    type: 'boolean',
    appliesTo: 'all',
    label: '≥2 enfermedades crónicas complejas',
    definition: 'El paciente presenta dos o más enfermedades crónicas complejas además de la EI.',
    criteria: 'Marcar "Sí" solo si se listan explícitamente 2 o más comorbilidades crónicas relevantes.',
    options: booleanOptions(2),
    cmoDimension: 'oportunidad'
  },
  {
    id: 'insuficiencia_renal_hepatica',
    block: 'clinica',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Insuficiencia renal o hepática',
    definition: 'Insuficiencia renal o hepática diagnosticada.',
    criteria: 'Marcar "Sí" solo si consta el diagnóstico explícito o datos analíticos compatibles claramente descritos como insuficiencia renal/hepática.',
    options: booleanOptions(3),
    cmoDimension: 'oportunidad'
  },
  {
    id: 'multidisciplinariedad',
    block: 'clinica',
    type: 'boolean',
    appliesTo: 'all',
    label: '≥2 especialistas por órganos afectados',
    definition: 'El paciente es seguido por dos o más especialistas debido a afectación de distintos órganos.',
    criteria: 'Marcar "Sí" solo si se mencionan explícitamente ≥2 especialidades médicas implicadas en el seguimiento.',
    options: booleanOptions(3),
    cmoDimension: 'oportunidad'
  },
  {
    id: 'hospitalizaciones_urgencias',
    block: 'clinica',
    type: 'boolean',
    appliesTo: 'all',
    label: '≥1 ingreso/urgencias en los últimos 2 meses',
    definition: 'Al menos un ingreso hospitalario o visita a urgencias en los últimos 2 meses.',
    criteria: 'Marcar "Sí" solo si consta explícitamente un ingreso o visita a urgencias con fecha compatible con los últimos 2 meses.',
    options: booleanOptions(3),
    cmoDimension: 'oportunidad'
  },
  {
    id: 'actividad_enfermedad',
    block: 'clinica',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Actividad moderada/alta de la enfermedad',
    definition: 'La enfermedad inmunomediada de base presenta actividad moderada o alta (índices de actividad, brote clínico).',
    criteria: 'Marcar "Sí" solo si consta un índice de actividad compatible con actividad moderada/alta, o una descripción clínica explícita de brote/actividad no controlada.',
    options: booleanOptions(3),
    cmoDimension: 'capacidad'
  },

  // ---- Bloque 4: Farmacoterapéuticas (máx. 25) ----
  {
    id: 'naive_terapia',
    block: 'farmacoterapeutica',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Naïve a terapia hospitalaria',
    definition: 'El paciente inicia por primera vez un tratamiento de dispensación hospitalaria para la EI.',
    criteria: 'Marcar "Sí" solo si el texto indica explícitamente que es la primera vez que recibe este tipo de tratamiento.',
    options: booleanOptions(4),
    cmoDimension: 'capacidad'
  },
  {
    id: 'polimedicacion',
    block: 'farmacoterapeutica',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Polimedicación (≥6 medicamentos)',
    definition: 'El paciente toma 6 o más medicamentos de forma simultánea.',
    criteria: 'Marcar "Sí" solo si se puede contar o se menciona explícitamente un número de medicamentos ≥6.',
    options: booleanOptions(3),
    cmoDimension: 'capacidad'
  },
  {
    id: 'modificacion_regimen',
    block: 'farmacoterapeutica',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Modificación del tratamiento en los últimos 6 meses',
    definition: 'El régimen terapéutico se ha modificado en los últimos 6 meses.',
    criteria: 'Marcar "Sí" solo si consta explícitamente un cambio de tratamiento con fecha compatible con los últimos 6 meses.',
    options: booleanOptions(3),
    cmoDimension: 'oportunidad'
  },
  {
    id: 'medicamento_alto_riesgo',
    block: 'farmacoterapeutica',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Medicamento de alto riesgo (ISMP)',
    definition: 'El tratamiento incluye un medicamento considerado de alto riesgo según ISMP.',
    criteria: 'Marcar "Sí" solo si el medicamento descrito corresponde a la lista de alto riesgo ISMP o se menciona explícitamente como tal.',
    options: booleanOptions(3),
    cmoDimension: 'oportunidad'
  },
  {
    id: 'interacciones',
    block: 'farmacoterapeutica',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Riesgo de interacción clínicamente relevante',
    definition: 'Existe riesgo de interacción farmacológica clínicamente relevante.',
    criteria: 'Marcar "Sí" solo si el texto menciona explícitamente una interacción, o si la combinación de fármacos descrita es una interacción clínicamente relevante conocida y evidente.',
    options: booleanOptions(3),
    cmoDimension: 'oportunidad'
  },
  {
    id: 'reacciones_adversas',
    block: 'farmacoterapeutica',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Reacciones adversas en el último año',
    definition: 'El paciente ha presentado alguna reacción adversa a la medicación en el último año.',
    criteria: 'Marcar "Sí" solo si consta explícitamente una reacción adversa con fecha compatible con el último año.',
    options: booleanOptions(3),
    cmoDimension: 'capacidad'
  },
  {
    id: 'falta_adherencia',
    block: 'farmacoterapeutica',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Falta de adherencia',
    definition: 'El paciente presenta falta de adherencia al tratamiento.',
    criteria: 'Marcar "Sí" solo si hay una afirmación explícita de dosis olvidadas, incumplimiento, o una medida objetiva de baja adherencia. La ausencia de información sobre adherencia NO equivale a buena adherencia ni a mala adherencia: en ese caso debe quedar "no consta información suficiente".',
    options: booleanOptions(4),
    cmoDimension: 'motivacion'
  },
  {
    id: 'medicamento_reciente',
    block: 'farmacoterapeutica',
    type: 'boolean',
    appliesTo: 'all',
    label: 'Medicamento comercializado hace menos de 1 año',
    definition: 'El tratamiento incluye un medicamento comercializado hace menos de un año.',
    criteria: 'Marcar "Sí" solo si consta explícitamente que el medicamento es de comercialización reciente (<1 año).',
    options: booleanOptions(2),
    cmoDimension: 'oportunidad'
  },

  // ---- Bloque 5: Específicas — Dermatológica (máx. 2) ----
  {
    id: 'comorbilidades_cv_diabetes',
    block: 'especifica',
    type: 'select',
    appliesTo: ['dermatologica'],
    label: 'Comorbilidades cardiovasculares / síndrome metabólico / diabetes',
    definition: 'Número de comorbilidades cardiovasculares, de síndrome metabólico o diabetes asociadas.',
    criteria: 'Seleccionar "una" o "más de una" solo si constan explícitamente diagnosticadas; si no hay mención, dejar sin determinar (no asumir ausencia).',
    options: [
      { value: 'ninguna', label: 'Sin estas comorbilidades', weight: 0 },
      { value: 'una', label: 'Tiene una', weight: 1 },
      { value: 'mas-una', label: 'Tiene más de una', weight: 2 }
    ]
  },

  // ---- Bloque 5: Específicas — Músculo-esquelética (máx. 2) ----
  {
    id: 'discapacidad_funcional',
    block: 'especifica',
    type: 'boolean',
    appliesTo: ['musculo-esqueletica'],
    label: 'Disminución de la capacidad funcional / discapacidad',
    definition: 'El paciente presenta disminución de la capacidad funcional o discapacidad atribuible a la EI.',
    criteria: 'Marcar "Sí" solo si consta explícitamente una limitación funcional o discapacidad relacionada.',
    options: booleanOptions(1)
  },
  {
    id: 'dolor_presente',
    block: 'especifica',
    type: 'boolean',
    appliesTo: ['musculo-esqueletica'],
    label: 'Dolor presente (EVA ≥7)',
    definition: 'Dolor relevante, con Escala Visual Analógica igual o superior a 7.',
    criteria: 'Marcar "Sí" solo si consta una puntuación EVA ≥7, o una descripción explícita de dolor intenso.',
    options: booleanOptions(1)
  },

  // ---- Bloque 5: Específicas — Gastro-intestinal (máx. 2) ----
  {
    id: 'complicaciones_intestinales',
    block: 'especifica',
    type: 'boolean',
    appliesTo: ['gastro-intestinal'],
    label: 'Complicaciones intestinales',
    definition: 'Obstrucción, estenosis, fístulas o abscesos relacionados con la EI.',
    criteria: 'Marcar "Sí" solo si consta explícitamente alguna de estas complicaciones.',
    options: booleanOptions(1)
  },
  {
    id: 'problemas_nutricionales',
    block: 'especifica',
    type: 'boolean',
    appliesTo: ['gastro-intestinal'],
    label: 'Problemas nutricionales',
    definition: 'Malabsorción de proteínas, vitaminas o minerales.',
    criteria: 'Marcar "Sí" solo si consta explícitamente malabsorción o déficit nutricional relevante.',
    options: booleanOptions(1)
  }
];

export function fieldsForDiseaseType(tipoEI) {
  return FIELD_DEFINITIONS.filter(
    (f) => f.appliesTo === 'all' || (Array.isArray(f.appliesTo) && f.appliesTo.includes(tipoEI))
  );
}

export function scoredFieldsForDiseaseType(tipoEI) {
  return fieldsForDiseaseType(tipoEI);
}

export function getFieldDefinition(id) {
  return FIELD_DEFINITIONS.find((f) => f.id === id) || null;
}

// Umbrales de estratificación (Modelo MAPEX-SEFH). No modificar sin
// justificación clínica documentada.
export const PRIORITY_THRESHOLDS = {
  level1: 31, // total >= 31 -> Prioridad 1
  level2: 18 // total >= 18 (y < 31) -> Prioridad 2 ; por debajo -> Prioridad 3
};

export const PRIORITY_CONFIG = {
  1: { label: 'Prioridad 1', followUp: 'Valoración semestral (cada 6 meses)' },
  2: { label: 'Prioridad 2', followUp: 'Valoración anual (cada 12 meses), salvo decisión profesional o cambio de tratamiento de la EI' },
  3: { label: 'Prioridad 3', followUp: 'Valoración según necesidad (decisión profesional o cambio de tratamiento de la EI)' }
};

// Datos contextuales del paso 1 (no puntúan, pero son necesarios para el
// cálculo — tipoEI y edad — o para el informe).
export const PRIVACY_NOTICE =
  'No introduzca datos directamente identificativos del paciente (nombre, DNI, número de historia clínica, teléfono, dirección…). Use, si lo necesita, un identificador pseudonimizado interno.';

export const CONTEXT_FIELDS = [
  { id: 'farmaceutico', label: 'Farmacéutico', required: true, type: 'text', extractable: false },
  { id: 'hospital', label: 'Hospital/Centro', required: true, type: 'text', extractable: false },
  { id: 'fechaEvaluacion', label: 'Fecha de evaluación', required: true, type: 'date', extractable: false },
  {
    id: 'pacienteId',
    label: 'Identificador pseudonimizado del paciente (opcional)',
    required: false,
    type: 'text',
    extractable: false,
    hint: PRIVACY_NOTICE
  },
  {
    id: 'tipoEI',
    label: 'Tipo de enfermedad inflamatoria inmunomediada',
    required: true,
    type: 'select',
    options: DISEASE_TYPES,
    extractable: true,
    definition: 'Categoría de enfermedad inflamatoria inmunomediada del paciente.',
    criteria: 'Determinar a partir del diagnóstico explícito (p. ej. psoriasis → dermatológica; artritis reumatoide/espondiloartritis → músculo-esquelética; Crohn/colitis ulcerosa → gastro-intestinal).'
  },
  {
    id: 'diagnosticoEspecifico',
    label: 'Diagnóstico específico',
    required: true,
    type: 'text',
    extractable: true,
    definition: 'Nombre concreto de la enfermedad diagnosticada.',
    criteria: 'Extraer el nombre exacto del diagnóstico tal y como aparece en el texto.'
  },
  {
    id: 'edad',
    label: 'Edad (años)',
    required: true,
    type: 'number',
    extractable: true,
    definition: 'Edad del paciente en años.',
    criteria: 'Extraer únicamente si la edad consta de forma numérica y explícita.'
  },
  {
    id: 'tratamiento',
    label: 'Tratamiento actual para la EI',
    required: true,
    type: 'textarea',
    extractable: true,
    definition: 'Descripción del tratamiento farmacológico actual para la EI.',
    criteria: 'Extraer fármaco(s), dosis y pauta si constan explícitamente.'
  },
  {
    id: 'situacionClinica',
    label: 'Situación clínica reciente',
    required: true,
    type: 'textarea',
    extractable: true,
    definition: 'Resumen breve de la actividad de la enfermedad y evolución reciente.',
    criteria: 'Resumir solo con información explícitamente presente en el texto, sin añadir interpretaciones no sustentadas.'
  }
];

export function extractableContextFields() {
  return CONTEXT_FIELDS.filter((f) => f.extractable);
}

export const EXAMPLE_CASES = {
  completo: `Paciente mujer de 34 años en seguimiento por artritis reumatoide seropositiva de 6 años de evolución. Actualmente en tratamiento con metotrexato 15 mg/semana vía oral más adalimumab 40 mg/2 semanas subcutáneo, iniciado hace 3 años (no es naïve). Refiere haber olvidado la inyección en dos ocasiones el último mes ("se me olvida a veces con el trabajo"). Toma además omeprazol, ácido fólico, atorvastatina, metformina, losartán y calcio: 6 medicamentos en total. No se han modificado fármacos en los últimos 6 meses. No refiere reacciones adversas relevantes en el último año. DAS28 de 4,1 (actividad moderada). Vive con su pareja y dos hijos, refiere buen apoyo familiar. Trabaja a jornada completa como administrativa; comenta que a veces le cuesta acudir a las citas por el horario laboral. Sin antecedentes de tabaquismo ni consumo de alcohol. Sin deterioro cognitivo. IMC 24. No refiere deseo gestacional en este momento. Última hospitalización: ninguna en los últimos 2 meses. Diabetes mellitus tipo 2 e hipertensión arterial como comorbilidades (2 enfermedades crónicas). Seguida por Reumatología y Endocrinología (2 especialistas). No presenta insuficiencia renal ni hepática. DLQI no aplicable; escala AIMS con puntuación indicativa de calidad de vida disminuida.`,
  incompleto: `Varón de 58 años, psoriasis en placas. En tratamiento biológico. Refiere que "en general está bien". Sin más datos disponibles en el momento de la consulta.`,
  contradictorio: `Paciente con enfermedad de Crohn. En una nota de enfermería de la semana pasada consta "buena adherencia al tratamiento, refiere tomar la medicación correctamente". En la nota médica de ayer se recoge: "el paciente reconoce haber dejado la medicación biológica por su cuenta hace un mes por miedo a los efectos adversos". Tratamiento actual: ustekinumab. Sin más datos.`,
  altaPrioridad: `Mujer de 16 años, diagnosticada recientemente de enfermedad de Crohn, naïve a terapia biológica, va a iniciar infliximab. Refiere deseo de quedarse embarazada en los próximos meses según comenta a su madre en consulta (paciente ya en edad fértil, en seguimiento conjunto con Ginecología). Actividad de la enfermedad alta según índice de actividad (CDAI elevado). Ingreso hospitalario hace 3 semanas por brote. Presenta fístulas perianales y datos de malabsorción con déficit de vitamina B12 y hierro. Vive sola desde hace poco, sin apoyo familiar cercano en la ciudad donde estudia. Refiere síntomas de ansiedad no tratados. No fuma ni consume alcohol. Toma 7 medicamentos distintos incluyendo tratamiento nutricional.`,
  bajaPrioridad: `Varón de 45 años con psoriasis en placas leve-moderada, en tratamiento tópico exclusivamente, sin biológicos. Buen control de la enfermedad, sin brotes en el último año. No presenta comorbilidades relevantes. No toma otra medicación. Buena adherencia referida y confirmada en consulta. Vive con su familia, sin problemas sociales ni laborales referidos. No fuma, no bebe alcohol. IMC 23. Sin antecedentes psiquiátricos.`,
  ausenciaNoNegativo: `Paciente con espondilitis anquilosante en tratamiento con secukinumab. Motivo de consulta: revisión rutinaria de dispensación. No se registra en el texto ninguna referencia a hábito tabáquico, consumo de alcohol, situación laboral, adherencia al tratamiento ni apoyo social.`
};
