import { describe, expect, it } from "vitest";
import { CODE128_PATTERNS, code128Modules, encodeCode128B } from "./code128";

describe("Code 128 pattern table", () => {
  it("has 107 distinct symbols, each 11 modules (stop 13) with an even bar total", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.forEach((pattern, value) => {
      const widths = [...pattern].map(Number);
      expect(widths.reduce((a, b) => a + b, 0)).toBe(value === 106 ? 13 : 11);
      // Code 128 parity: bar modules even, space modules odd.
      const bars = widths.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
      expect(bars % 2).toBe(0);
    });
  });
});

describe("encodeCode128B", () => {
  it("encodes a single character with Start B, checksum and stop", () => {
    // "A" = 33; checksum (104 + 33*1) mod 103 = 34.
    const code = encodeCode128B("A");
    expect(code.values).toEqual([104, 33, 34, 106]);
    expect(code.widths.join("")).toBe("211214" + "111323" + "131123" + "2331112");
  });

  it("weights the checksum by position (PJJ123C)", () => {
    // 104 + 48*1 + 42*2 + 42*3 + 17*4 + 18*5 + 19*6 + 35*7 = 879; 879 mod 103 = 55.
    const code = encodeCode128B("PJJ123C");
    expect(code.values).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55, 106]);
    expect(code128Modules(code)).toBe(11 * 9 + 13);
    expect(code.widths[0]).toBe(2); // starts with a bar
  });

  it("refuses characters outside printable ASCII", () => {
    expect(() => encodeCode128B("")).toThrow();
    expect(() => encodeCode128B("RÉF")).toThrow();
    expect(() => encodeCode128B("a\tb")).toThrow();
  });
});
