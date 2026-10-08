import { regenerateApplicationWorkbook } from "../lib/application-workbook.mjs";

const result = await regenerateApplicationWorkbook();
console.log(`Wrote ${result.rows.length} tracker rows to ${result.workbook}`);
