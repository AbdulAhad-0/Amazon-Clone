import { describe, expect, it } from "vitest";
import { safeNext } from "../lib/safe-next";

describe("safeNext — open-redirect guard (?next=)", () => {
  it("allows single-leading-slash paths", () => {
    expect(safeNext("/orders")).toBe("/orders");
    expect(safeNext("/")).toBe("/");
    expect(safeNext("/search?q=x")).toBe("/search?q=x");
    expect(safeNext("/p/some-slug")).toBe("/p/some-slug");
    expect(safeNext("/checkout")).toBe("/checkout");
  });

  it("rejects protocol-relative //evil (would leave the site)", () => {
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("///evil.com")).toBe("/");
    expect(safeNext("//evil.com/path")).toBe("/");
  });

  it("rejects backslash tricks /\\evil", () => {
    expect(safeNext("/\\evil")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("/\\")).toBe("/");
  });

  it("rejects external and malformed URLs", () => {
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("http://evil.com/x")).toBe("/");
    expect(safeNext("evil.com")).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext("/")).toBe("/");
    expect(safeNext("orders")).toBe("/");
  });
});
