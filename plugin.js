/// <reference path="./kino.d.ts" />

// Plugin de Kino para Relámpago Movies (relampagomovies.com)
// Catálogo enriquecido con TMDB (kino.tmdb nativo)
// Reproductor directo y captura dinámica con kino.browser.capture (al pulsar Play)

const SITE_BASE = "https://relampagomovies.com";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const TMDB_BACKDROP = "https://image.tmdb.org/t/p/w780";
const LANG = "es-MX";

// ──────────────────────────────────────────────────────────────
// HELPERS Y REF ENCODING
// ──────────────────────────────────────────────────────────────

function encodeRef(data) {
  return JSON.stringify(data);
}

function decodeRef(ref) {
  try {
    return JSON.parse(ref);
  } catch {
    return null;
  }
}

function slugify(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapTmdbItem(item, mediaType) {
  const type = mediaType || item.media_type || (item.first_air_date ? "series" : "movie");
  const isSeries = type === "series" || type === "tv";
  const title = item.title || item.name || item.original_title || item.original_name || "";
  const yearStr = item.release_date || item.first_air_date || "";
  const year = yearStr ? parseInt(yearStr.slice(0, 4), 10) : undefined;
  const rating = typeof item.vote_average === "number" && item.vote_average > 0
    ? Math.round(item.vote_average * 10) / 10
    : undefined;

  return {
    id: (isSeries ? "tv." : "movie.") + item.id,
    title,
    type: isSeries ? "series" : "movie",
    poster: item.poster_path ? TMDB_IMG + item.poster_path : undefined,
    backdrop: item.backdrop_path ? TMDB_BACKDROP + item.backdrop_path : undefined,
    year,
    rating,
    overview: item.overview || undefined,
    ref: encodeRef({
      tmdbId: item.id,
      type: isSeries ? "tv" : "movie",
      title,
      year,
      originalTitle: item.original_title || item.original_name || title
    })
  };
}

// ──────────────────────────────────────────────────────────────
// HOME (PORTADA CON TMDB NATIVO)
// ──────────────────────────────────────────────────────────────

export async function home() {
  if (typeof kino.tmdb !== "function") {
    throw kino.error("unavailable", "Kino 0.9.53+ requerido para TMDB", {
      userMessage: "Actualiza Kino a la versión 0.9.53 o superior para usar este plugin."
    });
  }

  const cached = kino.storage.get("home_catalog");
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {}
  }

  const rows = [];

  // 1. Tendencias en Películas
  try {
    const popMovies = await kino.tmdb("/trending/movie/week", { language: LANG });
    if (popMovies && Array.isArray(popMovies.results) && popMovies.results.length > 0) {
      rows.push({
        id: "peliculas-tendencia",
        title: "Películas en Tendencia",
        items: popMovies.results.slice(0, 20).map((i) => mapTmdbItem(i, "movie")),
        browse: encodeRef({ list: "trending_movie", page: 2 })
      });
    }
  } catch (e) {
    kino.log("Error al cargar trending movies de TMDB", e);
  }

  // 2. Tendencias en Series
  try {
    const popTv = await kino.tmdb("/trending/tv/week", { language: LANG });
    if (popTv && Array.isArray(popTv.results) && popTv.results.length > 0) {
      rows.push({
        id: "series-tendencia",
        title: "Series Populares",
        items: popTv.results.slice(0, 20).map((i) => mapTmdbItem(i, "series")),
        browse: encodeRef({ list: "trending_tv", page: 2 })
      });
    }
  } catch (e) {
    kino.log("Error al cargar trending TV de TMDB", e);
  }

  // 3. Estrenos de cine
  try {
    const nowPlaying = await kino.tmdb("/movie/now_playing", { language: LANG });
    if (nowPlaying && Array.isArray(nowPlaying.results) && nowPlaying.results.length > 0) {
      rows.push({
        id: "estrenos-cine",
        title: "Estrenos Recientes en Cine",
        items: nowPlaying.results.slice(0, 20).map((i) => mapTmdbItem(i, "movie")),
        browse: encodeRef({ list: "now_playing", page: 2 })
      });
    }
  } catch (e) {
    kino.log("Error al cargar now_playing de TMDB", e);
  }

  // 4. Animación familiar
  try {
    const animation = await kino.tmdb("/discover/movie", {
      language: LANG,
      with_genres: "16",
      sort_by: "popularity.desc"
    });
    if (animation && Array.isArray(animation.results) && animation.results.length > 0) {
      rows.push({
        id: "animacion",
        title: "Animación y Familiar",
        items: animation.results.slice(0, 20).map((i) => mapTmdbItem(i, "movie")),
        browse: encodeRef({ list: "genre_16", page: 2 })
      });
    }
  } catch (e) {
    kino.log("Error al cargar animación", e);
  }

  if (rows.length > 0) {
    try {
      kino.storage.set("home_catalog", JSON.stringify(rows), { ttlMs: 12 * 60 * 60 * 1000 });
    } catch {}
  }

  return rows;
}

