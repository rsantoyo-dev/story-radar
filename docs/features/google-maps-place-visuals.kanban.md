# Lugares y mapas verificables — FEAT-GMAP-001

**Feature y criterios:** [google-maps-place-visuals.md](google-maps-place-visuals.md)

## Backlog

### GMAP-09 — Estilizar sin inventar la geografía

  - priority: low
  - tags: [maps, illustration, p2]

## Por hacer

### GMAP-01 — Definir servicios y usos habilitables

  - priority: high
  - tags: [maps, providers, p0]

### GMAP-02 — Configurar acceso y presupuesto por marca

  - priority: high
  - tags: [maps, budget, p0]

### GMAP-03 — Resolver lugares globales con evidencia

  - priority: high
  - tags: [maps, identity, p0]

### GMAP-04 — Vincular puntos, áreas y tramos con el hecho narrado

  - priority: high
  - tags: [maps, factuality, p0]

### GMAP-05 — Preparar mapas reales exportables

  - priority: high
  - tags: [maps, composition, p0]

### GMAP-06 — Buscar fotografías del lugar y evaluar su uso

  - priority: high
  - tags: [maps, photography, p0]

### GMAP-07 — Integrar la preparación en el mismo carrusel

  - priority: high
  - tags: [maps, creative, p0]

### GMAP-08 — Revisar y exportar el conjunto exacto

  - priority: high
  - tags: [maps, review, p0]

### GMAP-10 — Validar exactitud, cobertura y operación

  - priority: high
  - tags: [maps, qa, p0]

## En progreso

## En revisión / QA

### GMAP-00 — Consultar un lugar, traer mapa y fotos y comparar composiciones

  - priority: high
  - tags: [maps, prototype, qa]
  - Implementación y catorce pruebas específicas terminadas; endpoint demo comprobado en localhost.
  - Corregida la comparación de ámbito con acentos/guiones; el resultado distingue discrepancias de municipio, región, país y nombre del lugar.
  - API real comprobada: Bibliothèque Saint-Luc devuelve un mapa y dos fotos candidatas; la búsqueda del bosque devolvió otros municipios y se excluyó.
  - Consulta real `vision school`: un mapa y una foto como candidato con identidad no verificada; se permite inspeccionar un único punto de interés local aunque el nombre difiera.
  - Demo corregido: el área de imagen conserva su altura y no se superpone con el pie; verificado en Chrome a 1200 y 390 px, sin llamadas Google. Lint y build pasan.
  - Pendiente: revisión editorial, otra región y decisión de uso de Google para exportación. El vínculo de proximidad y el mapa abierto en draft están cubiertos en GMAP-11.
  - GMAP-01 a GMAP-10 permanecen pendientes; el preview no guarda ni aprueba un carrusel.

### GMAP-11 — Completar el piloto dentro del draft con evidencia de dirección

  - priority: high
  - tags: [maps, creative, source-address, qa]
  - Implementado: dirección citada, relación de proximidad, resolución independiente OSM y mapa en la unidad correspondiente.
  - Composiciones conceptuales en las otras unidades; guion e historial conservados. Demo relegado a diagnóstico.
  - Verificado en localhost con Fête des récoltes y su dirección de referencia; las imágenes nuevas esperan aprobación editorial.
  - La exportación de fotografías Google y la cobertura mundial siguen pendientes en sus historias originales.

## Hecho
