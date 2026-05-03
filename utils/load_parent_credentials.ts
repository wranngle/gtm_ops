/**
 * Credential Inheritance Utility
 *
 * Child projects inherit credentials from ~/.claude/.env (global authority)
 * per Layer 8 (Credential Centralization) governance.
 *
 * Usage:
 *   import { loadParentCredentials } from './utils/load_parent_credentials.js';
 *   loadParentCredentials();
 *   // Now process.env contains all global credentials
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const GLOBAL_ENV_PATH = join(homedir(), '.claude', '.env');

export function loadParentCredentials(): Record<string, string> {
	if (!existsSync(GLOBAL_ENV_PATH)) {
		console.warn(`[credential-loader] Global .env not found at ${GLOBAL_ENV_PATH}`);
		return {};
	}

	const content = readFileSync(GLOBAL_ENV_PATH, 'utf8');
	const loaded: Record<string, string> = {};

	for (const line of content.split('\n')) {
		const trimmed = line.trim();

		// Skip comments and empty lines
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}

		const equalIndex = trimmed.indexOf('=');
		if (equalIndex === -1) {
			continue;
		}

		const key = trimmed.slice(0, equalIndex);
		const value = trimmed.slice(equalIndex + 1);

		// Only set if not already in environment (don't override explicit settings)
		if (!process.env[key]) {
			process.env[key] = value;
			loaded[key] = value;
		}
	}

	console.log(`[credential-loader] Loaded ${Object.keys(loaded).length} credentials from global authority`);
	return loaded;
}

// Auto-load on import if running as entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
	loadParentCredentials();
}