// ──────────────────────────────────────────────────────────────
// BUSCADOR
// ──────────────────────────────────────────────────────────────

export async function search(query) {
  if (query && query.within) {
    return null;
  }

  const q = (query && query.q ? String(query.q) : "").trim();
  if (!q) return [];

  try {
    const res = await kino.tmdb("/search/multi", {
      query: q,
      language: LANG,
      include_adult: "false"
    });

    if (!res || !Array.isArray(res.results)) return [];

    return res.results
      .filter((i) => i.media_type === "movie" || i.media_type === "tv")
      .slice(0, 30)
      .map((i) => mapTmdbItem(i, i.media_type === "tv" ? "series" : "movie"));
  } catch (err) {
    kino.log("Error en search TMDB", err);
    return [];
  }
}

// ──────────────────────────────────────────────────────────────
// BROWSE (VER MÁS)
// ──────────────────────────────────────────────────────────────

export async function browse(ref) {
  const data = decodeRef(ref);
  if (!data || !data.list) return { items: [] };

  const page = data.page || 1;
  let path = "/trending/movie/week";
  const params = { language: LANG, page: String(page) };

  if (data.list === "trending_movie") path = "/trending/movie/week";
  else if (data.list === "trending_tv") path = "/trending/tv/week";
  else if (data.list === "now_playing") path = "/movie/now_playing";
  else if (data.list.startsWith("genre_")) {
    path = "/discover/movie";
    params.with_genres = data.list.replace("genre_", "");
    params.sort_by = "popularity.desc";
  }

  try {
    const res = await kino.tmdb(path, params);
    if (!res || !Array.isArray(res.results)) return { items: [] };

    const mediaType = data.list.includes("tv") ? "series" : "movie";
    const items = res.results.map((i) => mapTmdbItem(i, mediaType));
    const totalPages = res.total_pages || 1;

    return {
      items,
      next: page < totalPages && page < 20 ? encodeRef({ list: data.list, page: page + 1 }) : undefined
    };
  } catch (e) {
    kino.log("Error en browse", e);
    return { items: [] };
  }
}

// ──────────────────────────────────────────────────────────────
// EPISODIOS (PARA SERIES DE TV)
// ──────────────────────────────────────────────────────────────

export async function episodes(ref) {
  const data = decodeRef(ref);
  if (!data || !data.tmdbId) return [];

  try {
    const show = await kino.tmdb(`/tv/${data.tmdbId}`, { language: LANG });
    if (!show || !Array.isArray(show.seasons)) return [];

    const epList = [];

    for (const s of show.seasons) {
      if (s.season_number <= 0) continue; // omitir especiales

      try {
        const seasonData = await kino.tmdb(`/tv/${data.tmdbId}/season/${s.season_number}`, { language: LANG });
        if (seasonData && Array.isArray(seasonData.episodes)) {
          for (const ep of seasonData.episodes) {
            epList.push({
              season: ep.season_number,
              episode: ep.episode_number,
              title: ep.name ? `${ep.episode_number}. ${ep.name}` : `Episodio ${ep.episode_number}`,
              overview: ep.overview || undefined,
              ref: encodeRef({
                tmdbId: data.tmdbId,
                title: data.title,
                originalTitle: data.originalTitle,
                year: data.year,
                type: "tv",
                season: ep.season_number,
                episode: ep.episode_number
              })
            });
          }
        }
      } catch (err) {
        kino.log(`Error cargando temporada ${s.season_number}`, err);
      }
    }

    return epList;
  } catch (e) {
    kino.log("Error cargando temporadas de serie", e);
    return [];
  }
}

