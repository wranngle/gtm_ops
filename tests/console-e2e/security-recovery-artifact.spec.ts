import {test, expect} from './helpers.js';

test('settings security regenerates recovery codes as an in-console review artifact', async ({openConsole}) => {
	const page = await openConsole();
	await page.locator('.sb__item:has-text("Settings")').first().click();
	await page.locator('.settings-nav__item:has-text("Security")').click();

	await expect(page.getByTestId('sec-recovery-artifact')).toHaveCount(0);
	const beforeBatch = await page.getByTestId('sec-recovery-status').textContent();

	await page.getByTestId('sec-regen-recovery').click();
	const artifact = page.getByTestId('sec-recovery-artifact');
	await expect(artifact).toBeVisible();
	await expect(artifact).toHaveAttribute('data-state', 'review');
	await expect(artifact).toContainText(/recovery artifact/i);
	await expect(artifact).toContainText(/copy these one-time codes/i);
	await expect(page.getByTestId('sec-recovery-status')).not.toHaveText(beforeBatch || '');

	const codes = page.getByTestId('sec-recovery-code-list').locator('code');
	await expect(codes).toHaveCount(10);
	await expect(codes.first()).toHaveText(/^WR-01-[A-Z0-9]{6}-[A-Z0-9]{6}$/);

	await page.getByTestId('sec-copy-recovery-codes').click();
	await expect(artifact).toHaveAttribute('data-state', 'copied');
	await expect(page.getByTestId('sec-recovery-artifact-status')).toContainText(/copied/i);
	await expect(page.getByTestId('sec-audit-row').first()).toContainText(/copied recovery code artifact/i);

	await page.getByTestId('sec-store-recovery-codes').click();
	await expect(artifact).toHaveAttribute('data-state', 'stored');
	await expect(page.getByTestId('sec-recovery-code-list')).toHaveCount(0);
	await expect(page.getByTestId('sec-recovery-codes-hidden')).toContainText(/codes hidden/i);
	await expect(page.getByTestId('sec-copy-recovery-codes')).toBeDisabled();
	await expect(page.getByTestId('sec-store-recovery-codes')).toBeDisabled();
	await expect(page.getByTestId('sec-audit-row').first()).toContainText(/marked recovery code artifact stored/i);
});
