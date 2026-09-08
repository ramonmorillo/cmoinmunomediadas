# Análisis inicial — Herramienta CMO Enfermedades Inmunomediadas

Fecha del análisis: 2026-09-08
Autor de la auditoría: Claude Code, a petición de Ramón Morillo Verdugo.

Este documento se escribe **antes** de implementar la nueva versión, tal y como se
solicitó, para dejar constancia del punto de partida y de las decisiones de
diseño. Describe: (1) el modelo clínico exacto que contiene el artifact
original, que se conserva como fuente de verdad; (2) qué se mantiene, qué se
mejora, qué se refactoriza y qué se añade.

## 0. Origen

El punto de partida funcional fue un componente React de un único fichero
(`CMOInmunomediadaApp`), pensado para ejecutarse dentro del entorno de
artifacts de Claude.ai (Tailwind CDN + `lucide-react` + sandbox de fetch a la
API de Anthropic). El repositorio de destino
(`ramonmorillo/cmoinmunomediadas`) estaba vacío (0 commits) en el momento de
iniciar este trabajo.

Como referencia de patrón de diseño, navegación y arquitectura se ha
inspeccionado `ramonmorillo/cmo-vih-app` (clonado localmente), una aplicación
estática modular (vanilla JS, sin frameworks) con la siguiente estructura:
`index.html`, `assets/styles.css`, `assets/app.js` (orquestación) y
`assets/modules/{config,cmo-engine,ai-module,data-layer,export-layer,
case-model,case-search,case-storage,ui,i18n}.js`. Ese patrón de separación
config/engine/ui es exactamente el que pide el encargo en el punto 1, y es el
que se ha adoptado (sin la capa de i18n multi-idioma, que no se ha pedido y
añadiría complejidad de mantenimiento sin beneficio claro — sección 26).

## 1. Modelo clínico del artifact original (fuente de verdad — NO se modifica)

Basado en el **Modelo CMO-MAPEX (Proyecto MAPEX, SEFH 2018)** adaptado a
enfermedades inflamatorias inmunomediadas (EII). Puntuación máxima: **71
puntos**, en 4 bloques comunes + 1 bloque específico según tipo de EI.

### Datos contextuales (no puntúan, pero condicionan el flujo)
`farmaceutico`, `hospital`, `fechaEvaluacion`, `tipoEI`
(`dermatologica`/`musculo-esqueletica`/`gastro-intestinal`),
`diagnosticoEspecifico`, `edad` (años), `tratamiento`, `situacionClinica`.

### Bloque 1 — Demográficas (máx. 9 puntos)
| Variable | Valores | Puntos |
|---|---|---|
| `sexo_mujer` | sí/no | 1 |
| `edad_grupo` (derivada de `edad`) | ≤12 / 13-17 / 18-69 / ≥70 | 1 / 3 / 2 / 2 |
| `peso_obesidad` (IMC ≥30) | sí/no | 2 |
| `embarazada` | sí/no | 3 — **+ regla especial** |
| `deseo_embarazo` | sí/no | 2 — **+ regla especial** |

**Regla especial (trigger):** si `embarazada` o `deseo_embarazo` es verdadero,
el nivel de prioridad es **1 de forma automática**, independientemente de la
puntuación total.

*Nota de auditoría:* la etiqueta original "(máx 9 puntos)" no está reforzada
por código — si coincidieran `embarazada` y `deseo_embarazo` a la vez la suma
del bloque superaría 9. No es un error de cálculo (el total y el nivel siguen
siendo correctos), es solo una etiqueta descriptiva. Se conserva el
comportamiento; se ajustará el texto para que no induzca a error.

### Bloque 2 — Sociosanitarias (máx. 21 puntos)
`alcoholismo_drogas` (3), `tabaquismo` (2), `barreras_comunicacion` (3),
`sin_soporte_social` (3), `situacion_laboral_dificil` (2),
`calidad_vida_baja` (3, escalas DLQI/SIBDQ/AIMS), `problemas_psicologicos`
(3), `deterioro_cognitivo_funcional` (2, Pfeiffer/Katz). Todas sí/no.

