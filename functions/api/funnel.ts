// /api/funnel — stage-conversion rollup for the Funnel page. No live funnel
// source exists yet in D1 (calls live in ElevenLabs, proposals in history),
// so this serves the synthetic funnel with an explicit `source` marker the
// page surfaces as a label. Before this function existed the route 404'd on
// the production host and the old `_redirects` wildcard 200'd the same data
// with nothing marking it synthetic. Replace with a real rollup (tryD1) when
// call-event persistence lands.

import funnelFixture from '../../apps/ops-console/fixtures/funnel.json';
import {jsonResponse, type Env} from '../_lib/respond';

export const onRequestGet: PagesFunction<Env> = async () =>
  jsonResponse({...funnelFixture, source: 'fixture'});
