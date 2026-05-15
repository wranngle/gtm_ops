#!/usr/bin/env bun
import { runEvaluation } from '../lib/evaluation/runner.js';

console.log('GEMINI_API_KEY set:', Boolean(process.env.GEMINI_API_KEY));
console.log('Running single evaluation on vapi-dental-001...\n');

const result = await runEvaluation('vapi-dental-001', { directExecution: true });
console.log('\n=== RESULT ===');
console.log('Status:', result.status);
console.log('Score:', result.aggregate_score);
console.log('Flaws:', result.flaws);