### Bloque 3 — Clínicas (máx. 14 puntos)
`comorbilidades_2mas` (2, ≥2 enfermedades crónicas complejas),
`insuficiencia_renal_hepatica` (3), `multidisciplinariedad` (3, ≥2
especialistas por órganos afectados), `hospitalizaciones_urgencias` (3, ≥1
ingreso/urgencias últimos 2 meses), `actividad_enfermedad` (3, actividad
moderada/alta). Todas sí/no.

### Bloque 4 — Farmacoterapéuticas (máx. 25 puntos)
`naive_terapia` (4), `polimedicacion` (3, ≥6 medicamentos),
`modificacion_regimen` (3, últimos 6 meses), `medicamento_alto_riesgo` (3,
ISMP), `interacciones` (3), `reacciones_adversas` (3, último año),
`falta_adherencia` (4), `medicamento_reciente` (2, comercializado hace <1
año). Todas sí/no.

### Bloque 5 — Específicas por tipo de EI (máx. 2 puntos)
- **Dermatológica:** `comorbilidades_cv_diabetes` — ninguna (0) / una (1) /
  más de una (2). Comorbilidades: ECV, síndrome metabólico, diabetes.
- **Músculo-esquelética:** `discapacidad_funcional` (1) + `dolor_presente`
  (1, EVA≥7).
- **Gastro-intestinal:** `complicaciones_intestinales` (1, obstrucción /
  estenosis / fístulas / abscesos) + `problemas_nutricionales` (1,
  malabsorción de proteínas/vitaminas/minerales).

### Niveles de estratificación
```
nivel = 3                        (por defecto)
si total ≥ 18            → nivel = 2
si total ≥ 31            → nivel = 1
si embarazo/deseo_embarazo → nivel = 1   (siempre, tiene prioridad sobre el cálculo anterior)
```
Umbrales: **Prioridad 1 ≥31 · Prioridad 2: 18-30 · Prioridad 3 ≤17**.

### Plan de Atención Farmacéutica por nivel
Cada nivel tiene 3 apartados de texto (Seguimiento farmacoterapéutico,
Educación y formación, Coordinación asistencial) más una periodicidad de
revisión (P1: semestral: P2: anual; P3: según necesidad/cambio de
tratamiento). Estos textos —ya validados y basados en el documento
SEFH-MAPEX— se **conservan íntegramente** y pasan a ser la base del nuevo
catálogo de intervenciones seleccionables (sección 13 del encargo), en lugar
de mostrarse como bloque de texto fijo no interactivo.

## 2. Auditoría — Mantener / Mejorar / Refactorizar / Añadir

### Mantener (funciona bien, es una fortaleza)
- El modelo de puntuación MAPEX-SEFH íntegro: variables, pesos, umbrales,
  regla de embarazo. Es correcto, está bien documentado en el propio código
  (comentarios de puntos junto a cada campo) y es trazable a una fuente
  metodológica real.
- La bifurcación por tipo de EI (dermatológica / músculo-esquelética /
  gastro-intestinal) con bloque de variables específico — buen patrón de
  extensibilidad.
- El resumen de puntuación en tiempo real mientras se marcan variables
  (barra de progreso + desglose por bloque) — muy útil para el farmacéutico,
  se conserva como panel de apoyo.
- La generación de un resumen ejecutivo y de un texto listo para pegar en la
  HCE — funcionalidad valiosa, se conserva y se mejora (separar "resumen
  para el farmacéutico" de "texto para pegar en la HC", tal como pide el
  encargo).
- El guardado/carga de casos en `localStorage` — útil para uso real en
  consulta; se conserva pero se ajusta su alcance por privacidad (ver más
  abajo).
- El modal de confirmación antes de resetear — correcto, se conserva y se
  refuerza (debe limpiar *todo*, incluido el texto de HCE pegado).
- El checklist de "Controles de calidad" al final — buena práctica de
  transparencia, se conserva y se conecta a datos reales (actualmente ya lo
  está, es coherente).

