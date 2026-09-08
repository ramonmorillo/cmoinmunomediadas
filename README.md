# CMO Inmunomediadas

Herramienta de apoyo a la decisión para la **estratificación CMO-MAPEX** y
el **plan de atención farmacéutica** en pacientes con enfermedades
inflamatorias inmunomediadas (dermatológicas, músculo-esqueléticas y
gastro-intestinales), en el ámbito de la Farmacia Hospitalaria.

Cubre el proceso completo: **historia clínica → extracción automática (IA
opcional) → validación por el farmacéutico → completado manual → cálculo
de estratificación → necesidades → intervenciones → informe final.**

La IA nunca decide la estratificación por sí sola: solo sugiere, con
evidencia y estados de confianza explícitos. El farmacéutico confirma,
corrige o descarta cada variable. La puntuación se calcula exclusivamente a
partir de variables confirmadas. Ver `AI_POLICY.md`.

## Uso

Aplicación estática sin dependencias de build. Para desarrollo local:

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000`. (Los módulos ES requieren servirse por HTTP,
no funcionan abriendo `index.html` directamente con `file://`.)

## Despliegue en GitHub Pages

1. En el repositorio, vaya a **Settings → Pages**.
2. En "Build and deployment", seleccione **Deploy from a branch**, rama
   `main` (o la rama por defecto que corresponda), carpeta `/ (root)`.
3. La aplicación quedará disponible en
   `https://ramonmorillo.github.io/cmoinmunomediadas/`.

No requiere variables de entorno ni build step: es HTML/CSS/JS estático.

## Extracción por IA real (opcional)

Por defecto la aplicación funciona en **modo demostración** (heurística
local de palabras clave, claramente etiquetada como tal, sin llamadas
externas). Para usar un modelo de IA real, despliegue su propio backend
(función serverless) que reciba `{ clinicalText, variables, instructions }`
y devuelva `{ results: [...] }`, y configure su URL en `index.html`:

```html
<script>
  window.CMO_APP_CONFIG = { extractionEndpointUrl: 'https://mi-backend.ejemplo.org/extraer' };
</script>
```

Nunca incluya claves de API en el frontend. Ver `AI_POLICY.md` y
`ARCHITECTURE.md`.

## Estructura del proyecto

```
index.html
assets/
  styles.css
  app.js                                orquestador (estado, eventos, navegación)
  modules/
    config.js                           modelo clínico (fuente de verdad)
    cmo-engine.js                       cálculo de estratificación
    clinical-extraction-service.js      orquestación de extracción IA/demo
    heuristic-extraction.js             heurística local (modo demostración)
    needs-mapper.js                     variables -> necesidades CMO
    interventions-catalog.js            catálogo de intervenciones
    data-layer.js                       estado, trazabilidad, privacidad
    export-layer.js                     informes, copiar, exportar
    ui.js                               plantillas de interfaz
```

## Documentación

- `ANALYSIS.md` — auditoría de la herramienta original (mantener/mejorar/
  refactorizar/añadir) previa a esta reescritura.
- `ARCHITECTURE.md` — arquitectura de módulos y flujo de datos.
- `CLINICAL_MODEL.md` — modelo clínico completo (variables, pesos,
  umbrales, reglas especiales).
- `AI_POLICY.md` — qué hace y qué no hace la IA, y cómo se garantiza que no
  alucina información ausente.
- `PRIVACY.md` — qué se almacena, qué no, y por qué.
- `CHANGELOG.md` — historial de versiones.

## Referencia de diseño

El patrón visual, de navegación y de arquitectura modular se ha inspirado en
[`cmo-vih-app`](https://github.com/ramonmorillo/cmo-vih-app), adaptado al
modelo clínico específico de enfermedades inmunomediadas (paleta, contenido
y lógica propios, no una copia).

## Aviso

Herramienta de apoyo a la decisión clínica. No sustituye el juicio
profesional del farmacéutico ni constituye un dispositivo médico
certificado. No introduzca datos directamente identificativos del paciente
(ver `PRIVACY.md`).
