# FEAT-SCA-001 — Contenido editable y fotos por noticia

Una noticia RSS, propuesta por IA o escrita manualmente puede tener una edición
propia del topic y fotos de referencia. El flujo continúa siendo noticia → brief
→ draft → aprobación → imágenes. Las fotos de noticia no son referencias globales
de marca ni se asignan automáticamente a todos los slides.

## Uso

1. Abrir **View content → Edit content**. Modificar título/texto y pulsar
   **Save edition**. Una edición nueva conserva el contenido original y todas las
   ediciones anteriores. **Recent versions** muestra las últimas 20 y permite
   copiar una al editor; **Use original in editor** permite restaurar el original
   guardando otra edición.
2. En **Story reference photos**, subir JPG, PNG o WebP (hasta 15 MB), con nombre,
   descripción, procedencia y confirmación de permiso para usar y enviar la foto
   al proveedor. El servidor valida la imagen, elimina metadatos al normalizar a
   WebP y conserva el archivo privado en R2.
3. Crear o abrir el draft. En **Story photos for this slide**, elegir hasta tres
   fotos y su función: sujeto/producto (`subject`), resultado (`result`), paso
   (`step`), lugar (`place`) o estilo (`style`). Guardar y aprobar el draft.
4. Generar imágenes. El proveedor recibe archivos reales, ordenados después de
   personajes y referencias de marca; el prompt identifica el propósito de cada
   foto. El resultado muestra **Story photo inputs** y conserva los metadatos y
   hashes de entrada en su snapshot privado.

## Historias implementadas

- **SCA-01 — Edición editorial:** título y texto modificables sin sobrescribir la
  noticia compartida entre topics; control de revisión para evitar pérdidas por
  guardados concurrentes. El brief recibe la edición y su procedencia editorial.
- **SCA-02 — Biblioteca de fotos:** carga privada por topic/noticia, vista previa
  autenticada y retiro de uso futuro conservando archivos históricos.
- **SCA-03 — Referencias por slide:** selección manual y propósito persistidos
  dentro de la versión del draft. Cambiar la selección invalida el arrastre de
  imágenes anteriores; editar sólo texto conserva el flujo de actualización.
- **SCA-04 — Generación y trazabilidad:** endpoint de referencia cuando hay fotos,
  envío de bytes, validación de pertenencia, permiso y hash; reutilización del
  snapshot al reintentar/editar una imagen. No se exponen object keys al cliente.
- **SCA-05 — Vigencia:** editar el contenido hace obsoletos brief/drafts previos;
  se requiere un brief vigente para aprobar/generar. El token documental también
  cambia con las ediciones, manteniendo su valor anterior en noticias sin editar.

## Límites de esta entrega

- Las fotos se adjuntan manualmente; no se extraen automáticamente del artículo.
- Una foto de referencia puede ser modificada por el modelo. No equivale a
  reproducción documental de sus píxeles ni prueba hechos actuales.
- Las composiciones documentales/mapas mantienen su política de fidelidad. Si un
  slide de esa clase tiene fotos elegidas para IA, se informa el conflicto antes
  de crear el lote; las referencias no se descartan silenciosamente.
- Se conservan la procedencia y el título original de la noticia en el radar;
  la edición es el contenido de trabajo que recibe Creative Studio.
- No se hacen llamadas pagadas al subir fotos o editar texto.

## Persistencia y validación

Migración `0069_wet_lake.sql`: `story_content_revisions`,
`story_reference_photos` y `creative_units.story_references`. Los archivos y
metadatos de fotos son inmutables; retirar una foto revoca su uso futuro.
Las imágenes generadas usan el `reference_snapshot` existente, con `story` como
colección adicional, compatible con snapshots históricos.

Pruebas automatizadas cubren guardados concurrentes en PostgreSQL/PGlite,
aislamiento entre topics, validación de entrada, permisos, hashes, orden de
archivos enviados al adaptador fal y cambios de selección. La revisión visual de
un resultado real requiere generar una imagen desde la aplicación.

### Restauración editorial de referencias

Las fotos de sujeto, resultado, paso y lugar se usan como evidencia visual para
una restauración editorial hiperrealista. Se conserva la geometría y material de
utensilios/equipos, la superficie de la mesa cuando es parte de la referencia,
la apariencia de la comida y su distribución relativa. Se permite mejorar luz,
exposición, balance de blancos, encuadre, profundidad de campo, fondo no esencial
y styling de acuerdo con la identidad visual del topic. Los elementos de marca
(papel, stickers y tipografía) rodean sujetos que permanecen fotográficos.
No se exige copiar píxeles ni se autoriza inventar ingredientes o cambiar el paso
representado. Esta política es genérica; Chez Ricard aporta su dirección artística
mediante el perfil existente. Las referencias exclusivamente de estilo mantienen
su propósito y no imponen sujetos ni restauración fotográfica.
