import type { IntakeData } from '../support/factories/intake.factory.js';

export type CompareDimension = {
  dimension: string;
  score: number;
  rationale?: string;
  details?: { missing?: unknown[]; matched?: unknown[]; [k: string]: unknown };
};

export type CompareResult = {
  aggregate_score: number;
  dimensions: CompareDimension[];
  flaws: string[];
  weights?: Record<string, number>;
};

export type EvalIntake = IntakeData;

export type FlawEntry = {
  type: string;
  severity?: string;
  message?: string;
  details?: unknown;
};