### Mejorar
- **Extracción por IA con "ausencia = negativo".** El prompt actual indica
  *"Deja los campos boolean en false si no hay evidencia clara"*. Esto
  viola el principio anti-alucinaciones que pide expresamente el encargo
  (sección 6): la ausencia de mención no puede traducirse en "no" oculto
  bajo un `false` indistinguible de un "no" confirmado. Se sustituye por un
  esquema de estados (`found / uncertain / not_found / contradictory`) con
  evidencia y confianza, y el `false` deja de usarse como valor por defecto
  silencioso.
- **Confirmación humana ausente.** Hoy la extracción sobrescribe
  directamente el estado (`setVariables(prev => ({...}))`) sin pantalla de
  revisión ni evidencia visible. Se añade el flujo completo de revisión
  (secciones 7-9 del encargo).
- **Trazabilidad de origen inexistente.** No se registra si un valor viene
  de IA, de entrada manual o ha sido corregido. Se añade (sección 10).

### Refactorizar (arquitectura/mantenimiento)
- Todo el modelo clínico, el cálculo y la interfaz están mezclados en un
  único componente React de ~800 líneas. Se separa en módulos
  independientes (config de variables / motor de cálculo / servicio de
  extracción / mapeo de necesidades / catálogo de intervenciones / capa de
  datos / capa de exportación / interfaz), siguiendo el patrón ya validado
  en `cmo-vih-app`.
- Se sustituye React + Tailwind CDN + `lucide-react` (dependencias que solo
  funcionan dentro del sandbox de artifacts de Claude.ai) por HTML/CSS/JS
  estático sin build step, apto para GitHub Pages sin dependencias externas
  de CDN — más simple de mantener y desplegar (sección 26).
- **Llamada a la API de Anthropic directamente desde el frontend, sin clave.**
  `fetch("https://api.anthropic.com/v1/messages", ...)` sin cabecera de
  autenticación. Dentro del entorno de artifacts esto lo intercepta y
  autentica el propio sandbox de Claude.ai; **desplegado como sitio estático
  real (GitHub Pages) esta llamada no funcionaría** (CORS + falta de clave).
  Es exactamente el antipatrón que la sección 22 del encargo prohíbe. Se
  sustituye por una capa `clinical-extraction-service.js` que: (a) nunca
  incluye claves en el frontend; (b) intenta un endpoint configurable
  (pensado para una función serverless que el propio hospital/farmacéutico
  despliegue); (c) si no hay endpoint configurado o falla, cae a **modo
  demostración** claramente etiquetado, sin bloquear la herramienta ni
  simular resultados como si fueran reales.
- Componente `Tooltip` definido pero no utilizado en ningún render (código
  muerto) — se elimina en la reescritura.

### Añadir (no existía)
- Flujo de 7 pasos explícito con indicador de progreso (hoy son 3 fases).
- Pantalla de revisión de variables agrupadas por confianza, con evidencia
  textual desplegable y acciones aceptar/corregir/rechazar/desconocido.
- Sección "Necesidades identificadas" agrupadas en Capacidad / Motivación /
  Oportunidad.
- Catálogo de intervenciones seleccionables (no solo texto fijo), con
  niveles de disponibilidad (básica / avanzada / dependiente del centro),
  posibilidad de personalizar texto, prioridad, responsable y seguimiento, y
  de añadir intervenciones propias.
- Informe de extracción IA independiente del informe clínico (trazabilidad
  IA vs. confirmado, para validación futura).
- Documentación: `README.md`, `AI_POLICY.md`, `PRIVACY.md`, `CHANGELOG.md`,
  `CLINICAL_MODEL.md`, `ARCHITECTURE.md`.
- Aviso de privacidad visible ("no introduzca datos directamente
  identificativos") y ajuste del guardado de casos para no persistir el
  texto narrativo de la HCE por defecto.

## 3. Decisión de tecnología

Vanilla HTML/CSS/JS con módulos ES (`<script type="module">`), sin build
step, sin dependencias de CDN de terceros. Motivo: es la misma decisión ya
tomada y validada en `cmo-vih-app` (que sí se ha usado en producción/consulta
real), cumple la sección 26 del encargo (mantenimiento sencillo, pocas
dependencias, funciona bien en GitHub Pages, código comprensible) y evita
introducir un framework sin ventaja clara para una herramienta de este
tamaño.

Ver `ARCHITECTURE.md` para el diseño detallado de módulos.
