import { describe, expect, it } from "vitest";
import { formatCents, parseDollarsToCents } from "../lib/money";

describe("formatCents", () => {
  it("formats 1299 as $12.99", () => {
    expect(formatCents(1299)).toBe("$12.99");
  });
  it("formats 0 as $0.00", () => {
    expect(formatCents(0)).toBe("$0.00");
  });
  it("formats 129900 with thousands grouping", () => {
    expect(formatCents(129900)).toBe("$1,299.00");
  });
});

describe("parseDollarsToCents", () => {
  it("parses 12.99 as 1299", () => {
    expect(parseDollarsToCents("12.99")).toBe(1299);
  });
  it("parses empty string as 0", () => {
    expect(parseDollarsToCents("")).toBe(0);
  });
  it("parses 35 as 3500", () => {
    expect(parseDollarsToCents("35")).toBe(3500);
  });
});
