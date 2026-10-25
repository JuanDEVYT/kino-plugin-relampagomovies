/// <reference path="./kino.d.ts" />

// Plugin de Kino para Relámpago Movies (relampagomovies.com)
// Idiomas: Español / Latino
// apiVersion: 6 (Soporte de Cloudflare con kino.browser.page y kino.browser.capture)

const BASE = "https://relampagomovies.com";
const CACHE_MS = 24 * 60 * 60 * 1000; // 24 horas

// ──────────────────────────────────────────────────────────────
// UTILIDADES Y AYUDAS
// ──────────────────────────────────────────────────────────────

function siteUrl(path) {
  const s = String(path || "");
  return /^https?:\/\//i.test(s) ? s : BASE + (s.startsWith("/") ? s : "/" + s);
}

function decodeHtml(html) {
  return String(html || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripTags(html) {
  return decodeHtml(String(html || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function cleanTitle(raw) {
  return stripTags(raw)
    .replace(/\s*\(?(?:1080p|720p|4k|hd|latino|castellano|subtitulado|dual)\)?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractYear(text) {
  const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
  return m ? parseInt(m[1], 10) : undefined;
}

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

// ──────────────────────────────────────────────────────────────
// LECTURA DE PÁGINAS (Con fallback a kino.browser.page si hay Cloudflare)
// ──────────────────────────────────────────────────────────────

async function fetchPage(url, waitFor) {
  // Primero intento rápido con kino.fetch
  try {
    const res = await kino.fetch(siteUrl(url));
    if (res.ok && res.text) {
      const text = res.text();
      // Si no es el challenge de Cloudflare, devolver el HTML directamente
      if (!/just a moment|cf-chl|challenge-platform/i.test(text)) {
        return text;
      }
    }
  } catch (e) {
    kino.log("kino.fetch falló, recurriendo al navegador de Kino", e && e.code ? e.code : e);
  }

  // Si hay bloqueo por Cloudflare o protección, usar el browser integrado de Kino
  if (kino.browser && kino.browser.page) {
    try {
      const page = await kino.browser.page(siteUrl(url), {
        waitFor: waitFor || /<article|<div class="item|class="movie|class="poster/i,
        timeoutMs: 14000
      });
      return page.html || "";
    } catch (err) {
      kino.log("kino.browser.page fallo", err && err.code ? err.code : err);
      if (err && (err.code === "blocked" || err.code === "busy" || err.code === "rate_limited" || err.code === "browser_unavailable")) {
        return "";
      }
      throw err;
    }
  }

  return "";
}

// ──────────────────────────────────────────────────────────────
// PARSEO DE TARJETAS HTML (Películas y Series)
// ──────────────────────────────────────────────────────────────

function parseItemCards(html) {
  const items = [];
  const seenIds = new Set();

  // Patrón 1: Artículos y bloques habituales en temas de películas (Dooplay, Toroplay o a medida)
  const blockMatches = html.match(/<article[\s\S]*?<\/article>|<div class="(?:item|poster|movie-item|ml-item)[\s\S]*?<\/div>\s*<\/div>/gi) || [];

  for (const block of blockMatches) {
    const linkMatch = block.match(/href=["'](https?:\/\/[^"']+|\/[^"']+)["']/i);
    if (!linkMatch) continue;

    const href = linkMatch[1];
    // Ignorar enlaces de categorías o páginas estáticas
    if (/\/(category|tag|genero|author|page|contact|dmca)\//i.test(href)) continue;

    const titleMatch = block.match(/alt=["']([^"']+)["']/i) ||
      block.match(/title=["']([^"']+)["']/i) ||
      block.match(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/i);
    const rawTitle = titleMatch ? titleMatch[1] : "";
    const title = cleanTitle(rawTitle);
    if (!title) continue;

    const imgMatch = block.match(/data-src=["']([^"']+)["']/i) ||
      block.match(/src=["']([^"']+)["']/i);
    const poster = imgMatch ? siteUrl(imgMatch[1]) : undefined;

    const year = extractYear(block) || extractYear(title);
    const isSeries = /serie|season|temporada/i.test(href) || /temporada/i.test(block);

    const slug = href.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+|\/+$/g, "");
    const id = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    if (seenIds.has(id)) continue;
    seenIds.add(id);

    items.push({
      id: (isSeries ? "serie." : "pelicula.") + id,
      title,
      type: isSeries ? "series" : "movie",
      poster,
      year,
      ref: encodeRef({ href: siteUrl(href), type: isSeries ? "serie" : "pelicula", title })
    });
  }

  // Fallback genérico si los bloques eran diferentes: buscar todos los enlaces con /movie- o /online-
  if (items.length === 0) {
    const genericRe = /<a[^>]+href=["']((?:https:\/\/relampagomovies\.com)?\/(?:movie|online|pelicula|serie)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = genericRe.exec(html)) !== null) {
      const href = m[1];
      const inner = m[2];
      const imgMatch = inner.match(/src=["']([^"']+)["']/i) || inner.match(/data-src=["']([^"']+)["']/i);
      const titleMatch = inner.match(/alt=["']([^"']+)["']/i) || inner.match(/title=["']([^"']+)["']/i) || [null, inner];
      const title = cleanTitle(titleMatch[1]);
      if (!title || title.length < 2) continue;

      const slug = href.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+|\/+$/g, "");
      const isSeries = /serie|temporada/i.test(href);
      const id = slug;

      if (seenIds.has(id)) continue;
      seenIds.add(id);

      items.push({
        id: (isSeries ? "serie." : "pelicula.") + id,
        title,
        type: isSeries ? "series" : "movie",
        poster: imgMatch ? siteUrl(imgMatch[1]) : undefined,
        year: extractYear(inner) || extractYear(title),
        ref: encodeRef({ href: siteUrl(href), type: isSeries ? "serie" : "pelicula", title })
      });
    }
  }

  return items;
}

// ──────────────────────────────────────────────────────────────
// EXPORTS DE KINO
// ──────────────────────────────────────────────────────────────

export async function home() {
  const cached = kino.storage.get("home_rows");
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {}
  }

  const html = await fetchPage(`${BASE}/`);
  if (!html) {
    return [
      {
        id: "estrenos",
        title: "Estrenos y Destacados",
        items: []
      }
    ];
  }

  const allItems = parseItemCards(html);
  const movies = allItems.filter((i) => i.type === "movie");
  const series = allItems.filter((i) => i.type === "series");

  const rows = [];
  if (movies.length > 0) {
    rows.push({
      id: "peliculas-recientes",
      title: "Películas Recientes",
      items: movies.slice(0, 20),
      browse: movies.length >= 20 ? encodeRef({ path: "/peliculas", page: 2 }) : undefined
    });
  }

  if (series.length > 0) {
    rows.push({
      id: "series-recientes",
      title: "Series Populares",
      items: series.slice(0, 20),
      browse: series.length >= 20 ? encodeRef({ path: "/series", page: 2 }) : undefined
    });
  }

  if (rows.length === 0 && allItems.length > 0) {
    rows.push({
      id: "catalogo-general",
      title: "Novedades de Relámpago Movies",
      items: allItems.slice(0, 25)
    });
  }

  try {
    kino.storage.set("home_rows", JSON.stringify(rows), { ttlMs: CACHE_MS });
  } catch {}

  return rows;
}

export async function search(query) {
  if (query && query.within) {
    // Si Kino pide buscar dentro de una página específica o fila "Ver más" que no filtramos
    return null;
  }
  const q = (query && query.q ? String(query.q) : "").trim();
  if (!q) return [];

  const searchUrl = `${BASE}/?s=${encodeURIComponent(q)}`;
  const html = await fetchPage(searchUrl);
  if (!html) return [];

  const items = parseItemCards(html);
  return items.slice(0, 30);
}

export async function browse(ref) {
  const data = decodeRef(ref);
  if (!data || !data.path) return { items: [] };

  const page = data.page || 1;
  const path = data.path.includes("?") ? `${data.path}&page=${page}` : `${data.path}/page/${page}`;
  const html = await fetchPage(siteUrl(path));
  if (!html) return { items: [] };

  const items = parseItemCards(html);
  const hasMore = items.length >= 15;

  return {
    items,
    next: hasMore ? encodeRef({ path: data.path, page: page + 1 }) : undefined
  };
}

export async function episodes(ref) {
  const data = decodeRef(ref);
  if (!data || !data.href) return [];

  const html = await fetchPage(data.href);
  if (!html) return [];

  const episodesList = [];
  // Buscar enlaces y listas de capítulos
  const epRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  let counter = 1;

  while ((m = epRe.exec(html)) !== null) {
    const href = m[1];
    const text = stripTags(m[2]);

    const seasonMatch = href.match(/temporada[/-](\d+)/i) || text.match(/(?:T|Temporada)\s*(\d+)/i);
    const epMatch = href.match(/episodio[/-](\d+)/i) || text.match(/(?:E|Capitulo|Episodio)\s*(\d+)/i);

    if (seasonMatch && epMatch) {
      const season = parseInt(seasonMatch[1], 10);
      const episode = parseInt(epMatch[1], 10);

      episodesList.push({
        season,
        episode,
        title: text || `Episodio ${episode}`,
        ref: encodeRef({ href: siteUrl(href), type: "episodio", season, episode })
      });
    }
  }

  return episodesList;
}

export async function resolve(ref) {
  const data = decodeRef(ref);
  if (!data || !data.href) {
    throw kino.error("not_found", "Referencia no válida");
  }

  const directOnly = kino.config.get("direct_only") === true;
  const targetUrl = siteUrl(data.href);

  // 1. Intentar obtener el HTML de la página para encontrar iframes directos (ej. bunnycdn / mediadelivery / filemoon)
  const html = await fetchPage(targetUrl);
  if (html) {
    // Buscar iframe de mediadelivery o bunnycdn
    const mediaIframeMatch = html.match(/src=["'](https:\/\/(?:iframe\.mediadelivery\.net|[^"']*\.b-cdn\.net)[^"']+)["']/i);
    if (mediaIframeMatch) {
      const iframeUrl = mediaIframeMatch[1];
      return {
        url: iframeUrl,
        headers: {
          Referer: `${BASE}/`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      };
    }

    // Buscar enlace directo a filemoon u otro hosting
    const filemoonMatch = html.match(/src=["'](https:\/\/(?:filemoon\.(?:sx|to)|[^"']+\/e\/)[^"']+)["']/i);
    if (filemoonMatch) {
      return {
        url: filemoonMatch[1],
        headers: {
          Referer: `${BASE}/`
        }
      };
    }
  }

  // 2. Si no hay iframe o enlace directo visible, usar el reproductor con kino.browser.capture
  if (!directOnly && kino.browser && kino.browser.capture) {
    kino.log("Iniciando captura de video en browser oculto de Kino", targetUrl);
    const captured = await kino.browser.capture(targetUrl, {
      timeoutMs: 25000,
      autoplay: true
    });

    if (captured && captured.media && captured.media.length > 0) {
      const best = captured.media[0];
      const subs = Array.isArray(captured.subtitles)
        ? captured.subtitles
            .filter((s) => s && s.url)
            .map((s) => ({ url: s.url, lang: s.lang || "es" }))
        : [];

      return {
        url: best.url,
        headers: best.headers || { Referer: `${BASE}/` },
        mime: best.mime || undefined,
        ...(subs.length > 0 ? { subtitles: subs } : {})
      };
    }
  }

  throw kino.error("not_found", "No se encontró enlace reproducible para este contenido");
}

export async function migrate(title) {
  if (!title || !title.title) return null;
  const results = await search({ q: title.title });
  if (results.length === 0) return null;

  const exact = results.find((r) => r.title.toLowerCase() === title.title.toLowerCase());
  return exact || results[0];
}

// ──────────────────────────────────────────────────────────────
// AJUSTES Y ACCIONES
// ──────────────────────────────────────────────────────────────

export async function settingsStatus() {
  const status = kino.storage.get("site_status");
  return {
    status_info: status === "online"
      ? "relampagomovies.com respondió correctamente"
      : status === "offline"
        ? "Sin respuesta del sitio web (Cloudflare activo)"
        : "Sin comprobar todavía"
  };
}

export async function action(key) {
  if (key === "check_connection") {
    let ok = false;
    try {
      const res = await kino.fetch(`${BASE}/`);
      ok = res.ok;
    } catch {
      ok = false;
    }
    try {
      kino.storage.set("site_status", ok ? "online" : "offline");
    } catch {}
    return {
      message: ok
        ? "Conexión exitosa con relampagomovies.com"
        : "El sitio respondió con challenge de Cloudflare (usará browser de Kino)",
      refresh: true
    };
  }

  if (key === "clear_cache") {
    try {
      kino.storage.remove("home_rows");
      kino.storage.remove("site_status");
    } catch {}
    return {
      message: "Caché de Relámpago Movies limpiada correctamente",
      refresh: true
    };
  }

  return { message: "Acción no reconocida" };
}
