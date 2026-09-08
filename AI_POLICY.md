# Política de uso de inteligencia artificial

## Principio fundamental

La IA **no realiza la estratificación**. La IA puede leer el texto de la
historia clínica pegado por el farmacéutico y **sugerir** qué variables
parecen presentes, señalar información contradictoria e identificar datos
ausentes. Nada de lo que propone la IA se usa en el cálculo hasta que el
farmacéutico lo confirma explícitamente.

En todo momento la aplicación distingue entre **dato extraído por IA** y
**dato clínico confirmado por el profesional**. La puntuación de
estratificación (`assets/modules/cmo-engine.js`) solo lee variables
confirmadas.

## Regla anti-alucinaciones

La ausencia de información en el texto **no equivale a una respuesta
negativa**. Si la historia clínica no menciona algo, el estado de esa
variable es "No encontrada" (`not_found`), nunca "No". La aplicación nunca
completa silenciosamente un dato no presente en el texto.

Cada resultado de extracción usa uno de estos cuatro estados:

- **found** — mención clara y explícita.
- **uncertain** — mención ambigua, incompleta o con lenguaje dubitativo.
- **not_found** — no hay ninguna mención relacionada.
- **contradictory** — hay menciones que se contradicen entre sí.

Y siempre incluye: `value`, `confidence` (0-1), `evidence` (fragmento
textual literal), `reasoning_summary` (explicación breve y verificable) y
`needs_human_confirmation: true`.

## Arquitectura (sin claves de API en el frontend)

`assets/modules/clinical-extraction-service.js` es la única capa que
gestiona la extracción. Nunca contiene ni transmite una clave de proveedor
de IA. Su comportamiento:

1. Si `window.CMO_APP_CONFIG.extractionEndpointUrl` está configurado, envía
   el texto clínico y la definición de las variables (`config.js`) a ese
   endpoint mediante `POST` y espera de vuelta un array de resultados con la
   forma descrita arriba. Ese endpoint debe ser una función/backend propio
   del hospital que reenvíe la petición al proveedor de IA que decida, con
   su clave del lado servidor. Esta aplicación no sabe ni necesita saber qué
   proveedor es: puede cambiarse sin tocar la lógica clínica ni la interfaz.
2. Si no hay endpoint configurado, la aplicación funciona en **modo
   demostración**: una búsqueda heurística de palabras clave totalmente
   local (`assets/modules/heuristic-extraction.js`), determinista y
   auditable. **No es un modelo de lenguaje** y se etiqueta siempre como
   "Modo demostración" en la interfaz — nunca se presenta como si fuera un
   resultado de IA real.
3. Si la petición al endpoint falla (red, error del servidor, formato
   inesperado), se muestra: *"No ha sido posible realizar la extracción
   automática. Puede continuar la estratificación manualmente."* La
   herramienta nunca se bloquea: la estratificación manual completa está
   siempre disponible, con o sin IA.

## Confirmación humana obligatoria

Tras la extracción, el farmacéutico revisa cada variable agrupada por nivel
de confianza (alta / dudosa / no encontrada / contradictoria), puede ver la
evidencia textual que justifica cada propuesta, y debe **aceptar, corregir o
marcar como desconocida** cada una. No existe ningún botón que confirme en
bloque información dudosa, incompleta o contradictoria — el "Confirmar
seleccionadas" solo opera sobre el grupo de alta confianza, y siempre de
forma explícita.

## Validación futura

`assets/modules/data-layer.js` (`buildValidationLog`) registra, por
variable, el valor propuesto por la IA, su confianza, el valor finalmente
confirmado, si coinciden y si fue corregido por el farmacéutico. Esto
permite en el futuro evaluar la precisión real de la extracción automática
sin necesitar base de datos por ahora (ver `ARCHITECTURE.md`).

## Limitaciones

Esta es una herramienta de apoyo a la decisión. No constituye un dispositivo
médico certificado, no emite diagnósticos y no sustituye el juicio clínico
del farmacéutico. El profesional es responsable de la estratificación final
y del plan de atención farmacéutica.
