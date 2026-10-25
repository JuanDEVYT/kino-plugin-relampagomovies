# Relámpago Movies — plugin para Kino

Plugin de Kino para películas y series en español/latino. El catálogo usa TMDB como fuente de metadatos y `relampagomovies.com` se usa al momento de reproducir.

## Instalación

En Kino, añade:

```text
JuanDEVYT/kino-plugin-relampagomovies
```

Se requiere Kino **0.9.50 o superior** (`apiVersion: 6`).

## Funcionamiento

- **Inicio, búsqueda y temporadas:** TMDB. No dependen del índice de Relámpago Movies ni de `kino.browser.page`.
- **Reproducción:** al pulsar *Play*, el plugin prueba capturar el reproductor de `relampagomovies.com` con `kino.browser.capture`. Esta API se ejecuta solo dentro de Kino, no en las pruebas del SDK.
- **TMDB:** primero usa la integración nativa de Kino. Si no hay clave configurada en Kino, emplea el fallback HTTP. En Ajustes se puede introducir una clave TMDB personal opcional.

## Limitaciones conocidas

`relampagomovies.com` protege sus páginas con Cloudflare y no proporciona API pública. El catálogo y las pruebas son verificables; la extracción de vídeo se debe comprobar desde un dispositivo con Kino, pues el navegador de captura no existe en el SDK de escritorio.

## Desarrollo y pruebas

```bash
node sdk/validate.mjs .
node test/plugin.test.mjs
```

Los tests verifican Home, búsqueda, paginación, episodios y ajustes contra TMDB. No prueban `resolve`, porque `kino.browser.capture` solo está disponible en la app.
