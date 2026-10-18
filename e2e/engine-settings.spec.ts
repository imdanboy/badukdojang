import { test, expect, type Page } from '@playwright/test'
import { openSettings } from './helpers.ts'

const STORAGE_KEY = 'badukdojang-engine-settings'

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `.omo/evidence/task-5-katago-ai-integration-${name}.png`,
    fullPage: true,
  })
}

async function getStoredSettings(page: Page): Promise<Record<string, unknown>> {
  const raw = await page.evaluate(
    (key) => localStorage.getItem(key),
    STORAGE_KEY,
  )
  expect(raw).not.toBeNull()
  return JSON.parse(raw!) as Record<string, unknown>
}

test.describe('EngineSettings E2E', () => {
  let currentModelPath: string
  let currentAnalysisModelPath: string

  test.beforeEach(async ({ page }) => {
    currentModelPath = '/models/kata1-b18c384nbt.bin.gz'
    currentAnalysisModelPath = '/models/kata1-b18c384nbt.bin.gz'
    await page.route('/api/gtp/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', version: '1.16.4', humanModelAvailable: true }),
      })
    })

    await page.route('/api/gtp/command', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: '' }),
      })
    })

    await page.route('/api/gtp/models', async (route) => {
      const models = [
        '/models/kata1-b18c384nbt.bin.gz',
        '/models/g170e-b15c192-s1672170752-d466197061.bin.gz',
      ]
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          currentModelPath,
          currentAnalysisModelPath,
          models: models.map((path) => ({
            name: path.split('/').pop(),
            path,
            current: path === currentModelPath,
          })),
        }),
      })
    })

    await page.route('/api/gtp/model', async (route) => {
      const body = route.request().postDataJSON() as {
        modelPath: string
        target?: string
      }
      if (body.target === 'analysis') {
        currentAnalysisModelPath = body.modelPath
      } else {
        currentModelPath = body.modelPath
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, modelPath: body.modelPath }),
      })
    })

    await page.goto('/')
    // Engine settings live inside the settings modal (engine tab is default).
    await openSettings(page)
    await page.waitForSelector('#engine-settings-panel')
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    await page.reload()
    await openSettings(page)
    await page.waitForSelector('#engine-settings-panel')
  })

  test('(a) panel renders with all controls', async ({ page }) => {
    await expect(page.locator('#engine-settings-panel')).toBeVisible()
    await expect(page.locator('#engine-settings-header')).toContainText(
      '엔진 설정',
    )
    await expect(page.locator('#engine-toggle')).toBeVisible()
    await expect(page.locator('#engine-thinking-time')).toBeVisible()
    await expect(page.locator('#engine-difficulty')).toBeVisible()
    await expect(page.locator('#engine-rules')).toBeVisible()
    await expect(page.locator('#engine-style-human')).toBeVisible()
    await expect(page.locator('#engine-style-strong')).toBeVisible()

    // Default values
    await expect(page.locator('#engine-thinking-time-value')).toContainText(
      '5초',
    )
    await expect(page.locator('#engine-difficulty-value')).toContainText(
      '10급',
    )
    await expect(page.locator('#engine-rules')).toHaveValue('korean')

    await screenshot(page, 'panel-rendered')
  })

  test('(b) engine toggle switches ON and enables controls', async ({
    page,
  }) => {
    const toggle = page.locator('#engine-toggle')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await toggle.click()
    await page.waitForTimeout(200)

    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#engine-style-human')).not.toBeDisabled()
    await expect(page.locator('#engine-style-strong')).not.toBeDisabled()

    await screenshot(page, 'engine-on')
  })

  test('(c) thinking time slider moves and updates display', async ({
    page,
  }) => {
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    const slider = page.locator('#engine-thinking-time')
    await slider.fill('20')
    await page.waitForTimeout(200)

    await expect(page.locator('#engine-thinking-time-value')).toContainText(
      '20초',
    )

    await screenshot(page, 'thinking-time-20')
  })

  test('(d) difficulty slider moves and updates profile display', async ({
    page,
  }) => {
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    const slider = page.locator('#engine-difficulty')
    await slider.fill('5')
    await page.waitForTimeout(200)

    await expect(page.locator('#engine-difficulty-value')).toContainText(
      '5급',
    )
    await expect(page.locator('#engine-difficulty-value')).toContainText(
      'rank_5k',
    )

    await screenshot(page, 'difficulty-5k')
  })

  test('(e) rules dropdown changes selection', async ({ page }) => {
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    const select = page.locator('#engine-rules')
    await select.selectOption('chinese')
    await page.waitForTimeout(200)

    await expect(select).toHaveValue('chinese')

    await screenshot(page, 'rules-chinese')
  })

  test('(f) 강한 AI toggle sets maxVisits=800 and disables difficulty', async ({
    page,
  }) => {
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    await page.locator('#engine-style-strong').click()
    await page.waitForTimeout(200)

    await expect(page.locator('#engine-max-visits')).toContainText('800')
    await expect(page.locator('#engine-difficulty')).toBeDisabled()

    await screenshot(page, 'strong-ai')
  })

  test('(g) 인간 스타일 toggle sets maxVisits=300', async ({ page }) => {
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    // Switch to strong first, then back to human
    await page.locator('#engine-style-strong').click()
    await page.waitForTimeout(200)
    await expect(page.locator('#engine-max-visits')).toContainText('800')

    await page.locator('#engine-style-human').click()
    await page.waitForTimeout(200)

    await expect(page.locator('#engine-max-visits')).toContainText('300')
    await expect(page.locator('#engine-difficulty')).not.toBeDisabled()

    await screenshot(page, 'human-style')
  })

  test('(h) settings persist to localStorage after interaction', async ({
    page,
  }) => {
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    await page.locator('#engine-thinking-time').fill('15')
    await page.waitForTimeout(200)

    await page.locator('#engine-difficulty').fill('5')
    await page.waitForTimeout(200)

    await page.locator('#engine-rules').selectOption('japanese')
    await page.waitForTimeout(200)

    const stored = await getStoredSettings(page)
    expect(stored['enabled']).toBe(true)
    expect(stored['thinkingTime']).toBe(15)
    expect(stored['difficulty']).toBe(5)
    expect(stored['rules']).toBe('japanese')
    expect(stored['humanSLProfile']).toBe('rank_5k')
  })

  test('(i) settings persist after page reload (stale state round-trip)', async ({
    page,
  }) => {
    // Set custom values
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    await page.locator('#engine-thinking-time').fill('25')
    await page.waitForTimeout(200)

    await page.locator('#engine-difficulty').fill('15')
    await page.waitForTimeout(200)

    await page.locator('#engine-rules').selectOption('aga')
    await page.waitForTimeout(200)

    // Verify stored
    const beforeReload = await getStoredSettings(page)
    expect(beforeReload['thinkingTime']).toBe(25)
    expect(beforeReload['difficulty']).toBe(15)
    expect(beforeReload['rules']).toBe('aga')

    // Reload page
    await page.reload()
    await openSettings(page)
    await page.waitForTimeout(300)

    // Verify values restored from localStorage
    await expect(page.locator('#engine-thinking-time-value')).toContainText(
      '25초',
    )
    await expect(page.locator('#engine-difficulty-value')).toContainText(
      '15급',
    )
    await expect(page.locator('#engine-rules')).toHaveValue('aga')

    // Engine should still be enabled
    await expect(page.locator('#engine-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await screenshot(page, 'after-reload')
  })

  test('(j) slider bounds — cannot set negative time or 0 kyu', async ({    page,
  }) => {
    await page.locator('#engine-toggle').click()
    await page.waitForTimeout(200)

    // Try to set thinking time below 1 via DOM manipulation
    const timeSlider = page.locator('#engine-thinking-time')
    await timeSlider.evaluate((el: HTMLInputElement) => {
      el.value = '-5'
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.waitForTimeout(200)

    const stored = await getStoredSettings(page)
    // Should be clamped to 1
    expect(stored['thinkingTime']).toBe(1)

    // Try to set difficulty to 0
    const diffSlider = page.locator('#engine-difficulty')
    await diffSlider.evaluate((el: HTMLInputElement) => {
      el.value = '0'
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.waitForTimeout(200)

    const stored2 = await getStoredSettings(page)
    // Should be clamped to 1
    expect(stored2['difficulty']).toBe(1)

    await screenshot(page, 'bounds-clamped')
  })

  test('(k) model selector lists models with absolute path and switches', async ({
    page,
  }) => {
    const select = page.locator('#engine-model-select')
    await expect(select).toBeVisible()

    // Two mocked model files are listed by filename
    const options = page.locator('#engine-model-select option')
    await expect(options).toHaveCount(2)
    await expect(options.nth(0)).toContainText('kata1-b18c384nbt.bin.gz')
    await expect(options.nth(1)).toContainText('g170e-b15c192')

    // Absolute path of the currently loaded model is displayed
    const pathLabel = page.locator('#engine-model-path')
    await expect(pathLabel).toContainText('/models/kata1-b18c384nbt.bin.gz')
    await expect(select).toHaveValue('/models/kata1-b18c384nbt.bin.gz')

    // Switch to the smaller model — the bridge restarts, path label updates
    await select.selectOption('/models/g170e-b15c192-s1672170752-d466197061.bin.gz')
    await expect(pathLabel).toContainText('/models/g170e-b15c192-s1672170752-d466197061.bin.gz')
    await expect(select).toHaveValue('/models/g170e-b15c192-s1672170752-d466197061.bin.gz')

    await screenshot(page, 'model-switched')
  })

  test('(l) analysis tab has its own model selector that switches only analysis', async ({
    page,
  }) => {
    // Switch to the 분석 tab
    await page.locator('#settings-tab-analysis').click()
    const panel = page.locator('#analysis-settings-panel')
    await expect(panel).toBeVisible()

    const select = page.locator('#analysis-model-select')
    await expect(select).toBeVisible()

    // The analysis model tracks the main model until independently switched
    await expect(select).toHaveValue('/models/kata1-b18c384nbt.bin.gz')
    const pathLabel = page.locator('#analysis-model-path')
    await expect(pathLabel).toContainText('/models/kata1-b18c384nbt.bin.gz')

    // Switch analysis to the light model — play engine unaffected
    await select.selectOption('/models/g170e-b15c192-s1672170752-d466197061.bin.gz')
    await expect(pathLabel).toContainText('/models/g170e-b15c192-s1672170752-d466197061.bin.gz')
    await expect(select).toHaveValue('/models/g170e-b15c192-s1672170752-d466197061.bin.gz')

    // The engine tab's main model selector is unchanged
    await page.locator('#settings-tab-engine').click()
    await expect(page.locator('#engine-model-path')).toContainText('/models/kata1-b18c384nbt.bin.gz')

    await screenshot(page, 'analysis-model-switched')
  })
})