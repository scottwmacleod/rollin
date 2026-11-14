import { expect, test } from "vitest";
import { ENGINE_NAME } from "./index";

test("the engine package builds and is importable", () => {
  expect(ENGINE_NAME).toBe("rollin-engine");
});
