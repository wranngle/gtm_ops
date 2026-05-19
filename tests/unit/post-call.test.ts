/**
 * Unit tests for lib/post-call.ts
 *
 * Proof targets (repo-magic feature plan §4 item 3):
 *  1. processPostCall(fixture) returns a sentiment object whose score is
 *     bounded to [-1, 1].
 *  2. UI snapshot: each row produces a colored chip whose markup carries
 *     the sentiment label and a tone class.
 */
import { describe, it, expect } from 'vitest';
import {
  processPostCall,
  scoreSentiment,
  renderSentimentChipMarkup,
  sentimentTone,
  type PostCallFixture,
} from '../../lib/post-call.js';

const POSITIVE_FIXTURE: PostCallFixture = {
  call_id: 'call_pos_001',
  transcript: [
    { role: 'customer', text: 'This sounds great, thank you so much.' },
    { role: 'agent', text: 'Awesome — sending the quote now.' },
    { role: 'customer', text: 'Perfect, let\'s do it. Sign me up.' },
  ],
  outcome: 'booked',
};

const NEGATIVE_FIXTURE: PostCallFixture = {
  call_id: 'call_neg_001',
  transcript: [
    { role: 'customer', text: 'This is too expensive, I am frustrated.' },
    { role: 'agent', text: 'I understand the concern.' },
    { role: 'customer', text: 'Cancel my account. Not interested anymore.' },
  ],
  outcome: 'churned',
};

const NEUTRAL_FIXTURE: PostCallFixture = {
  call_id: 'call_neu_001',
  transcript: [
    { role: 'customer', text: 'Can you walk me through the pricing tiers?' },
    { role: 'agent', text: 'Sure — three plans, monthly billing.' },
  ],
  outcome: 'info_request',
};

const EMPTY_FIXTURE: PostCallFixture = {
  call_id: 'call_empty_001',
  transcript: [],
};

describe('processPostCall', () => {
  it('emits a sentiment object with score in [-1, 1] and required keys', () => {
    const rollup = processPostCall(POSITIVE_FIXTURE);
    expect(rollup).toMatchObject({ call_id: 'call_pos_001' });
    expect(rollup.sentiment).toBeDefined();
    expect(rollup.sentiment).toHaveProperty('score');
    expect(rollup.sentiment).toHaveProperty('label');
    expect(rollup.sentiment).toHaveProperty('confidence');
    expect(rollup.sentiment.score).toBeGreaterThanOrEqual(-1);
    expect(rollup.sentiment.score).toBeLessThanOrEqual(1);
    expect(rollup.sentiment.confidence).toBeGreaterThanOrEqual(0);
    expect(rollup.sentiment.confidence).toBeLessThanOrEqual(1);
    expect(['positive', 'neutral', 'negative']).toContain(rollup.sentiment.label);
  });

  it('classifies an enthusiastic transcript as positive', () => {
    const rollup = processPostCall(POSITIVE_FIXTURE);
    expect(rollup.sentiment.label).toBe('positive');
    expect(rollup.sentiment.score).toBeGreaterThan(0.2);
  });

  it('classifies a churn transcript as negative', () => {
    const rollup = processPostCall(NEGATIVE_FIXTURE);
    expect(rollup.sentiment.label).toBe('negative');
    expect(rollup.sentiment.score).toBeLessThan(-0.2);
  });

  it('returns neutral with zero confidence on empty transcript', () => {
    const rollup = processPostCall(EMPTY_FIXTURE);
    expect(rollup.sentiment).toEqual({ score: 0, label: 'neutral', confidence: 0 });
  });

  it('respects negation: "not great" does not register positive', () => {
    const s = scoreSentiment("the demo was not great, I am not happy with the pricing");
    expect(s.score).toBeLessThanOrEqual(0);
  });

  it('clamps any input within [-1, 1] even when terms repeat', () => {
    const repeated = 'great '.repeat(50) + 'terrible '.repeat(5);
    const s = scoreSentiment(repeated);
    expect(s.score).toBeGreaterThanOrEqual(-1);
    expect(s.score).toBeLessThanOrEqual(1);
  });
});

describe('renderSentimentChipMarkup (UI snapshot)', () => {
  it('renders a colored chip per row across positive/neutral/negative fixtures', () => {
    const rows = [POSITIVE_FIXTURE, NEUTRAL_FIXTURE, NEGATIVE_FIXTURE];
    const markup = rows
      .map(processPostCall)
      .map(r => renderSentimentChipMarkup(r.sentiment))
      .join('\n');
    expect(markup).toMatchInlineSnapshot(`
      "<span class="badge badge--healthy" data-testid="sentiment-chip" data-sentiment-label="positive" data-sentiment-score="1" data-sentiment-confidence="1">positive · 100%</span>
      <span class="badge badge--neutral" data-testid="sentiment-chip" data-sentiment-label="neutral" data-sentiment-score="0" data-sentiment-confidence="0">neutral · 0%</span>
      <span class="badge badge--critical" data-testid="sentiment-chip" data-sentiment-label="negative" data-sentiment-score="-1" data-sentiment-confidence="0.667">negative · 67%</span>"
    `);
  });

  it('every chip carries a tone class derived from its label', () => {
    expect(sentimentTone('positive')).toBe('healthy');
    expect(sentimentTone('neutral')).toBe('neutral');
    expect(sentimentTone('negative')).toBe('critical');
  });
});
