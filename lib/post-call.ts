/**
 * Post-call rollup
 *
 * Takes a finished call fixture (transcript + tool calls + outcome) and emits
 * a structured rollup suitable for surfacing on the ops-console call-trace
 * row. The first surfaced field is `sentiment`: a {score, label, confidence}
 * shape backed by a small lexicon so the result is deterministic in DEMO_MODE
 * and unit-testable without an LLM call.
 *
 * Why a lexicon-rollup and not an LLM:
 *  - Per repo-magic feature plan §4 item 3, the proof is a vitest unit test
 *    that asserts score ∈ [-1, 1] from a fixture — that requires determinism.
 *  - Real LLM-graded sentiment is layered on top in production via the
 *    evaluation/* harness; this module is the always-on cheap pass that the
 *    UI chip can render even when grader cost budget is exhausted.
 */

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export type SentimentRollup = {
  score: number;
  label: SentimentLabel;
  confidence: number;
};

export type CallTurn = {
  role?: string;
  speaker?: string;
  text?: string;
  content?: string;
  utterance?: string;
};

export type PostCallFixture = {
  call_id?: string;
  transcript?: CallTurn[] | string;
  outcome?: string;
  verdict?: string;
  [k: string]: unknown;
};

export type PostCallRollup = {
  call_id: string;
  sentiment: SentimentRollup;
};

// Deterministic word lists. Kept short on purpose: every entry has to earn
// its weight by being a high-precision signal of customer sentiment in a
// presales / sales call context. Banned: filler words like "good" with no
// modifier — too ambiguous in transactional speech.
const POSITIVE_TERMS = [
  'great',
  'excellent',
  'perfect',
  'awesome',
  'love',
  'fantastic',
  'wonderful',
  'amazing',
  'happy',
  'excited',
  'thank',
  'thanks',
  'yes',
  'agree',
  'absolutely',
  'definitely',
  'sounds good',
  'works for me',
  "let's do",
  'sign me up',
  'book it',
  'send the quote',
  'approved',
];

const NEGATIVE_TERMS = [
  'terrible',
  'awful',
  'horrible',
  'bad',
  'hate',
  'frustrated',
  'angry',
  'upset',
  'disappointed',
  'broken',
  "doesn't work",
  'not working',
  'too expensive',
  'too much',
  'cancel',
  'refund',
  'unacceptable',
  'lawsuit',
  'complain',
  'complaint',
  'no thanks',
  'not interested',
  'never',
  "won't",
  'wont',
  'reject',
];

const NEGATION_PREFIXES = ['not ', "don't ", 'dont ', 'never '];

function collectText(fixture: PostCallFixture): string {
  const out: string[] = [];
  const transcript = fixture.transcript;
  if (typeof transcript === 'string') {
    out.push(transcript);
  } else if (Array.isArray(transcript)) {
    for (const turn of transcript) {
      const text = turn?.text || turn?.content || turn?.utterance || '';
      if (text) out.push(String(text));
    }
  }
  if (typeof fixture.outcome === 'string') out.push(fixture.outcome);
  return out.join(' \n').toLowerCase();
}

function countHits(haystack: string, terms: string[]): number {
  let hits = 0;
  for (const term of terms) {
    const needle = term.toLowerCase();
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
      const prefix = haystack.slice(Math.max(0, idx - 8), idx);
      const negated = NEGATION_PREFIXES.some(p => prefix.endsWith(p));
      hits += negated ? -1 : 1;
      idx = haystack.indexOf(needle, idx + needle.length);
    }
  }
  return hits;
}

export function scoreSentiment(text: string): SentimentRollup {
  const haystack = String(text || '').toLowerCase();
  const pos = countHits(haystack, POSITIVE_TERMS);
  const neg = countHits(haystack, NEGATIVE_TERMS);
  const total = Math.abs(pos) + Math.abs(neg);
  if (total === 0) {
    return { score: 0, label: 'neutral', confidence: 0 };
  }
  const raw = (pos - neg) / total;
  const score = Math.max(-1, Math.min(1, raw));
  const label: SentimentLabel = score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';
  // Confidence saturates at 6 weighted hits — anything beyond that is
  // diminishing-returns information for the chip's color decision.
  const confidence = Math.min(1, total / 6);
  return { score: round3(score), label, confidence: round3(confidence) };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function processPostCall(fixture: PostCallFixture): PostCallRollup {
  const text = collectText(fixture);
  const sentiment = scoreSentiment(text);
  return {
    call_id: String(fixture.call_id || 'unknown'),
    sentiment,
  };
}

export function sentimentTone(label: SentimentLabel): 'healthy' | 'neutral' | 'critical' {
  return label === 'positive' ? 'healthy' : label === 'negative' ? 'critical' : 'neutral';
}

// Pure-string renderer used by the UI snapshot test. The live UI uses
// the React <Badge> component in shell.tsx with the same tone vocabulary;
// keeping the chip markup deterministic here lets the chip be diffed in a
// Node test environment without pulling in jsdom or react-test-renderer.
export function renderSentimentChipMarkup(sentiment: SentimentRollup): string {
  const tone = sentimentTone(sentiment.label);
  const pct = Math.round(sentiment.confidence * 100);
  return (
    `<span class="badge badge--${tone}" data-testid="sentiment-chip" `
    + `data-sentiment-label="${sentiment.label}" `
    + `data-sentiment-score="${sentiment.score}" `
    + `data-sentiment-confidence="${sentiment.confidence}">`
    + `${sentiment.label} · ${pct}%`
    + `</span>`
  );
}
