import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const plugin = root.endsWith("/") ? root.slice(0, -1) : root;
const runner = `${plugin}/sdk/run.mjs`;

function run(method, argument) {
  const args = [runner, "--raw", plugin, method];
  if (argument !== undefined) {
    // run.mjs acepta una cadena de consulta como argumento simple en search.
    args.push(method === "search" ? argument : argument);
  }
  const stdout = execFileSync("node", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(stdout);
}

// La clave nativa de TMDB no existe en el shim, por eso estos tests verifican
// el fallback HTTP directo y no requieren que la persona agregue una clave.
rmSync(`${plugin}/.kino-storage.json`, { force: true });

const home = run("home");
assert(Array.isArray(home) && home.length >= 3, "Home debe tener al menos tres filas");
assert(home.every((row) => Array.isArray(row.items) && row.items.length > 0), "Cada fila debe incluir títulos");
assert(home[0].items[0].kind === "movie", "Los ítems deben usar kind, no type");
assert(home[0].items[0].ref.includes("tmdbId"), "Los ítems deben llevar referencia TMDB");

const results = run("search", "Spider-Man");
const searchItems = Array.isArray(results) ? results : results.items;
assert(Array.isArray(searchItems) && searchItems.length > 0, "La búsqueda debe devolver resultados");
assert(searchItems.some((item) => item.kind === "movie" || item.kind === "series"));

const browse = run("browse", JSON.stringify({ list: "trending_movie", page: 2 }));
const browseItems = Array.isArray(browse) ? browse : browse.items;
assert(Array.isArray(browseItems) && browseItems.length > 0, "Browse debe paginar resultados");

const series = searchItems.find((item) => item.kind === "series");
if (series) {
  const episodes = run("episodes", series.ref);
  assert(Array.isArray(episodes), "Episodes debe devolver una lista");
}

const status = run("settingsStatus");
assert(status.status_info, "El estado debe devolver texto");

console.log("OK: home, search, browse, episodes y settingsStatus verificados.");

if (existsSync(`${plugin}/.kino-storage.json`)) rmSync(`${plugin}/.kino-storage.json`);
