// /api/sample — synthetic demo brief for the operator-console UI.
// Local Express path: server.ts:946 reads apps/ops-console/fixtures/sample.json
// or falls through to examples/*.json. On Pages we bundle the canonical
// fixture as an import — single source of truth, no fs reads.

import sampleFixture from '../../apps/ops-console/fixtures/sample.json';
import {jsonResponse, type Env} from '../_lib/respond';

export const onRequestGet: PagesFunction<Env> = async () =>
  jsonResponse(sampleFixture);
