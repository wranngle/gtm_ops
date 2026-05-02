import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  WebhookPayloadSchema,
  WebhookEventTypeSchema,
  type WebhookPayload,
} from "../src/types";

const fixturesDir = join(import.meta.dir, "..", "fixtures");

describe("webhook contracts", () => {
  test("all webhook event fixtures conform to schema", () => {
    const fixturePath = join(fixturesDir, "webhook-events.json");
    const raw = readFileSync(fixturePath, "utf-8");
    const parsed: unknown = JSON.parse(raw);

    expect(Array.isArray(parsed)).toBe(true);
    const events = parsed as WebhookPayload[];
    expect(events.length).toBeGreaterThan(0);

    for (const event of events) {
      const result = WebhookPayloadSchema.safeParse(event);
      expect(result.success).toBe(
        true,
        `Event validation failed: ${result.error?.message || "unknown error"}`
      );
    }
  });

  test("conversation.started events include metadata", () => {
    const fixturePath = join(fixturesDir, "webhook-events.json");
    const raw = readFileSync(fixturePath, "utf-8");
    const events = JSON.parse(raw) as WebhookPayload[];

    const startedEvents = events.filter((e) => e.type === "conversation.started");
    expect(startedEvents.length).toBeGreaterThan(0);

    for (const event of startedEvents) {
      expect(event.conversationMetadata).toBeDefined();
      expect(event.conversationMetadata?.conversationId).toBeTruthy();
      expect(event.conversationMetadata?.agentId).toBeTruthy();
      expect(event.conversationMetadata?.startedAtMs).toBeDefined();
    }
  });

  test("transcript.ready events include transcript data", () => {
    const fixturePath = join(fixturesDir, "webhook-events.json");
    const raw = readFileSync(fixturePath, "utf-8");
    const events = JSON.parse(raw) as WebhookPayload[];

    const transcriptEvents = events.filter((e) => e.type === "transcript.ready");
    expect(transcriptEvents.length).toBeGreaterThan(0);

    for (const event of transcriptEvents) {
      expect(event.transcriptData).toBeDefined();
      expect(event.transcriptData?.conversationId).toBeTruthy();
      expect(event.transcriptData?.turns.length).toBeGreaterThan(0);
      expect(event.transcriptData?.completedAtMs).toBeGreaterThan(0);

      for (const turn of event.transcriptData?.turns ?? []) {
        expect(["agent", "caller"]).toContain(turn.role);
        expect(turn.text.length).toBeGreaterThan(0);
        expect(turn.startedAtMs).toBeGreaterThanOrEqual(0);
        expect(turn.durationMs).toBeGreaterThan(0);
      }
    }
  });

  test("conversation.ended events have metadata with endedAtMs", () => {
    const fixturePath = join(fixturesDir, "webhook-events.json");
    const raw = readFileSync(fixturePath, "utf-8");
    const events = JSON.parse(raw) as WebhookPayload[];

    const endedEvents = events.filter((e) => e.type === "conversation.ended");
    expect(endedEvents.length).toBeGreaterThan(0);

    for (const event of endedEvents) {
      expect(event.conversationMetadata).toBeDefined();
      expect(event.conversationMetadata?.endedAtMs).toBeDefined();
      expect(
        (event.conversationMetadata?.endedAtMs ?? 0) >=
          (event.conversationMetadata?.startedAtMs ?? 0)
      ).toBe(true);
    }
  });

  test("all webhook event fixtures use synthetic conversation IDs", () => {
    const fixturePath = join(fixturesDir, "webhook-events.json");
    const raw = readFileSync(fixturePath, "utf-8");
    const events = JSON.parse(raw) as WebhookPayload[];

    for (const event of events) {
      const conversationId =
        event.conversationMetadata?.conversationId ||
        event.transcriptData?.conversationId;
      expect(conversationId?.startsWith("synth-")).toBe(
        true,
        `Event ${event.type} has non-synthetic conversation ID: ${conversationId}`
      );
    }
  });

  test("all webhook event fixtures use synthetic agent IDs", () => {
    const fixturePath = join(fixturesDir, "webhook-events.json");
    const raw = readFileSync(fixturePath, "utf-8");
    const events = JSON.parse(raw) as WebhookPayload[];

    for (const event of events) {
      const agentId = event.conversationMetadata?.agentId;
      if (agentId) {
        expect(agentId.startsWith("synth-")).toBe(
          true,
          `Event ${event.type} has non-synthetic agent ID: ${agentId}`
        );
      }
    }
  });

  test("webhook payloads contain valid ISO 8601 timestamps", () => {
    const fixturePath = join(fixturesDir, "webhook-events.json");
    const raw = readFileSync(fixturePath, "utf-8");
    const events = JSON.parse(raw) as WebhookPayload[];

    for (const event of events) {
      const timestamp = new Date(event.timestamp);
      expect(timestamp instanceof Date).toBe(true);
      expect(timestamp.getTime()).toBeGreaterThan(0);
      const isoRegex =
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
      expect(isoRegex.test(event.timestamp)).toBe(true);
    }
  });

  test("webhook transcript turns have monotonic timestamps", () => {
    const fixturePath = join(fixturesDir, "webhook-events.json");
    const raw = readFileSync(fixturePath, "utf-8");
    const events = JSON.parse(raw) as WebhookPayload[];

    const transcriptEvents = events.filter((e) => e.type === "transcript.ready");
    for (const event of transcriptEvents) {
      const turns = event.transcriptData?.turns ?? [];
      let lastStartTime = -1;
      for (const turn of turns) {
        expect(turn.startedAtMs).toBeGreaterThan(lastStartTime);
        lastStartTime = turn.startedAtMs;
      }
    }
  });

  test("webhook event type schema covers expected event types", () => {
    const expectedTypes = [
      "conversation.started",
      "conversation.ended",
      "transcript.ready",
      "analysis.complete",
    ];
    for (const type of expectedTypes) {
      const result = WebhookEventTypeSchema.safeParse(type);
      expect(result.success).toBe(true);
    }
  });
});
