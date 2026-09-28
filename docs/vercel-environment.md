# Configuración de Production en Vercel

Usa `.env.vercel` para mantener los modelos y opciones de producción pareados
con Vercel. `.env.local` sigue siendo la configuración del desarrollo local.
`.env.test` pertenece al entorno de pruebas de Next.js y no se usa para Vercel.
Next.js no carga `.env.vercel` automáticamente: lo lee nuestro script de sincronización.

## Preparación

```bash
cp .env.vercel.example .env.vercel
npx vercel@60.0.0 login
npx vercel@60.0.0 link
```

Selecciona el proyecto `story-radar` y su equipo. El script comprueba la
identidad contra `.vercel/project.json` antes de escribir. Utiliza la sesión
de la CLI de Vercel; no guarda tokens en el repositorio. La CLI está fijada en
la versión 60.0.0 y `npx` la descarga si todavía no está disponible.

## Uso habitual

Edita `.env.vercel` cuando quieras cambiar Production, y ejecuta:

```bash
npm run env:vercel:check
npm run env:vercel:sync
```

`check` consulta Vercel sin escribir. Sale con código 1 si hay valores distintos,
variables ausentes o valores sensibles sin una comprobación previa.
`sync` crea o actualiza únicamente las variables incluidas en `.env.vercel`,
en Production. Conserva las variables que no aparecen en el archivo.
No elimina variables al quitar una línea del archivo.

Los valores nuevos se activan con un nuevo despliegue. Para sincronizar y
desplegar el código actual en una sola operación:

```bash
npm run deploy:vercel
```

Este comando se detiene si falla la sincronización. Los despliegues iniciados
directamente desde Git o el dashboard de Vercel no ejecutan este comando:
sincroniza antes de iniciarlos. Editar el archivo no modifica Vercel por sí solo.

## Alcance y comprobación

El archivo admite modelos, proveedores, banderas y los límites de AI/Creative
ya usados por la app. La lista explícita está en `scripts/vercel-env.mjs`.
Para añadir una opción admitida basta con agregar su línea a `.env.vercel`.
No contiene credenciales, conexiones de base de datos, URLs de OAuth ni
variables automáticas como `VERCEL_OIDC_TOKEN`; estas permanecen en Vercel.
`RADAR_APP_URL` debe seguir siendo `https://story-radar.vercel.app` en Production.
El tope de emojis y otros ajustes por Topic siguen en sus perfiles de base de datos.

Muchas variables actuales son de tipo Sensitive. Vercel no devuelve sus valores,
ni siquiera al exportar el entorno. Tras cada sincronización guardamos una
huella de la configuración y la metadata de cada variable en
`.vercel/env-production-sync.json`. `check` detecta cambios en el archivo local,
variables eliminadas y modificaciones posteriores en Vercel comparando esas
referencias. Esto es una comprobación de la última escritura aceptada y su
metadata; no afirma haber leído el valor oculto. En otra máquina, la primera
sincronización crea su propia referencia.

Si una variable administrada comparte una misma entrada entre Production y
Preview, el comando se detiene antes de escribir. Sepárala en el dashboard para
que Production tenga su propia entrada; el script no modifica Preview.

`.env.vercel` y la referencia de sincronización están ignorados por Git. El
ejemplo y el script sí se versionan. Para compartir nuevos valores predeterminados
entre equipos, actualiza también `.env.vercel.example` sin incluir secretos.
