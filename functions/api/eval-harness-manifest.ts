// /api/eval-harness-manifest — surfaces the real eval-harness contract
// the gtm_ops console renders inside the voice_ai_agent_evals bridge.
//
// Single source of truth is the root `eval-harness.manifest.json`,
// which voice_ai_agent_evals also reads. In DEMO_MODE the in-page
// fetch shim rewrites this URL to /fixtures/eval-harness-manifest.json,
// which is a copy of the same file kept in lockstep by the
// bridge-mirrors-real-manifest console-e2e test.

import manifest from '../../eval-harness.manifest.json';
import {jsonResponse, type Env} from '../_lib/respond';

export const onRequestGet: PagesFunction<Env> = async () => jsonResponse(manifest);
