import { describe, expect, it } from "vitest";
import { queuedWorkHoldsRestart } from "./restart-holds";

describe("queuedWorkHoldsRestart", () => {
  const hooks = (unfinished: string[], held: string[]) => ({
    hasUnfinishedDelivery: (agentId: string) => unfinished.includes(agentId),
    limitHeld: (agentId: string) => held.includes(agentId),
  });

  it("holds the restart for a queued message that can start", () => {
    expect(queuedWorkHoldsRestart(["a", "b"], hooks(["a"], []))).toBe(true);
  });

  it("does not hold it for messages that a spent plan holds", () => {
    expect(queuedWorkHoldsRestart(["sales", "fx"], hooks(["sales", "fx"], ["sales", "fx"]))).toBe(false);
  });

  it("still holds it when another agent has work that can start", () => {
    expect(queuedWorkHoldsRestart(["sales", "pokebot"], hooks(["sales", "pokebot"], ["sales"]))).toBe(true);
  });

  it("does not hold it without queued work", () => {
    expect(queuedWorkHoldsRestart(["a"], hooks([], ["a"]))).toBe(false);
  });
});
