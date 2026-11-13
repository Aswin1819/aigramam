import { describe, expect, it } from "vitest";
import { waitingSummary } from "./status";

describe("waiting summary", () => {
  it("says 'needs you' only for approvals and questions", () => {
    const turn = { status: "waiting" as const, waitingReason: "turn_end" as const };
    const ask = { status: "waiting" as const, waitingReason: "question" as const };
    const work = { status: "working" as const };
    expect(waitingSummary([turn])).toBe("1 your turn");
    expect(waitingSummary([ask])).toBe("1 needs you");
    expect(waitingSummary([ask, ask, turn, work])).toBe("2 need you · 1 your turn");
    expect(waitingSummary([work])).toBe("");
  });
});
