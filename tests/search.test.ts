import { describe, expect, it } from "vitest";
import { buildQOrClause, escapeLike, parseSearchParams } from "../lib/search";

describe("escapeLike", () => {
  it("escapes LIKE wildcards % _ \\ and *", () => {
    expect(escapeLike("50%_off\\x")).toBe("50\\%\\_off\\\\x");
    expect(escapeLike("a*b")).toBe("a\\*b");
  });
  it("escapes commas, parentheses and brackets", () => {
    expect(escapeLike("a,b(c)[d]")).toBe("a\\,b\\(c\\)\\[d\\]");
  });
  it("escapes quotes so men's has no raw quote passthrough", () => {
    expect(escapeLike("men's")).toBe("men\\'s");
    expect(escapeLike('a"b')).toBe('a\\"b');
  });
  it("escapes every reserved char in a,b(c)%", () => {
    expect(escapeLike("a,b(c)%")).toBe("a\\,b\\(c\\)\\%");
  });
});

describe("parseSearchParams — defaults", () => {
  it("empty params → no filters, sort=relevance, page=1", () => {
    expect(parseSearchParams({})).toEqual({ sort: "relevance", page: 1 });
  });
  it("blank and array values are normalized (first wins, blank dropped)", () => {
    expect(parseSearchParams({ q: "   ", min: "", brand: ["Bose", "Anker"] })).toEqual({
      sort: "relevance",
      page: 1,
      brand: "Bose",
    });
  });
});

describe("parseSearchParams — price dollars to cents", () => {
  it("converts min/max dollars into cents", () => {
    const p = parseSearchParams({ min: "20", max: "100.5" });
    expect(p.minCents).toBe(2000);
    expect(p.maxCents).toBe(10050);
  });
  it("drops non-numeric and negative prices", () => {
    expect(parseSearchParams({ min: "abc" })).toEqual({ sort: "relevance", page: 1 });
    expect(parseSearchParams({ min: "-5" })).toEqual({ sort: "relevance", page: 1 });
    expect(parseSearchParams({ max: "20abc" })).toEqual({ sort: "relevance", page: 1 });
  });
  it("swaps when min > max", () => {
    const p = parseSearchParams({ min: "50", max: "10" });
    expect(p.minCents).toBe(1000);
    expect(p.maxCents).toBe(5000);
  });
});

describe("parseSearchParams — sort whitelist", () => {
  it("keeps whitelisted sort values", () => {
    for (const s of ["relevance", "price_asc", "price_desc", "rating", "newest"]) {
      expect(parseSearchParams({ sort: s }).sort).toBe(s);
    }
  });
  it("sort=DROP TABLE falls back to relevance", () => {
    expect(parseSearchParams({ sort: "DROP TABLE" }).sort).toBe("relevance");
    expect(parseSearchParams({ sort: "evil" }).sort).toBe("relevance");
  });
});

describe("parseSearchParams — rating whitelist", () => {
  it("rating=9 is ignored (defaults)", () => {
    expect(parseSearchParams({ rating: "9" })).toEqual({ sort: "relevance", page: 1 });
  });
  it("keeps rating 4 and 3 only", () => {
    expect(parseSearchParams({ rating: "4" }).rating).toBe(4);
    expect(parseSearchParams({ rating: "3" }).rating).toBe(3);
    expect(parseSearchParams({ rating: "0" }).rating).toBeUndefined();
    expect(parseSearchParams({ rating: "abc" }).rating).toBeUndefined();
  });
});

describe("parseSearchParams — q and page", () => {
  it("keeps q raw (escaping happens at query build), trimmed", () => {
    expect(parseSearchParams({ q: " men's " }).q).toBe("men's");
    expect(parseSearchParams({ q: "zzz nope" }).q).toBe("zzz nope");
  });
  it("page parses to a positive integer, invalid → 1", () => {
    expect(parseSearchParams({ page: "2" }).page).toBe(2);
    expect(parseSearchParams({ page: "abc" }).page).toBe(1);
    expect(parseSearchParams({ page: "-3" }).page).toBe(1);
    expect(parseSearchParams({ page: "0" }).page).toBe(1);
  });
});

describe("buildQOrClause — injection safety", () => {
  const columns = ["title", "description", "brand"];

  it("builds exactly three ilike clauses from constant columns", () => {
    const clause = buildQOrClause("shirt");
    expect(clause.match(/ilike/g)).toHaveLength(3);
    for (const c of columns) expect(clause).toContain(`${c}.ilike.`);
    expect(clause).toBe('title.ilike."%shirt%",description.ilike."%shirt%",brand.ilike."%shirt%"');
  });

  it("q with a quote never passes a raw quote into the clause", () => {
    const clause = buildQOrClause("men's");
    expect(clause).not.toMatch(/(^|[^\\])'/);
    expect(clause).toContain("men\\'s");
  });

  it("q with % and commas cannot add wildcards or clauses", () => {
    const clause = buildQOrClause("50%,off");
    expect(clause.match(/ilike/g)).toHaveLength(3);
    expect(clause).toContain("50\\%\\,off");
  });

  it("payloads a,b / men's / % / DROP TABLE stay inside one quoted value", () => {
    for (const payload of ["a,b", "men's", "%", "DROP TABLE", 'a"b', "x)y", "z]w"]) {
      const clause = buildQOrClause(payload);
      expect(clause.match(/ilike/g)).toHaveLength(3);
      expect(clause.startsWith('title.ilike."')).toBe(true);
      expect(clause.endsWith('"')).toBe(true);
    }
  });
});
