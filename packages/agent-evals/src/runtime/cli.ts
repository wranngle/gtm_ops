import { loadSettings } from "../config";
import { createFileConversationRepository } from "../repo";
import { SystemClock, StderrJsonLogger } from "../providers";
import { createEvaluator } from "../service";
import { renderResultsMarkdown } from "../ui";

function main(): void {
  const fixturePath = process.argv[2];
  if (!fixturePath) {
    process.stderr.write(
      "usage: bun run src/runtime/cli.ts <conversations.json>\n",
    );
    process.exit(2);
  }
  const settings = loadSettings();
  const repository = createFileConversationRepository(settings, fixturePath);
  const evaluator = createEvaluator(
    repository,
    {
      maxTurnDurationMs: settings.maxTurnDurationMs,
      minAgentTurnRatio: settings.minAgentTurnRatio,
    },
    SystemClock,
    StderrJsonLogger,
  );
  const results = evaluator.evaluateAll();
  process.stdout.write(renderResultsMarkdown(results));
  const failed = results.filter((r) => !r.passed).length;
  process.exit(failed === 0 ? 0 : 1);
}

main();
