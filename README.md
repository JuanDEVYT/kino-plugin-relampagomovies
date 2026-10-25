# Relámpago Movies — Plugin de Kino

Plugin para [Kino](https://kinotvapp.github.io/) que permite ver películas y series en español y latino desde [relampagomovies.com](https://relampagomovies.com/).

## Características

- Catálogo de **Películas** y **Series**.
- Búsqueda con soporte para `scopedSearch`.
- Reproducción directa de embeds (mediadelivery / bunnycdn / filemoon) y fallback inteligente con `kino.browser.capture` de Kino.
- Acceso a través de Cloudflare usando `kino.browser.page` (Kino 0.9.50+ / `apiVersion 6`).
- Soporte para descargas sin conexión (`download`).
- Ajustes con comprobación de estado de conexión y limpieza de caché.
- Tema visual personalizado a juego con los colores del sitio.

## Instalación en Kino

1. Abre **Kino** en tu dispositivo Android o Android TV.
2. Ve a **Ajustes** → **Plugins** → **Añadir plugin**.
3. Escribe el repositorio:
   ```text
   JuanDEVYT/kino-plugin-relampagomovies
   ```
4. Acepta los permisos para comenzar a reproducir.

## Desarrollo y Validación

Para validar el plugin con el SDK oficial de Kino:

```bash
node sdk/validate.mjs .
```
