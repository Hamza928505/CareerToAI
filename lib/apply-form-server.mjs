#!/usr/bin/env node
/**
 * The tools Claude gets for filling ONE application form: an MCP server over standard input and output, started by
 * lib/claude-browser.mjs. It attaches to the browser window that file opened (CDP_URL) and offers five tools.
 *
 * The safety of the whole route is in what these tools cannot do, whatever the model is told by a page:
 *   - there is no tool that opens an address: the form is the one the student approved;
 *   - `upload` takes "cv" or "cover_letter", never a path: only the two tailored documents can leave this computer;
 *   - `fill` refuses password fields, and nothing can tick a box: an agreement is the student's own decision;
 *   - `press` presses a button that opens the form or goes to its next step, and refuses every other button once the
 *     form is on the page. So the final Submit cannot be pressed from here. The student presses it.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { chromium } from "playwright";
import { z } from "zod";

import { collectFields } from "./local-browser.mjs";

const NEXT = /^\s*(next|weiter|continue|fortfahren|n[aä]chster schritt|next step|save and continue|speichern und weiter|zur[uü]ck|back)\b/i;
const OPENS = /apply|bewerben|bewerbung starten|start application|jetzt starten/i;
const CAPTCHA = 'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], .g-recaptcha, .h-captcha, .cf-turnstile';

/** What a button does, from its label and whether a form is already on the page. Exported for the test. */
export function buttonKind(label, formShown) {
  if (NEXT.test(label)) return "next step";
  if (!formShown && OPENS.test(label)) return "opens the form";
  return formShown ? "not available (the student presses this)" : "other";
}

/** Runs inside the page: the visible buttons, each tagged so `press` can find it again. */
function collectButtons() {
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  return [...document.querySelectorAll("button, input[type=submit], input[type=button], [role=button], a")].filter(visible).map((el, i) => {
    el.setAttribute("data-cb", String(i));
    return { cb: i, label: (el.innerText || el.value || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 80), link: el.tagName === "A" };
  }).filter((button) => button.label);
}

async function start() {
  const files = JSON.parse(process.env.APPLY_FILES || "{}");
  const browser = await chromium.connectOverCDP(process.env.CDP_URL);
  const page = () => browser.contexts().flatMap((context) => context.pages()).at(-1);
  const say = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }] });
  const fillable = (fields) => fields.filter((field) => !["file", "checkbox", "radio", "password"].includes(field.type));
  const read = async () => {
    const fields = await page().evaluate(collectFields);
    // Only visible text fields and lists mean "the form is on the page": a file input is listed even while its form is still hidden.
    const formShown = fillable(fields).length > 0;
    const buttons = (await page().evaluate(collectButtons)).map((button) => ({ ...button, does: buttonKind(button.label, formShown) })).filter((button) => !button.link || button.does !== "other").slice(0, 40);
    return { fields, buttons, formShown };
  };

  const server = new McpServer({ name: "application-form", version: "1.0.0" });

  server.registerTool("read_page", { description: "Read the application page: its fields (each with a number `ca`) and its buttons (each with a number `cb` and what it does). Call it first, and again after every `press`.", inputSchema: {} }, async () => {
    const { fields, buttons } = await read();
    return say({
      url: page().url(), title: await page().title(), text: (await page().innerText("body")).replace(/\s+\n/g, "\n").slice(0, 2500),
      captcha: (await page().locator(CAPTCHA).count()) > 0, login: fields.some((field) => field.type === "password"),
      fields: fields.map(({ ca, label, type, tag, required, value, options }) => ({ ca, label: label.slice(0, 160), type: tag === "select" ? "select" : type, required, value: type === "file" ? "" : String(value).slice(0, 120), options: options?.slice(0, 40) })),
      buttons: buttons.map(({ cb, label, does }) => ({ cb, label, does })),
    });
  });

  server.registerTool("fill", { description: "Type a value into a text field. Only values from the FACTS you were given.", inputSchema: { ca: z.number(), value: z.string() } }, async ({ ca, value }) => {
    const field = (await page().evaluate(collectFields)).find((item) => item.ca === ca);
    if (!field) return say("No such field. Call read_page again.");
    if (field.type === "password") return say("Refused: a password is never filled in.");
    if (["file", "checkbox", "radio"].includes(field.type) || field.tag === "select") return say("Refused: this is not a text field.");
    await page().locator(`[data-ca="${ca}"]`).fill(String(value).slice(0, 4000));
    return say("Filled.");
  });

  server.registerTool("choose", { description: "Choose one option of a select list, by the option's value.", inputSchema: { ca: z.number(), value: z.string() } }, async ({ ca, value }) => {
    const field = (await page().evaluate(collectFields)).find((item) => item.ca === ca);
    if (!field || field.tag !== "select") return say("Refused: this is not a select list.");
    if (!field.options.some((option) => option.value === value)) return say(`Refused: not one of its options (${field.options.map((option) => option.value).slice(0, 20).join(", ")}).`);
    await page().locator(`[data-ca="${ca}"]`).selectOption(value);
    return say("Chosen.");
  });

  server.registerTool("upload", { description: "Attach the student's tailored CV or cover letter to a file field.", inputSchema: { ca: z.number(), document: z.enum(["cv", "cover_letter"]) } }, async ({ ca, document }) => {
    const field = (await page().evaluate(collectFields)).find((item) => item.ca === ca);
    if (!field || field.type !== "file") return say("Refused: this is not a file field.");
    const file = document === "cv" ? files.cv : files.cl;
    if (!file) return say(`There is no tailored ${document === "cv" ? "CV" : "cover letter"} for this job. Leave the field and report it.`);
    await page().locator(`[data-ca="${ca}"]`).setInputFiles(file);
    return say("Attached.");
  });

  server.registerTool("press", { description: "Press a button that opens the application form or goes to its next step. The final Submit is not available: the student presses it.", inputSchema: { cb: z.number() } }, async ({ cb }) => {
    const { buttons } = await read();
    const button = buttons.find((item) => item.cb === cb);
    if (!button) return say("No such button. Call read_page again.");
    if (!["next step", "opens the form"].includes(button.does)) return say(`Refused: "${button.label}" is left for the student. If the form is complete, finish.`);
    await page().locator(`[data-cb="${cb}"]`).click();
    await page().waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {});
    await page().waitForTimeout(1200);
    return say("Pressed. Call read_page to see the page now.");
  });

  await server.connect(new StdioServerTransport());
}

// Started as a program by the claude command; imported (by the test) it only offers buttonKind.
if (process.env.CDP_URL) start().catch((error) => { console.error(error.message); process.exit(1); });
