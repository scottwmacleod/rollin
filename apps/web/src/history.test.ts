import { expect, test } from "vitest";
import { pastFormulas, stepHistory } from "./history";

test("past formulas run newest first and drop immediate repeats", () => {
  expect(pastFormulas(["d20", "2d6", "2d6", "d20"])).toEqual(["d20", "2d6", "d20"]);
  expect(pastFormulas([])).toEqual([]);
});

test("Up walks back, stops at the oldest, and Down returns to the draft", () => {
  const past = ["c", "b", "a"];
  const one = stepHistory(past, null, "up", "half-typed");
  expect(one).toEqual({ nav: { at: 0, draft: "half-typed" }, text: "c" });
  const two = stepHistory(past, one?.nav ?? null, "up", "c");
  expect(two?.text).toBe("b");
  const three = stepHistory(past, two?.nav ?? null, "up", "b");
  expect(three?.text).toBe("a");
  expect(stepHistory(past, three?.nav ?? null, "up", "a")).toBeNull();

  const back = stepHistory(past, three?.nav ?? null, "down", "a");
  expect(back?.text).toBe("b");
  const newer = stepHistory(past, back?.nav ?? null, "down", "b");
  expect(newer?.text).toBe("c");
  expect(stepHistory(past, newer?.nav ?? null, "down", "c")).toEqual({
    nav: null,
    text: "half-typed",
  });
});

test("keys do nothing with no history, or Down while typing", () => {
  expect(stepHistory([], null, "up", "x")).toBeNull();
  expect(stepHistory(["a"], null, "down", "x")).toBeNull();
});
