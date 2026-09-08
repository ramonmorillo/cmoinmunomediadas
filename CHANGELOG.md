# Changelog

## v1.0.0 — Septiembre 2026

Primera versión modernizada de la herramienta. Repositorio partía vacío; se
usó como punto de partida funcional un artifact React de un único fichero
(estratificación Modelo CMO-MAPEX para enfermedades inmunomediadas) y como
referencia de diseño/UX `cmo-vih-app`.

**Añadido**
- Arquitectura modular estática (HTML/CSS/JS, sin build step): `config.js`
  (modelo clínico), `cmo-engine.js` (cálculo), `clinical-extraction-service.js`
  + `heuristic-extraction.js` (extracción IA / modo demostración),
  `needs-mapper.js`, `interventions-catalog.js`, `data-layer.js`,
  `export-layer.js`, `ui.js`, `app.js`.
- Flujo de 7 pasos con indicador de progreso: Nueva estratificación →
  Historia clínica → Revisión de variables → Completar información →
  Resultado → Plan de intervenciones → Informe final.
- Extracción conservadora con 4 estados (found/uncertain/not_found/contradictory),
  evidencia textual desplegable y confianza, sin nunca interpretar ausencia
  de información como respuesta negativa.
- Pantalla de revisión y confirmación humana obligatoria, agrupada por
  confianza, con trazabilidad de origen por variable (IA confirmada / IA
  corregida / manual / desconocida).
- Necesidades agrupadas según Capacidad-Motivación-Oportunidad.
- Catálogo de intervenciones seleccionables con disponibilidad
  (básica/avanzada/dependiente del centro) e intervenciones personalizadas.
- Informe final estructurado, informe de extracción IA (trazabilidad),
  resumen inteligente, copiar/descargar/imprimir, y "Copiar resumen para
  historia clínica".
- Botón "Nueva estratificación" con confirmación, que limpia todo el estado
  de la sesión.
- Guardado/carga de casos en `localStorage` (solo datos estructurados, nunca
  el texto de la historia clínica ni evidencias).
- Documentación: `ANALYSIS.md`, `ARCHITECTURE.md`, `CLINICAL_MODEL.md`,
  `AI_POLICY.md`, `PRIVACY.md`.

**Conservado del punto de partida (sin cambios en la lógica clínica)**
- Modelo de puntuación MAPEX-SEFH completo: variables, pesos, bloques,
  umbrales de prioridad (P1≥31 / P2 18-30 / P3≤17), regla especial de
  embarazo/deseo gestacional (prioridad 1 automática), bloque específico
  por tipo de EI (dermatológica/músculo-esquelética/gastro-intestinal).
- Textos del Plan de Atención Farmacéutica por nivel (seguimiento,
  educación, coordinación, periodicidad), reutilizados como base del nuevo
  catálogo de intervenciones seleccionables.

**Corregido respecto al punto de partida**
- La extracción por IA ya no asume que la ausencia de mención equivale a
  "No"; ahora usa estados explícitos y exige confirmación humana.
- Se elimina la llamada directa desde el frontend a la API de Anthropic sin
  clave (no funcional fuera del sandbox de artifacts, y contraria a buenas
  prácticas de seguridad); se sustituye por una capa de extracción
  configurable sin claves en el frontend, con modo demostración explícito.
