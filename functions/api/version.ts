// /api/version — build-provenance probe. Sibling to /api/health.
// Mirrors lib/version.ts so local Express + Cloudflare Pages return the
// same JSON. Cite PR #169 (ticker) for the shared-lib + Express + Pages
// triple-deploy pattern.

import {jsonResponse, type Env} from '../_lib/respond';
import {buildVersionPayload} from '../../lib/version';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  // Pages runtime doesn't expose process.version; surface the Workers
  // runtime identifier instead so the field is non-empty even in prod.
  const runtimeVersion =
    typeof navigator !== 'undefined' && (navigator as {userAgent?: string}).userAgent
      ? (navigator as {userAgent: string}).userAgent
      : 'cloudflare-workers';
  return jsonResponse(
    buildVersionPayload(
      {
        GIT_SHA: context.env.CF_PAGES_COMMIT_SHA,
        CF_PAGES_COMMIT_SHA: context.env.CF_PAGES_COMMIT_SHA,
      },
      {version: runtimeVersion},
    ),
  );
};
