import { describe, expect, it } from "vitest";
import { buildSmokeProviderCases, loadSmokeEnv, runSmokeProviderCase } from "./providerSmoke";

const smokeEnv = loadSmokeEnv();

describe("cloud provider smoke tests", () => {
  for (const testCase of buildSmokeProviderCases()) {
    it(`${testCase.kind}: ${testCase.label}`, async () => {
      const result = await runSmokeProviderCase(testCase, { env: smokeEnv });
      if (result.skipped) {
        console.info(`Skipped ${testCase.kind}:${testCase.provider} (${result.detail})`);
        expect(result.skipped).toBe(true);
        return;
      }
      console.info(`Passed ${testCase.kind}:${testCase.provider} (${result.detail})`);
      expect(result.skipped).toBe(false);
    }, 60000);
  }
});
