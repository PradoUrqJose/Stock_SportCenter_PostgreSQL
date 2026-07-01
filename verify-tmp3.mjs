import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import os from "os";

const BASE = "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("console", (msg) => console.log("CONSOLE", msg.type(), msg.text()));
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#username", "admin");
  await page.fill("#password", "cambia_esto");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });

  await page.goto(`${BASE}/admin/reposicion`, { waitUntil: "networkidle" });

  const txtPath = path.join(os.tmpdir(), "reposicion-test2.txt");
  fs.writeFileSync(txtPath, "849915-01\n19321832\n96-20167\n");
  await page.setInputFiles('input[type="file"]', txtPath);
  await page.click('button:has-text("Leer archivo")');
  await page.waitForSelector("table", { timeout: 15000 });

  await page.click('button:has-text("Publicado #")');
  await page.waitForTimeout(300);

  console.log(">>> clicking Aplicar reposición");
  await page.click('button:has-text("Aplicar reposición")');

  let finalText = "";
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(2000);
    finalText = await page.locator("body").innerText();
    if (finalText.includes("Reposición aplicada") || finalText.includes("Error durante")) break;
  }
  console.log("FINAL:", finalText.slice(finalText.indexOf("Reposición\n"), finalText.indexOf("Reposición\n") + 400));

  await browser.close();
}

main().catch((e) => { console.error("SCRIPT ERROR:", e); process.exit(1); });
