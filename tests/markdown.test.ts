import { describe, expect, it } from "vitest";
import { escapeCurrencyDollars } from "@/lib/markdown/dollars";

describe("escapeCurrencyDollars", () => {
  it("leaves inline and display math alone", () => {
    expect(escapeCurrencyDollars("where $P$ is the loan and $r$ the rate")).toBe("where $P$ is the loan and $r$ the rate");
    expect(escapeCurrencyDollars("$$\nM = P \\cdot r\n$$")).toBe("$$\nM = P \\cdot r\n$$");
    expect(escapeCurrencyDollars("falls back to $P / n$.")).toBe("falls back to $P / n$.");
  });

  it("escapes prices", () => {
    expect(escapeCurrencyDollars("For a $400,000 home, PMI is $150 a month.")).toBe("For a \\$400,000 home, PMI is \\$150 a month.");
    expect(escapeCurrencyDollars("$20,000 and $30,000")).toBe("\\$20,000 and \\$30,000");
    expect(escapeCurrencyDollars("costs $5")).toBe("costs \\$5");
  });

  it("does not pair dollars across paragraphs", () => {
    expect(escapeCurrencyDollars("a $5 fee\n\nand x$ later")).toBe("a \\$5 fee\n\nand x\\$ later");
  });

  it("skips code", () => {
    expect(escapeCurrencyDollars("`$2,450/mo` and $10")).toBe("`$2,450/mo` and \\$10");
    expect(escapeCurrencyDollars("```sh\necho $HOME $PATH\n```\nCosts $3")).toBe("```sh\necho $HOME $PATH\n```\nCosts \\$3");
    expect(escapeCurrencyDollars("~~~\n$x\n~~~")).toBe("~~~\n$x\n~~~");
  });

  it("keeps escaped dollars", () => {
    expect(escapeCurrencyDollars("costs \\$5")).toBe("costs \\$5");
  });
});
