// Extracción heurística LOCAL (búsqueda de palabras clave + detección de
// negación), usada exclusivamente como modo demostración cuando no hay un
// servicio de IA real configurado. NO es un modelo de lenguaje: es una
// búsqueda de patrones determinista, transparente y auditable.
//
// Principio anti-alucinaciones (encargo, punto 6): la ausencia de mención
// nunca se traduce en un valor negativo. Si no se encuentra nada, el estado
// es "not_found", no "no". Todo resultado exige confirmación humana.

const NEGATION_MAX_LOOKBACK = 160;
// Se compara contra el fragmento desde el inicio de la frase actual hasta la
// mención encontrada (no solo los últimos N caracteres): frases del tipo
// "No se registra ninguna referencia a tabaquismo, consumo de alcohol o..."
// niegan varios términos a la vez, mucho después de la palabra "No".
const NEGATION_REGEX = /\b(no|sin|niega|descarta|ausencia de|negativo para|ninguna referencia a|no se registra|no consta|sin datos de|no hay constancia de|no se objetiva)\b/i;
const UNCERTAIN_REGEX = /\b(posible|probable|parece|podr[ií]a|sugiere|no descartable|presunt[oa]|dudos[oa])\b/i;

function currentSentenceStart(text, index) {
  const from = Math.max(0, index - NEGATION_MAX_LOOKBACK);
  const slice = text.slice(from, index);
  const lastBreak = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf(';'), slice.lastIndexOf('\n'));
  return lastBreak === -1 ? from : from + lastBreak + 1;
}

function isNegated(text, index) {
  const start = currentSentenceStart(text, index);
  return NEGATION_REGEX.test(text.slice(start, index));
}

function isUncertainNear(text, index, length) {
  const windowStart = Math.max(0, index - 25);
  const windowEnd = Math.min(text.length, index + length + 25);
  return UNCERTAIN_REGEX.test(text.slice(windowStart, windowEnd));
}

