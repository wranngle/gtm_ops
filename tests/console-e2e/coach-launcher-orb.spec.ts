/**
 * Coach launcher uses the real ElevenUI.Orb component (not the legacy
 * `.coach-launcher__orb` radial-gradient blob). Asserts the launcher chip
 * mounts an `.el-orb` from elevenlabs-ui.jsx, and the legacy class is gone.
 */
import { test, expect } from './_helpers.js';

test.describe('coach launcher orb', () => {
  test('renders ElevenUI.Orb inside the launcher', async ({ openConsole }) => {
    const page = await openConsole();
    const launcher = page.locator('.coach-launcher');
    await expect(launcher).toBeVisible();
    const orb = launcher.locator('.el-orb');
    await expect(orb).toHaveCount(1);
    const legacy = launcher.locator('.coach-launcher__orb');
    await expect(legacy).toHaveCount(0);
  });

  test('legacy .coach-launcher__orb class is gone from the document', async ({ openConsole }) => {
    const page = await openConsole();
    const legacyCount = await page.locator('.coach-launcher__orb').count();
    expect(legacyCount).toBe(0);
  });
});
