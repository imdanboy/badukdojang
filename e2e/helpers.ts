import type { Page } from '@playwright/test'

/**
 * Engine controls live inside the settings modal —
 * open the modal, toggle the engine on, then close it again.
 */
export async function enableEngine(page: Page): Promise<void> {
  await page.locator('#settings-button').click()
  await page.locator('#engine-toggle').click()
  await page.locator('#settings-close').click()
}

/** Open the settings modal (defaults to the engine tab). */
export async function openSettings(page: Page): Promise<void> {
  await page.locator('#settings-button').click()
}

/** Start a new game from the sidebar button via the new-game modal. */
export async function startNewGame(page: Page): Promise<void> {
  await page.locator('button:has-text("New Game")').click()
  await page.locator('#new-game-start').click()
}
