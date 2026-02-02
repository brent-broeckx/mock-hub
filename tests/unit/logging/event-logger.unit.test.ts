import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import { createEventLogger } from "../../../src/logging/event-logger";

describe("logging", () => {
  describe("event-logger", () => {
    it("should emit stable JSONL with sorted keys", () => {
      const stream = new PassThrough();
      let output = "";
      stream.on("data", (chunk) => {
        output += chunk.toString("utf-8");
      });

      const logger = createEventLogger({ mode: "ci", stream, format: "jsonl" });

      logger.emitEvent({
        event: "scenario-resolution",
        method: "GET",
        path: "/contracts",
        result: "none",
        action: "passthrough",
      });

      expect(output).toBe(
        '{"action":"passthrough","event":"scenario-resolution","method":"GET","path":"/contracts","result":"none"}\n'
      );
    });
  });
});
