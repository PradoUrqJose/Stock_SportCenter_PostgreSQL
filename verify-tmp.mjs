import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import os from "os";

const SCREENSHOT_DIR = "C:\\Users\\josep\\AppData\\Local\\Temp\\claude\\C--Users-josep-Documents-Code-1--OtroProject-StockSportCenter-Proyecto-STOCK-REFACTOR-29-06-stock-descuentos\\d84759bc-388c-4063-86b2-c68b1f7cbb46\\scratchpad\\shots";
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const BASE = "http://localhost:3000";

async function shot(page, name) {
  const p = path.join(SCREENSHOT_DIR, name);
  await page.screenshot({ path: p, fullPage: true });
  console.log("SCREENSHOT", p);
}

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("CONSOLE ERROR:", msg.text());
  });
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  console.log("### login");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#username", "admin");
  await page.fill("#password", "cambia_esto");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });
  console.log("logged in, url=", page.url());
  await shot(page, "01-dashboard.png");

  console.log("### nav to reposicion");
  await page.goto(`${BASE}/admin/reposicion`, { waitUntil: "networkidle" });
  await shot(page, "02-reposicion-idle.png");

  // check sidebar link exists
  const sidebarText = await page.locator("aside").innerText();
  console.log("SIDEBAR CONTAINS Reposición:", sidebarText.includes("Reposición"));

  console.log("### upload txt");
  const txtPath = path.join(os.tmpdir(), "reposicion-test.txt");
  fs.writeFileSync(txtPath, "310252-04\n535864-01\nIC9708\nCODIGO-FALSO-999\n");
  await page.setInputFiles('input[type="file"]', txtPath);
  await page.click('button:has-text("Leer archivo")');
  await page.waitForSelector("table", { timeout: 15000 });
  await shot(page, "03-reposicion-preview.png");

  const bodyText = await page.locator("body").innerText();
  console.log("PREVIEW TEXT SNIPPET:", bodyText.slice(0, 2000));

  console.log("### select destino Publicado and apply");
  const publicadoBtn = page.locator('button:has-text("Publicado #")');
  const hasPublicadoOption = await publicadoBtn.count();
  console.log("has publicado destino option:", hasPublicadoOption);
  if (hasPublicadoOption > 0) {
    await publicadoBtn.first().click();
  }
  await shot(page, "04-reposicion-destino-publicado.png");

  await page.click('button:has-text("Aplicar reposición")');
  await page.waitForSelector("text=Reposición aplicada", { timeout: 15000 });
  await shot(page, "05-reposicion-done.png");
  const doneText = await page.locator("body").innerText();
  console.log("DONE TEXT:", doneText.slice(0, 1000));

  console.log("### check actualizacion-updates publicado tab");
  await page.goto(`${BASE}/admin/actualizacion-updates`, { waitUntil: "networkidle" });
  await shot(page, "06-actualizacion-updates.png");
  const updText = await page.locator("body").innerText();
  console.log("UPDATES TEXT SNIPPET:", updText.slice(0, 2000));

  console.log("### check actualizacion editor destino picker");
  await page.goto(`${BASE}/admin/actualizacion`, { waitUntil: "networkidle" });
  await shot(page, "07-actualizacion-editor.png");
  const editorHasPublicadoToggle = await page.locator('button:has-text("Publicado #")').count();
  console.log("editor has publicado destino toggle:", editorHasPublicadoToggle);

  await browser.close();
}

main().catch((e) => {
  console.error("SCRIPT ERROR:", e);
  process.exit(1);
});
