import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cn } from "@/lib/utils";

/** Three weights platform-wide (Regular 400, Medium 500, Semibold 600), always through the --fw-* tokens. */
describe("typography: three weights, as tokens", () => {
  it("no page or component uses Tailwind's raw weight names", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && /(?<![\w-])font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)(?![\w-])/.test(readFileSync(path, "utf8"))) offenders.push(path);
      }
    };
    walk(join(process.cwd(), "src/app"));
    walk(join(process.cwd(), "src/components"));
    expect(offenders).toEqual([]);
  });

  it("a weight never knocks out a font family when classes are merged", () => {
    expect(cn("font-brand-mono text-[12px]", "font-fw-medium")).toBe("font-brand-mono text-[12px] font-fw-medium");
    expect(cn("font-fw-regular", "font-fw-semibold")).toBe("font-fw-semibold");
  });
});
