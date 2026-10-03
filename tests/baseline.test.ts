import { expect, it } from "vitest";

import pkg from "@/package.json";

it("test runner resolves the @ alias to the repo root", () => {
  expect(pkg.name).toBe("vendra");
});
