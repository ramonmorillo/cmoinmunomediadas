# Privacidad y tratamiento de la información

## No introduzca datos directamente identificativos del paciente

La aplicación lo recuerda de forma visible en el paso de importación de
historia clínica. No introduzca nombre, DNI, número de historia clínica,
teléfono, dirección u otros identificadores directos. Si necesita
diferenciar casos, use el campo opcional "Identificador pseudonimizado del
paciente" con un código interno (por ejemplo, un número de caso), nunca un
identificador real.

## Qué se almacena y qué no

- **El texto de la historia clínica pegado en el paso 2 no se almacena.**
  Vive únicamente en la memoria del navegador durante la sesión activa. No
  se escribe en `localStorage`, no se envía a ningún sitio salvo, si usted
  configura un `extractionEndpointUrl` propio, al endpoint de extracción que
  usted mismo haya desplegado (bajo su responsabilidad y la de su centro).
- **Los fragmentos de evidencia textual** que justifican cada hallazgo de
  IA (citas literales del texto pegado) tampoco se guardan de forma
  persistente: existen solo en memoria durante la sesión y no se incluyen
  al guardar un caso.
- **El guardado opcional de casos** ("Guardar caso" en el informe final)
  almacena en `localStorage` de su navegador **solo datos estructurados**:
  variables confirmadas, resultado de la estratificación e intervenciones
  seleccionadas. Nunca se guarda el texto narrativo de la historia clínica
  ni las citas de evidencia. Puede eliminar cualquier caso guardado desde
  "Cargar caso".
- Nada se envía a servidores de Anthropic ni de ningún otro proveedor de IA
  salvo que usted configure explícitamente un endpoint propio.

## Botón "Nueva estratificación"

Borra completamente el estado de la sesión: historia clínica pegada,
extracción, variables, confirmaciones, puntuación, intervenciones e informe.
No requiere recargar la página. Los casos previamente guardados con
"Guardar caso" no se ven afectados por este botón (son datos estructurados
independientes; elimínelos manualmente desde "Cargar caso" si lo desea).

## Uso de IA

Ver `AI_POLICY.md` para el detalle de qué hace y qué no hace la extracción
automática, y cómo se transmite (o no) la información a un proveedor de IA.

## Responsabilidad profesional

Esta es una herramienta de apoyo a la decisión clínica, no un repositorio de
historias clínicas ni un sistema de información hospitalario. El
cumplimiento de la normativa de protección de datos aplicable (RGPD, LOPDGDD
u otra normativa local) en el uso de esta herramienta es responsabilidad del
profesional y del centro que la utiliza.
