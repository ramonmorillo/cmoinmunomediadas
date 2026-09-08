// Motor de cálculo determinista del Modelo CMO-MAPEX. Función pura: no
// conoce IA, DOM ni almacenamiento. Toda la lógica clínica (pesos, bloques,
// umbrales, regla de embarazo) proviene de config.js.
//
// Principio fundamental (encargo del usuario, punto "PRINCIPIO
// FUNDAMENTAL"): la puntuación se calcula EXCLUSIVAMENTE a partir de
// variables confirmadas por el farmacéutico. Una variable sin confirmar no
// puntúa (se trata como ausencia de información, nunca como "No").

import { BLOCKS, PRIORITY_THRESHOLDS, PRIORITY_CONFIG, scoredFieldsForDiseaseType, AGE_GROUPS, ageToGroup } from './config.js';

/**
 * @param {Record<string, string>} confirmedValues  { fieldId: optionValue } — solo variables confirmadas
 * @param {string} tipoEI
 * @param {string|number} [edad]  Edad en años (campo contextual del paso 1). El grupo de
 *   edad (bloque demográfico) se deriva automáticamente de este valor: no es una
 *   variable de extracción/confirmación independiente.
 * @returns {{
 *   total: number,
 *   maxPossible: number,
 *   breakdown: Record<string, {points:number, max:number}>,
 *   level: 1|2|3,
 *   levelLabel: string,
 *   followUp: string,
 *   pregnancyTrigger: boolean,
 *   contributingFactors: Array<{id:string, label:string, points:number, block:string}>
 * }}
 */
export function computeStratification(confirmedValues, tipoEI, edad) {
  const fields = scoredFieldsForDiseaseType(tipoEI);

  const breakdown = {};
  BLOCKS.forEach((b) => {
    breakdown[b.id] = { points: 0, max: b.id === 'especifica' && !tipoEI ? 0 : b.maxPoints };
  });

  const contributingFactors = [];
  let total = 0;

  const ageGroupId = ageToGroup(edad);
  const ageGroup = AGE_GROUPS.find((g) => g.value === ageGroupId);
  if (ageGroup && ageGroup.weight > 0) {
    total += ageGroup.weight;
    breakdown.demografica.points += ageGroup.weight;
    contributingFactors.push({
      id: 'edad_grupo',
      label: 'Grupo de edad',
      optionLabel: ageGroup.label,
      points: ageGroup.weight,
      block: 'demografica'
    });
  }

  fields.forEach((field) => {
    const value = confirmedValues[field.id];
    if (value === undefined || value === null || value === '') return;
    const option = field.options.find((o) => o.value === value);
    if (!option || typeof option.weight !== 'number' || option.weight <= 0) return;

    total += option.weight;
    breakdown[field.block].points += option.weight;
    contributingFactors.push({
      id: field.id,
      label: field.label,
      optionLabel: option.label,
      points: option.weight,
      block: field.block
    });
  });

  contributingFactors.sort((a, b) => b.points - a.points);

  const pregnancyTrigger =
    confirmedValues.embarazada === 'si' || confirmedValues.deseo_embarazo === 'si';

  let level = 3;
  if (total >= PRIORITY_THRESHOLDS.level2) level = 2;
  if (total >= PRIORITY_THRESHOLDS.level1) level = 1;
  if (pregnancyTrigger) level = 1;

  const config = PRIORITY_CONFIG[level];

  return {
    total,
    maxPossible: BLOCKS.reduce((sum, b) => sum + b.maxPoints, 0),
    breakdown,
    level,
    levelLabel: config.label,
    followUp: config.followUp,
    pregnancyTrigger,
    contributingFactors
  };
}
