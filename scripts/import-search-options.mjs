/** Refresh the offline search catalogs used by the workspace strategy picker. */
import fs from "node:fs/promises";
import ExcelJS from "exceljs";

const ESCO_API = "https://ec.europa.eu/esco/api/search?type=occupation&language=en&full=false&limit=500";
const CITIES_FILE = "https://www.destatis.de/DE/Themen/Laender-Regionen/Regionales/Gemeindeverzeichnis/Administrativ/05-staedte.xlsx?__blob=publicationFile&v=13";
const OUT = new URL("../src/assets/search-options.json", import.meta.url);
const STATES = ["", "Schleswig-Holstein", "Hamburg", "Niedersachsen", "Bremen", "Nordrhein-Westfalen", "Hessen", "Rheinland-Pfalz", "Baden-Württemberg", "Bayern", "Saarland", "Berlin", "Brandenburg", "Mecklenburg-Vorpommern", "Sachsen", "Sachsen-Anhalt", "Thüringen"];

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response;
}

const roles = [];
for (let page = 0; ; page++) {
  const data = await (await get(`${ESCO_API}&offset=${page}`)).json();
  const results = data._embedded?.results || [];
  if (!results.length) throw new Error(`ESCO stopped at ${roles.length} of ${data.total} roles`);
  roles.push(...results.filter((item) => item.className === "Occupation").map((item) => ({ name: item.title, de: item.preferredLabel?.de || "" })));
  if (roles.length >= data.total) break;
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(Buffer.from(await (await get(CITIES_FILE)).arrayBuffer()));
const sheet = workbook.getWorksheet("Städte");
if (!sheet) throw new Error("Destatis workbook has no Städte sheet");
const cities = [];
for (let row = 3; row <= sheet.rowCount; row++) {
  const line = sheet.getRow(row);
  if (!/^\d+$/.test(String(line.getCell(1).value || ""))) continue;
  const name = String(line.getCell(3).value || "").split(",")[0].trim();
  const state = STATES[Number(String(line.getCell(2).value || "").slice(0, 2))];
  if (name && state) cities.push({ name, state });
}

const counts = new Map();
for (const city of cities) counts.set(city.name, (counts.get(city.name) || 0) + 1);
for (const city of cities) city.value = counts.get(city.name) > 1 ? `${city.name}, ${city.state}` : city.name;

const catalog = {
  sources: { roles: "ESCO occupation search API", cities: "Destatis Städte am 31.12.2024" },
  roles: [...new Map(roles.map((role) => [role.name.toLocaleLowerCase(), role])).values()].sort((a, b) => a.name.localeCompare(b.name)),
  cities: cities.sort((a, b) => a.name.localeCompare(b.name) || a.state.localeCompare(b.state)),
};
if (catalog.roles.length < 2900 || catalog.cities.length < 2000) throw new Error("Search catalogs look incomplete");
await fs.writeFile(OUT, JSON.stringify(catalog), "utf8");
console.log(`Imported ${catalog.roles.length} ESCO roles and ${catalog.cities.length} German cities`);
