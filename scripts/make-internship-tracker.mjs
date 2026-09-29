import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { ROOT, readJson } from "../lib/content.mjs";
import { COLUMNS, SCHEMA } from "../lib/tracker.mjs";

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Autonomous Internship Agent";
  wb.created = new Date();
  
  const ws = wb.addWorksheet(SCHEMA.sheet, { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
  
  // Set columns and readable widths
  ws.columns = COLUMNS.map(c => ({ 
    key: c.key, 
    header: c.header, 
    width: c.width || 20
  }));
  
  // Add auto-filter to every column
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNS.length }
  };
  
  // Freeze header and Company name (Company name is key 'company')
  const companyColIndex = COLUMNS.findIndex(c => c.key === 'company') + 1;
  ws.views = [
    { state: 'frozen', xSplit: companyColIndex, ySplit: 1 }
  ];

  // Header styling
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
  
  // Create 100 blank rows with data validation for dropdowns
  for (let r = 2; r <= 101; r++) {
    const row = ws.getRow(r);
    
    // APPLY? dropdown
    const applyCol = COLUMNS.findIndex(c => c.key === 'apply') + 1;
    if (applyCol > 0) {
      ws.getCell(r, applyCol).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Yes,No,Maybe"']
      };
    }
    
    // Status dropdown
    const statusCol = COLUMNS.findIndex(c => c.key === 'status') + 1;
    if (statusCol > 0) {
      const statusList = SCHEMA.statuses.map(s => s.value).join(',');
      ws.getCell(r, statusCol).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"' + statusList + '"']
      };
    }
  }

  // Conditional formatting on APPLY?: green = Yes, red = No, yellow = Maybe.
  const applyColLetter = String.fromCharCode(64 + COLUMNS.findIndex(c => c.key === 'apply') + 1); // Only works if col < 27
  // We can just use the exact range since we know it
  const applyIdx = COLUMNS.findIndex(c => c.key === 'apply') + 1;
  const colLetter = applyIdx > 26 ? String.fromCharCode(64 + Math.floor(applyIdx/26)) + String.fromCharCode(64 + (applyIdx%26)) : String.fromCharCode(64 + applyIdx);
  
  ws.addConditionalFormatting({
    ref: colLetter + '2:' + colLetter + '1000',
    rules: [
      { type: 'containsText', operator: 'containsText', text: 'Yes', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } } } },
      { type: 'containsText', operator: 'containsText', text: 'No', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } } } },
      { type: 'containsText', operator: 'containsText', text: 'Maybe', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFEB9C' } } } }
    ]
  });

  const outPath = path.join(ROOT, SCHEMA.workbook);
  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote tracker UI to ${outPath}`);
}

await main();