// ──────────────────────────────────────────────────────────────
// RESOLVE (REPRODUCCIÓN AL PULSAR PLAY)
// ──────────────────────────────────────────────────────────────

export async function resolve(ref) {
  const data = decodeRef(ref);
  if (!data) throw kino.error("not_found", "Referencia no válida");

  const titleSlug = slugify(data.title);
  const origSlug = slugify(data.originalTitle);

  // Generar posibles rutas en relampagomovies.com
  const candidates = [];
  if (data.type === "tv" && data.season && data.episode) {
    candidates.push(`${SITE_BASE}/serie/${titleSlug}-temporada-${data.season}-capitulo-${data.episode}`);
    candidates.push(`${SITE_BASE}/${titleSlug}-temporada-${data.season}-capitulo-${data.episode}`);
    if (origSlug && origSlug !== titleSlug) {
      candidates.push(`${SITE_BASE}/serie/${origSlug}-temporada-${data.season}-capitulo-${data.episode}`);
    }
  } else {
    candidates.push(`${SITE_BASE}/pelicula/${titleSlug}`);
    candidates.push(`${SITE_BASE}/${titleSlug}`);
    if (origSlug && origSlug !== titleSlug) {
      candidates.push(`${SITE_BASE}/pelicula/${origSlug}`);
      candidates.push(`${SITE_BASE}/${origSlug}`);
    }
  }

  // 1. Intento de captura directa con kino.browser.capture
  // En resolve(), Kino garantiza que el usuario pulsó Play, por lo que browser.capture está permitido
  if (kino.browser && kino.browser.capture) {
    for (const url of candidates) {
      kino.log("Intentando reproducir en Relámpago Movies con capture", url);
      try {
        const captured = await kino.browser.capture(url, {
          timeoutMs: 25000,
          autoplay: true
        });

        if (captured && Array.isArray(captured.media) && captured.media.length > 0) {
          const media = captured.media[0];
          const subs = Array.isArray(captured.subtitles)
            ? captured.subtitles
                .filter((s) => s && s.url)
                .map((s) => ({ url: s.url, lang: s.lang || "es" }))
            : [];

          return {
            url: media.url,
            headers: media.headers || { Referer: `${SITE_BASE}/` },
            mime: media.mime || undefined,
            ...(subs.length > 0 ? { subtitles: subs } : {})
          };
        }
      } catch (err) {
        kino.log(`Capture fallo en ${url}`, err && err.code ? err.code : err);
        if (err && err.code === "blocked") {
          // Si Cloudflare solicitó captcha humano interactivo, detener intento en este host
          break;
        }
      }
    }
  }

  throw kino.error("not_found", "No se encontró enlace reproducible en relampagomovies.com", {
    userMessage: "No se pudo obtener el video de Relámpago Movies. Intenta con otro título."
  });
}

// ──────────────────────────────────────────────────────────────
// MIGRATE
// ──────────────────────────────────────────────────────────────

export async function migrate(title) {
  if (!title || !title.title) return null;
  const results = await search({ q: title.title });
  if (!results.length) return null;

  const exact = results.find((r) => r.title.toLowerCase() === title.title.toLowerCase());
  return exact || results[0];
}

// ──────────────────────────────────────────────────────────────
// AJUSTES Y ESTADO
// ──────────────────────────────────────────────────────────────

export async function settingsStatus() {
  return {
    status_info: "Catálogo conectado a TMDB y reproductor a Relámpago Movies"
  };
}

export async function action(key) {
  if (key === "clear_cache") {
    try {
      kino.storage.remove("home_catalog");
    } catch {}
    return {
      message: "Caché limpiada correctamente",
      refresh: true
    };
  }

  if (key === "check_connection") {
    let ok = false;
    try {
      const res = await kino.tmdb("/configuration");
      ok = Boolean(res);
    } catch {
      ok = false;
    }
    return {
      message: ok ? "Conexión a TMDB funcionando correctamente" : "Fallo al conectar con TMDB",
      refresh: true
    };
  }

  return { message: "Acción no reconocida" };
}
