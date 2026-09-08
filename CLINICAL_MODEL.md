# Modelo clínico — CMO-MAPEX para Enfermedades Inmunomediadas

Este documento describe el modelo de estratificación implementado. La
**fuente de verdad ejecutable** es `assets/modules/config.js`
(`FIELD_DEFINITIONS`, `PRIORITY_THRESHOLDS`, `PRIORITY_CONFIG`,
`AGE_GROUPS`); si este documento y el código difirieran alguna vez, el
código es lo que se ejecuta y este documento debe corregirse para
reflejarlo.

Basado en el **Proyecto MAPEX (SEFH, 2018)**, adaptado a pacientes con
enfermedad inflamatoria inmunomediada (EII) en seguimiento por Farmacia
Hospitalaria.

## Puntuación máxima: 71 puntos

| Bloque | Máximo |
|---|---|
| Demográficas | 9 |
| Sociosanitarias | 21 |
| Clínicas | 14 |
| Farmacoterapéuticas | 25 |
| Específicas según tipo de EI | 2 |

## Bloque 1 — Demográficas (9)
- Sexo femenino: 1
- Grupo de edad (derivado automáticamente de la edad indicada en el paso 1): ≤12 años → 1 · 13-17 → 3 · 18-69 → 2 · ≥70 → 2
- Obesidad (IMC ≥30 kg/m²): 2
- Embarazada: 3
- Deseo gestacional: 2

**Regla especial:** si "Embarazada" o "Deseo gestacional" es Sí, el nivel de
prioridad es **1 de forma automática**, sea cual sea la puntuación total.

## Bloque 2 — Sociosanitarias (21)
Alcoholismo y/o drogadicción (3) · Tabaquismo (2) · Barreras de comunicación
(3) · Sin soporte social/familiar (3) · Actividad laboral dificulta el
cumplimiento (2) · Calidad de vida disminuida — DLQI/SIBDQ/AIMS (3) ·
Problemas psicológicos/psiquiátricos (3) · Deterioro cognitivo o dependencia
funcional — Pfeiffer/Katz (2).

## Bloque 3 — Clínicas (14)
≥2 enfermedades crónicas complejas (2) · Insuficiencia renal o hepática (3)
· ≥2 especialistas por órganos afectados (3) · ≥1 ingreso/urgencias en los
últimos 2 meses (3) · Actividad moderada/alta de la enfermedad (3).

## Bloque 4 — Farmacoterapéuticas (25)
Naïve a terapia hospitalaria (4) · Polimedicación ≥6 medicamentos (3) ·
Modificación del tratamiento en los últimos 6 meses (3) · Medicamento de
alto riesgo ISMP (3) · Riesgo de interacción clínicamente relevante (3) ·
Reacciones adversas en el último año (3) · Falta de adherencia (4) ·
Medicamento comercializado hace menos de 1 año (2).

## Bloque 5 — Específicas según tipo de EI (2)
- **Dermatológica:** comorbilidades cardiovasculares/síndrome
  metabólico/diabetes — ninguna (0) · una (1) · más de una (2).
- **Músculo-esquelética:** disminución de la capacidad funcional/discapacidad
  (1) + dolor presente EVA≥7 (1).
- **Gastro-intestinal:** complicaciones intestinales — obstrucción,
  estenosis, fístulas, abscesos (1) + problemas nutricionales — malabsorción
  (1).

## Niveles de estratificación

```
nivel = 3
si puntuación total ≥ 18  → nivel = 2
si puntuación total ≥ 31  → nivel = 1
si embarazo o deseo gestacional → nivel = 1   (tiene prioridad sobre lo anterior)
```

| Nivel | Umbral | Periodicidad de seguimiento |
|---|---|---|
| Prioridad 1 | ≥31 puntos, o regla especial de embarazo | Semestral (6 meses) |
| Prioridad 2 | 18-30 puntos | Anual (12 meses), salvo decisión profesional o cambio de tratamiento |
| Prioridad 3 | ≤17 puntos | Según necesidad (decisión profesional o cambio de tratamiento) |

## Principio de cálculo

La puntuación se calcula **exclusivamente a partir de variables confirmadas
por el farmacéutico**. Una variable sin confirmar (pendiente, desconocida, o
solo sugerida por la IA sin aceptar) no puntúa. Ver `AI_POLICY.md` para el
tratamiento de la información extraída automáticamente.

## Necesidades (Capacidad · Motivación · Oportunidad)

A partir de las variables confirmadas con puntuación positiva, la
herramienta sugiere necesidades agrupadas según la filosofía CMO
(`assets/modules/needs-mapper.js`). Esta capa es orientativa: el
farmacéutico decide qué necesidades son clínicamente relevantes para el
plan de atención.

## Catálogo de intervenciones

El catálogo (`assets/modules/interventions-catalog.js`) reutiliza
íntegramente los textos de Seguimiento farmacoterapéutico, Educación y
formación, y Coordinación asistencial del Plan de Atención Farmacéutica
original por nivel, reorganizados en tarjetas seleccionables con
disponibilidad orientativa (básica/avanzada/dependiente del centro). Ver
`ANALYSIS.md` para la trazabilidad completa respecto a la herramienta
original.

## Cambios respecto a la herramienta original

Ninguno en variables, pesos, bloques, umbrales ni regla de embarazo. Ver
`ANALYSIS.md` §1-2 para el detalle completo de la auditoría (qué se
mantiene, mejora, refactoriza y añade).
