import { chromium } from '@playwright/test'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  const consoleMessages: string[] = []
  page.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`))

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  // Screenshot default 19x19
  await page.screenshot({ path: '.omo/evidence/task-2-baduk-mvp-19x19.png' })

  // Switch to 13x13
  await page.locator('select').selectOption('13')
  await page.waitForTimeout(500)
  await page.screenshot({ path: '.omo/evidence/task-2-baduk-mvp-13x13.png' })

  // Click center intersection on 13x13 and check console
  const goban = page.locator('.shudan-goban')
  const box = await goban.boundingBox()
  if (box) {
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.click(cx, cy)
    await page.waitForTimeout(200)
  }

  // Switch to 9x9
  await page.locator('select').selectOption('9')
  await page.waitForTimeout(500)
  await page.screenshot({ path: '.omo/evidence/task-2-baduk-mvp-9x9.png' })

  console.log('Console messages:', consoleMessages.join('\n'))

  const gobanBox = await goban.boundingBox()
  const appRootBox = await page.locator('#app-root').boundingBox()
  console.log('Goban box:', JSON.stringify(gobanBox))
  console.log('App root box:', JSON.stringify(appRootBox))

  await browser.close()
}

main().catch(console.error)