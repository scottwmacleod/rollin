import { describe, expect, it } from "vitest";
import { shouldClose } from "./swipeClose";

describe("shouldClose", () => {
  const width = 300;

  it("closes past a third of the width", () => {
    expect(shouldClose(-101, width, 0)).toBe(true);
    expect(shouldClose(-99, width, 0)).toBe(false);
  });

  it("closes on a quick flick left from any distance", () => {
    expect(shouldClose(-20, width, -0.8)).toBe(true);
    expect(shouldClose(-20, width, -0.2)).toBe(false);
  });

  it("never closes on no movement or a move right", () => {
    expect(shouldClose(0, width, -2)).toBe(false);
    expect(shouldClose(50, width, 2)).toBe(false);
  });
});
