// One-off Playwright screenshot script for T1 evidence
// Run via: bun run scripts/screenshot.ts <url> <outPath>
import { chromium } from '@playwright/test'

const url = process.argv[2] ?? 'http://localhost:5173'
const outPath = process.argv[3] ?? '.omo/evidence/task-1-baduk-mvp.png'

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const response = await page.goto(url, { waitUntil: 'networkidle' })
  const status = response?.status() ?? -1
  await page.screenshot({ path: outPath, fullPage: false })
  const title = await page.title()
  const appText = await page.locator('#app').innerText().catch(() => '')
  console.log(JSON.stringify({ status, title, appText, outPath }))
} finally {
  await browser.close()
}
