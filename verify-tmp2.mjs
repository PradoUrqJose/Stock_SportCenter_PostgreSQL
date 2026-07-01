import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import os from "os";

const SCREENSHOT_DIR = "C:\\Users\\josep\\AppData\\Local\\Temp\\claude\\C--Users-josep-Documents-Code-1--OtroProject-StockSportCenter-Proyecto-STOCK-REFACTOR-29-06-stock-descuentos\\d84759bc-388c-4063-86b2-c68b1f7cbb46\\scratchpad\\shots";
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
  page.on("console", (msg) => console.log("CONSOLE", msg.type(), msg.text()));
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));
  page.on("requestfailed", (req) => console.log("REQ FAILED:", req.url(), req.failure()?.errorText));
  page.on("response", (res) => {
    if (res.url().includes("reposicion") || res.request().method() === "POST") {
      console.log("RESPONSE", res.request().method(), res.url(), res.status());
    }
  });

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#username", "admin");
  await page.fill("#password", "cambia_esto");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });

  await page.goto(`${BASE}/admin/reposicion`, { waitUntil: "networkidle" });

  const txtPath = path.join(os.tmpdir(), "reposicion-test.txt");
  fs.writeFileSync(txtPath, "310252-04\n535864-01\nIC9708\nCODIGO-FALSO-999\n");
  await page.setInputFiles('input[type="file"]', txtPath);
  await page.click('button:has-text("Leer archivo")');
  await page.waitForSelector("table", { timeout: 15000 });

  await page.click('button:has-text("Publicado #")');
  await page.waitForTimeout(300);
  await shot(page, "10-before-apply.png");

  console.log(">>> clicking Aplicar reposición");
  await page.click('button:has-text("Aplicar reposición")');

  // Poll body text for up to 30s, logging state every 3s
  let finalText = "";
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(3000);
    finalText = await page.locator("body").innerText();
    console.log(`--- t+${(i + 1) * 3}s ---`);
    console.log(finalText.slice(0, 800));
    if (finalText.includes("Reposición aplicada") || finalText.includes("Error")) break;
  }
  await shot(page, "11-after-apply.png");

  await browser.close();
}

main().catch((e) => {
  console.error("SCRIPT ERROR:", e);
  process.exit(1);
});
