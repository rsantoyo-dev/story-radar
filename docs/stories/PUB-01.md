---
id: PUB-01
feature: FEAT-PUB-001
status: review
board: instagram-publishing.kanban.md
tags: [publishing, review, p0]
---

# PUB-01 — Identificar publicaciones listas para publicar

**Estado:** En revisión / QA · **Feature:** [Publicación desde el SaaS](../features/instagram-publishing.md)

**Como** editor, **quiero** identificar publicaciones listas para publicar, **para** entregar contenido aprobado con trazabilidad y control del envío.

**Prioridad:** P0 · **Dependencias:** IG-01 a IG-06 como base existente

**Criterios de aceptación**

- La aprobación vigente del texto y de todas las imágenes seleccionadas hace que el conjunto sea candidato. En el recorrido documental se utiliza su aprobación final conjunta; aprobar solo el guion nunca basta.
- El servidor determina “Lista para publicar” mediante un snapshot del conjunto exacto, política vigente, evidencia, permisos de uso, archivos accesibles y destino configurado. Muestra los motivos que impiden habilitarlo.
- Crear la candidatura no envía contenido a Meta ni agenda una publicación. Cada cambio al texto público, selección de assets o destino exige revalidación y, si modifica el contenido aprobado, nueva aprobación.
- Los borradores y publicaciones existentes conservan su historial. El estado de entrega pertenece a una intención de publicación y no sustituye el estado editorial del draft.

## Implementación — 9 de septiembre de 2026

- Creative Studio y el recorrido documental muestran «Validate publication candidate» para el lote visible. La validación autenticada utiliza el tema activo, draft y lote; no acepta texto ni selección de versiones arbitrarios del cliente.
- El servidor verifica aprobación del guion y todas las unidades, correspondencia texto/imagen, versión, vigencia de inputs, evidencia y permisos mediante las comprobaciones de exportación existentes. El documental exige la revisión final conjunta y evidencia fotográfica vigente.
- Se leen los archivos aprobados, verifican dimensiones reales 1080×1350, formato estático y orientación, y calculan hashes SHA-256. Se vuelve a consultar el conjunto y destino para detectar cambios durante la lectura. Los errores de almacenamiento no exponen URLs ni secretos.
- El snapshot de validación incluye el contenido completo del draft y lote, evidencia, identidad de tema/cuenta/reconexión y token de fuente/política en su hash. El navegador recibe únicamente texto, versiones, hashes y motivos seguros.
- La candidatura es una evaluación puntual, no una intención persistida ni autorización de envío. La persistencia del paquete y de las intenciones corresponde a PUB-03/PUB-07. No hay migración ni cambios de aprobación o historial.
- «Lista para publicar» permanece bloqueado hasta contar con verificación real de capacidad en PUB-02. Tener insights o un permiso guardado no demuestra capacidad de envío. Preparar JPEG y comprobar límites específicos de Meta corresponde a PUB-03.
- La UI descarta resultados al cambiar el conjunto local o recuperar el foco; muestra fecha de comprobación y permite revalidar. La validación no llama a Meta, publica ni programa.

Validación: `npm test` (543 pruebas, incluidas 10 de PUB-01), `npm run lint`, `npm run build` y `npx tsc --noEmit` pasan. Las pruebas de dominio y orquestación cubren aprobación parcial, texto y versión modificados, revisión documental, permisos, archivos, cambios concurrentes, hashes estables y errores saneados. Pendiente de revisión visual con datos reales.
