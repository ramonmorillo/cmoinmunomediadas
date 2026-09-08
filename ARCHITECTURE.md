# Arquitectura

Aplicación estática (HTML/CSS/JS, módulos ES nativos, sin build step) apta
para GitHub Pages. Sin frameworks de UI ni dependencias de CDN de terceros.

```
index.html
assets/
  styles.css
  app.js                       orquestación del wizard de 7 pasos, eventos
  modules/
    config.js                  variables clínicas, pesos, bloques, umbrales,
                                definiciones/criterios para la IA (fuente de verdad)
    cmo-engine.js               cálculo determinista de puntuación/nivel
    clinical-extraction-service.js  extracción IA (o modo demo), sin claves en frontend
    needs-mapper.js             variables confirmadas -> necesidades C/M/O
    interventions-catalog.js    catálogo de intervenciones seleccionables
    data-layer.js                estado central, trazabilidad, autosave, reset
    export-layer.js              informe final, informe IA, resúmenes, copiar/imprimir
    ui.js                        renderizado de cada paso del wizard
CLINICAL_MODEL.md
ARCHITECTURE.md
ANALYSIS.md
AI_POLICY.md
PRIVACY.md
README.md
CHANGELOG.md
```

## Principio de separación

`config.js` es la única fuente de verdad clínica (qué variables existen, qué
puntúan, qué reglas especiales hay). Ningún otro módulo contiene un peso o un
umbral hardcodeado — todos leen de `config.js`. Esto permite que el modelo
clínico se actualice en el futuro sin tocar el motor de cálculo, la
extracción IA ni la interfaz.

`cmo-engine.js` es una función pura: `computeStratification(variables,
tipoEI) -> { total, breakdown, level, pregnancyTrigger, contributingFactors }`.
No conoce IA, no conoce el DOM, no conoce almacenamiento. Se puede probar de
forma aislada (y de hecho se prueba con los 6 casos clínicos ficticios del
control de calidad).

## Flujo de 7 pasos (`app.js` + `ui.js`)

1. **Nueva estratificación** — datos del profesional/centro/paciente
   (contextuales, no puntúan) + botón "Nueva estratificación / Reiniciar"
   siempre visible en la cabecera.
2. **Historia clínica / extracción automática** — cuadro de texto amplio,
   contador de caracteres, "Analizar historia clínica" (usa
   `clinical-extraction-service.js`) / "Borrar texto". Si la IA no está
   configurada o falla: aviso claro y continuación manual, nunca bloqueo.
3. **Revisión de variables** — resultados agrupados por confianza (alta /
   dudosa-incompleta / no encontrada / contradictoria), evidencia
   desplegable, acciones aceptar/corregir/rechazar/desconocido por variable,
   "confirmar seleccionadas".
4. **Completar información pendiente** — solo variables sin confirmar
   ("Se han identificado automáticamente X de Y variables. Quedan Z por
   completar"), con opción de revisar también las ya confirmadas.
5. **Resultado de estratificación** — nivel, puntuación, desglose por
   bloque, factores determinantes, regla especial de embarazo si aplica.
6. **Plan de intervenciones** — necesidades C/M/O + catálogo de
   intervenciones seleccionables (recomendadas vs. seleccionadas,
   básica/avanzada/dependiente del centro), personalización, intervención
   manual.
7. **Informe final** — resumen inteligente, informe clínico completo,
   informe de extracción IA (trazabilidad), exportar/copiar/imprimir,
   "Copiar resumen para historia clínica".

## Estado y trazabilidad (`data-layer.js`)

Estado único en memoria (objeto JS), con un `origin` por variable:
`ai_confirmed | manual | ai_modified | unknown`. El texto narrativo pegado en
el paso 2 **no se persiste** en `localStorage` (solo vive en memoria durante
la sesión, por privacidad — sección 21). El guardado opcional de "casos"
guarda únicamente variables estructuradas + resultado, nunca el texto libre
de la HCE.

Se guarda además, por variable, un registro `{ aiValue, aiConfidence,
finalValue, matched, modifiedByPharmacist }` pensado para poder exportar
métricas de validación de la extracción en el futuro (sección 24), sin
necesitar base de datos ahora.

## Extracción IA (`clinical-extraction-service.js`)

```
extractClinicalVariables(text, variableDefinitions) -> Promise<ExtractionResult>
```
- Nunca contiene ni transmite una API key de proveedor de IA.
- Intenta `POST` a un endpoint configurable
  (`window.CMO_APP_CONFIG?.extractionEndpointUrl`), pensado para que cada
  hospital/farmacéutico despliegue su propia función serverless que
  reenvíe la petición al proveedor de IA que prefiera con su propia clave
  del lado servidor. La app nunca sabe ni necesita saber qué proveedor es.
- Si no hay endpoint configurado, o la petición falla, cae a **modo
  demostración**, explícitamente etiquetado como tal, que no debe
  confundirse con un resultado real de IA.
- Devuelve, por variable, exactamente la estructura pedida en la sección 5
  del encargo: `variable, value, status, confidence, evidence,
  reasoning_summary, needs_human_confirmation`.
- El motor de cálculo (`cmo-engine.js`) solo puede leer variables cuyo
  estado sea `confirmed` en `data-layer.js` — un resultado de IA por sí solo
  nunca entra en el cálculo.

## Catálogo de intervenciones y necesidades

`needs-mapper.js` traduce variables confirmadas a necesidades agrupadas en
Capacidad/Motivación/Oportunidad, cada una con las variables que la
justifican (trazabilidad dato → necesidad).

`interventions-catalog.js` contiene intervenciones basadas en los textos ya
validados del plan SEFH-MAPEX original (ver `ANALYSIS.md`), reorganizadas
como tarjetas seleccionables con: necesidad relacionada, dimensión CMO,
disponibilidad (`basica|avanzada|centro`), niveles para los que está
recomendada. El farmacéutico decide qué ejecuta; el catálogo solo sugiere.

## Sin IA disponible / modo manual

La estratificación manual (pasos 3-7 sin haber usado el paso 2) funciona de
forma completa e idéntica. La IA es una aceleración opcional, nunca un
requisito.