function excerpt(text, index, length) {
  const start = Math.max(0, index - 55);
  const end = Math.min(text.length, index + length + 55);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function baseResult(field, overrides) {
  return {
    variable: field.id,
    value: null,
    status: 'not_found',
    confidence: 0,
    evidence: '',
    reasoning_summary:
      'No se ha encontrado ninguna mención relacionada en el texto. La ausencia de mención NO equivale a una respuesta negativa.',
    needs_human_confirmation: true,
    ...overrides
  };
}

function matchAllSafe(text, regex) {
  try {
    return [...text.matchAll(new RegExp(regex, regex.flags.includes('g') ? regex.flags : regex.flags + 'g'))];
  } catch (err) {
    return [];
  }
}

function evaluateSimpleField(text, field, pattern) {
  if (pattern.resolver) {
    const resolved = pattern.resolver(text);
    if (!resolved) return baseResult(field);
    return baseResult(field, {
      value: resolved.value,
      status: resolved.uncertain ? 'uncertain' : 'found',
      confidence: resolved.uncertain ? 0.5 : 0.65,
      evidence: resolved.evidence || '',
      reasoning_summary: resolved.reasoning || 'Deducido mediante regla heurística local (recuento/patrón numérico).'
    });
  }

  const positiveMatches = pattern.regex ? matchAllSafe(text, pattern.regex) : [];
  const oppositeMatches = pattern.oppositeRegex ? matchAllSafe(text, pattern.oppositeRegex) : [];

  const positiveEvals = positiveMatches.map((m) => ({
    index: m.index,
    text: m[0],
    negated: isNegated(text, m.index),
    uncertain: isUncertainNear(text, m.index, m[0].length)
  }));

  const explicitPositive = positiveEvals.filter((e) => !e.negated);
  const explicitNegative = positiveEvals.filter((e) => e.negated);

  if (explicitPositive.length && (explicitNegative.length || oppositeMatches.length)) {
    const conflictSample = explicitPositive[0];
    const negativeSample = explicitNegative[0] || {
      index: oppositeMatches[0].index,
      text: oppositeMatches[0][0]
    };
    return baseResult(field, {
      status: 'contradictory',
      confidence: 0.35,
      evidence: `${excerpt(text, conflictSample.index, conflictSample.text.length)}  ///  ${excerpt(
        text,
        negativeSample.index,
        negativeSample.text.length
      )}`,
      reasoning_summary:
        'Se han encontrado menciones que apuntan en direcciones opuestas para esta variable. Requiere revisión clínica directa.'
    });
  }

  if (oppositeMatches.length && !explicitPositive.length) {
    const m = oppositeMatches[0];
    return baseResult(field, {
      value: 'no',
      status: 'found',
      confidence: 0.6,
      evidence: excerpt(text, m.index, m[0].length),
      reasoning_summary: 'El texto menciona explícitamente la condición contraria.'
    });
  }

  if (explicitNegative.length && !explicitPositive.length) {
    const m = explicitNegative[0];
    return baseResult(field, {
      value: 'no',
      status: 'found',
      confidence: 0.6,
      evidence: excerpt(text, m.index, m.text.length),
      reasoning_summary: 'El texto niega explícitamente esta condición cerca del término buscado.'
    });
  }

  if (explicitPositive.length) {
    const anyUncertain = explicitPositive.some((e) => e.uncertain);
    const m = explicitPositive[0];
    return baseResult(field, {
      value: pattern.value || 'si',
      status: anyUncertain ? 'uncertain' : 'found',
      confidence: anyUncertain ? 0.45 : 0.65,
      evidence: excerpt(text, m.index, m.text.length),
      reasoning_summary: anyUncertain
        ? 'La mención localizada usa lenguaje dubitativo ("posible", "sugiere"…); requiere confirmación clínica.'
        : 'Mención explícita del término buscado, sin negación detectada en el contexto próximo.'
    });
  }

  return baseResult(field);
}

// Patrones para las variables clínicas puntuables (config.js FIELD_DEFINITIONS)
const CLINICAL_PATTERNS = {
  sexo_mujer: { regex: /\bmujer\b|\bfemenin[oa]\b|\bpaciente\s+de\s+sexo\s+femenino\b/i, oppositeRegex: /\bvar[oó]n\b|\bhombre\b|\bmasculino\b/i },
  peso_obesidad: {
    resolver: (text) => {
      const kw = /\bobesidad\b/i.exec(text);
      const imc = /IMC\D{0,8}(\d{2}(?:[.,]\d+)?)/i.exec(text);
      if (imc && Number(imc[1].replace(',', '.')) >= 30) {
        return { value: 'si', evidence: excerpt(text, imc.index, imc[0].length), reasoning: `IMC ${imc[1]} ≥ 30 detectado en el texto.` };
      }
      if (kw) {
        return { value: 'si', evidence: excerpt(text, kw.index, kw[0].length), reasoning: 'Mención explícita de "obesidad".' };
      }
      return null;
    }
  },
  embarazada: { regex: /\bembarazad[ao]\b|\bgestante\b|\ben\s+gestaci[oó]n\b/i },
  deseo_embarazo: { regex: /\bdeseo\s+(?:de\s+)?(?:embarazo|gestacional|quedarse\s+embarazada)\b|\bdesea\s+(?:quedarse\s+embarazada|un\s+embarazo)\b/i },
  alcoholismo_drogas: { regex: /\balcoholismo\b|\bconsumo\s+de\s+alcohol\b|\bdrogadicci[oó]n\b|\babuso\s+de\s+sustancias\b|\bdependencia\s+(?:al\s+alcohol|de\s+drogas)\b/i },
  tabaquismo: { regex: /\bfuma(?:dor)?\b|\btabaquismo\b|\bconsumo\s+de\s+tabaco\b/i },
  barreras_comunicacion: { regex: /\bbarrera[s]?\s+(?:de\s+)?(?:comunicaci[oó]n|idiom[aá]tica|cultural|cognitiva)\b|\bdificultad(?:es)?\s+(?:de|para\s+la)\s+comunicaci[oó]n\b|\bno\s+habla\s+(?:el\s+idioma|español)\b/i },
  sin_soporte_social: { regex: /\bsin\s+(?:apoyo|soporte)\s+(?:social|familiar)\b|\bvive\s+sol[oa]\b|\baislamiento\s+social\b/i },
  situacion_laboral_dificil: { regex: /\b(?:horario|jornada|actividad)\s+laboral\b[^.]{0,40}(?:dificult|impide|incompatib)|\bincompatibilidad\s+laboral\b/i },
  calidad_vida_baja: { regex: /\bcalidad\s+de\s+vida\s+(?:disminuida|afectada|baja)\b|\bDLQI\b|\bSIBDQ\b|\bAIMS\b/i },
  problemas_psicologicos: { regex: /\bansiedad\b|\bdepresi[oó]n\b|\btrastorno\s+psiqui[aá]trico\b|\bs[ií]ntomas\s+depresivos\b/i },
  deterioro_cognitivo_funcional: { regex: /\bdeterioro\s+cognitivo\b|\bdependencia\s+funcional\b|\bPfeiffer\b|\bKatz\b/i },
  comorbilidades_2mas: {
    resolver: (text) => {
      const kws = ['diabetes', 'hipertensi[oó]n', 'dislipemia', 'EPOC', 'cardiopat[ií]a', 'insuficiencia\\s+card[ií]aca', 'obesidad'];
      const found = new Set();
      let firstIndex = null;
      kws.forEach((kw) => {
        const m = new RegExp(`\\b${kw}\\b`, 'i').exec(text);
        if (m) {
          found.add(kw);
          if (firstIndex === null) firstIndex = m.index;
        }
      });
      if (found.size >= 2) {
        return { value: 'si', evidence: excerpt(text, firstIndex, 20), reasoning: `Se detectan ${found.size} comorbilidades crónicas mencionadas (${[...found].join(', ')}).` };
      }
      return null;
    }
  },
  insuficiencia_renal_hepatica: { regex: /\binsuficiencia\s+(?:renal|hep[aá]tica)\b/i },
  multidisciplinariedad: {
    resolver: (text) => {
      const specialties = ['reumatolog[ií]a', 'dermatolog[ií]a', 'digestivo', 'gastroenterolog[ií]a', 'endocrinolog[ií]a', 'psiquiatr[ií]a', 'ginecolog[ií]a', 'nefrolog[ií]a'];
      const found = new Set();
      let firstIndex = null;
      specialties.forEach((sp) => {
        const m = new RegExp(`\\b${sp}\\b`, 'i').exec(text);
        if (m) {
          found.add(sp);
          if (firstIndex === null) firstIndex = m.index;
        }
      });
      if (found.size >= 2) {
        return { value: 'si', evidence: excerpt(text, firstIndex, 20), reasoning: `Se mencionan ${found.size} especialidades distintas en el seguimiento.` };
      }
      return null;
    }
  },
  hospitalizaciones_urgencias: { regex: /\bingreso\s+hospitalario\b|\bhospitalizaci[oó]n\b|\burgencias\b/i },
  actividad_enfermedad: { regex: /\bactividad\s+(?:alta|moderada)\b|\bbrote\b|\bDAS28\b|\bCDAI\b/i },
  naive_terapia: { regex: /\bna[ïi]ve\b|\bprimera\s+vez\b[^.]{0,25}tratamiento|\binicia(?:r)?\s+(?:tratamiento|terapia)\s+biol[oó]gic[oa]\b/i, oppositeRegex: /\bno\s+es\s+na[ïi]ve\b|\bno\s+na[ïi]ve\b/i },
  polimedicacion: {
    resolver: (text) => {
      const kw = /\bpolimedicad[oa]\b/i.exec(text);
      if (kw) return { value: 'si', evidence: excerpt(text, kw.index, kw[0].length), reasoning: 'Mención explícita de "polimedicado/a".' };
      const num = /(\d{1,2})\s+medicamentos?/i.exec(text) || /(\d{1,2})\s+total\s*:?\s*/i.exec(text);
      if (num && Number(num[1]) >= 6) {
        return { value: 'si', evidence: excerpt(text, num.index, num[0].length), reasoning: `Se cuentan ${num[1]} medicamentos (≥6).` };
      }
      return null;
    }
  },
  modificacion_regimen: { regex: /\bmodificaci[oó]n\s+(?:del|de)\s+tratamiento\b|\bcambio\s+de\s+tratamiento\b|\bse\s+(?:ha\s+)?modificado\b[^.]{0,20}tratamiento/i },
  medicamento_alto_riesgo: { regex: /\balto\s+riesgo\b|\bISMP\b/i },
  interacciones: { regex: /\binteracci[oó]n\b/i },
  reacciones_adversas: { regex: /\breacci[oó]n\s+advers[ao]\b|\befecto[s]?\s+advers[oa]\b|\bRAM\b/i },
  falta_adherencia: {
    regex: /\bfalta\s+de\s+adherencia\b|\bincumplimiento\b|\bolvid[oa][^.]{0,25}dosis\b|\bdej(?:[oó]|ado)\s+la\s+medicaci[oó]n\b|\babandon(?:[oó]|ado)\b[^.]{0,20}(?:tratamiento|medicaci[oó]n)\b|\bse\s+me\s+olvida\b/i,
    oppositeRegex: /\bbuena\s+adherencia\b|\badherencia\s+(?:correcta|adecuada)\b/i
  },
  medicamento_reciente: { regex: /\bcomercializad[oa]\s+hace\s+menos\s+de\s+1?\s*año\b|\bmedicamento\s+reciente\b|\bnueva\s+comercializaci[oó]n\b/i },
  discapacidad_funcional: { regex: /\bdiscapacidad\b|\blimitaci[oó]n\s+funcional\b/i },
  dolor_presente: {
    resolver: (text) => {
      const eva = /EVA\D{0,6}(\d{1,2})/i.exec(text);
      if (eva && Number(eva[1]) >= 7) return { value: 'si', evidence: excerpt(text, eva.index, eva[0].length), reasoning: `EVA ${eva[1]} ≥ 7.` };
      const kw = /\bdolor\s+intenso\b/i.exec(text);
      if (kw) return { value: 'si', evidence: excerpt(text, kw.index, kw[0].length), reasoning: 'Mención explícita de dolor intenso.' };
      return null;
    }
  },
  complicaciones_intestinales: { regex: /\bf[ií]stula[s]?\b|\bestenosis\b|\bobstrucci[oó]n\b|\babsceso[s]?\b/i },
  problemas_nutricionales: { regex: /\bmalabsorci[oó]n\b|\bd[eé]ficit\s+(?:nutricional|de\s+vitamina|de\s+hierro)\b|\bdesnutrici[oó]n\b/i },
  comorbilidades_cv_diabetes: {
    resolver: (text) => {
      const kws = ['diabetes', 'hipertensi[oó]n', 'dislipemia', 's[ií]ndrome\\s+metab[oó]lico', 'cardiovascular'];
      const found = new Set();
      let firstIndex = null;
      kws.forEach((kw) => {
        const m = new RegExp(`\\b${kw}\\b`, 'i').exec(text);
        if (m) {
          found.add(kw);
          if (firstIndex === null) firstIndex = m.index;
        }
      });
      if (found.size === 0) return null;
      const value = found.size === 1 ? 'una' : 'mas-una';
      return {
        value,
        uncertain: true,
        evidence: excerpt(text, firstIndex, 20),
        reasoning: `Se detectan ${found.size} comorbilidad(es) de este grupo mencionadas; confirmar exactitud.`
      };
    }
  }
};

export function heuristicExtractClinicalFields(text, fields) {
  return fields.map((field) => {
    const pattern = CLINICAL_PATTERNS[field.id];
    if (!pattern) return baseResult(field);
    return evaluateSimpleField(text, field, pattern);
  });
}

const DISEASE_TYPE_KEYWORDS = {
  dermatologica: /\bpsoriasis\b|\bdermatitis\s+at[oó]pica\b|\bhidradenitis\b/i,
  'musculo-esqueletica': /\bartritis\b|\bespondiloartritis\b|\bespondilitis\b/i,
  'gastro-intestinal': /\bcrohn\b|\bcolitis\s+ulcerosa\b|\benfermedad\s+inflamatoria\s+intestinal\b/i
};

export function heuristicExtractContext(text) {
  const results = {};

  const ageMatch = /(\d{1,3})\s*[-–]?\s*años/i.exec(text) || /de\s+(\d{1,3})\s+años/i.exec(text);
  results.edad = ageMatch
    ? {
        variable: 'edad',
        value: ageMatch[1],
        status: 'uncertain',
        confidence: 0.55,
        evidence: excerpt(text, ageMatch.index, ageMatch[0].length),
        reasoning_summary: 'Edad numérica localizada en el texto mediante patrón heurístico.',
        needs_human_confirmation: true
      }
    : baseResult({ id: 'edad' });

  const typeMatches = Object.entries(DISEASE_TYPE_KEYWORDS)
    .map(([id, regex]) => ({ id, match: regex.exec(text) }))
    .filter((r) => r.match);

  if (typeMatches.length === 1) {
    const { id, match } = typeMatches[0];
    results.tipoEI = {
      variable: 'tipoEI',
      value: id,
      status: 'uncertain',
      confidence: 0.5,
      evidence: excerpt(text, match.index, match[0].length),
      reasoning_summary: 'Tipo de enfermedad inmunomediada deducido a partir de una palabra clave diagnóstica.',
      needs_human_confirmation: true
    };
  } else if (typeMatches.length > 1) {
    results.tipoEI = {
      variable: 'tipoEI',
      value: null,
      status: 'contradictory',
      confidence: 0.3,
      evidence: typeMatches.map((t) => excerpt(text, t.match.index, t.match[0].length)).join('  ///  '),
      reasoning_summary: 'Se detectan palabras clave de más de un tipo de enfermedad inmunomediada.',
      needs_human_confirmation: true
    };
  } else {
    results.tipoEI = baseResult({ id: 'tipoEI' });
  }

  const treatmentMatch = /(?:en\s+)?tratamiento\s+(?:actual\s+)?con\s+([^.;\n]{3,120})/i.exec(text);
  results.tratamiento = treatmentMatch
    ? {
        variable: 'tratamiento',
        value: treatmentMatch[1].trim(),
        status: 'uncertain',
        confidence: 0.45,
        evidence: excerpt(text, treatmentMatch.index, treatmentMatch[0].length),
        reasoning_summary: 'Fragmento de tratamiento localizado tras la expresión "tratamiento con…". Revisar y completar.',
        needs_human_confirmation: true
      }
    : baseResult({ id: 'tratamiento' });

  results.diagnosticoEspecifico = baseResult({ id: 'diagnosticoEspecifico' });
  results.situacionClinica = baseResult({ id: 'situacionClinica' });

  return results;
}
