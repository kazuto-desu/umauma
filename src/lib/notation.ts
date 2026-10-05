import type { PastRace } from "./types";

/**
 * 通過順の手入力テキストを解析する。
 * 1走を空白区切りで並べ、各走は "通過順/頭数" (頭数は省略可)。
 *   例: "3-3-2-1/16 5-4/14 1-1-1-1"
 */
export function parsePassingText(text: string): PastRace[] {
  return text
    .split(/[\s,、]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const [order, field] = token.split("/");
      const passing = order
        .split(/[-－ー]/)
        .map((n) => parseInt(toHalfWidth(n), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      const fieldSize = field ? parseInt(toHalfWidth(field), 10) : undefined;
      return {
        passing,
        fieldSize: Number.isFinite(fieldSize) ? fieldSize : undefined,
      };
    })
    .filter((r) => r.passing.length > 0);
}

export function formatPassingText(races: PastRace[]): string {
  return races
    .filter((r) => r.passing.length > 0)
    .map((r) => r.passing.join("-") + (r.fieldSize ? `/${r.fieldSize}` : ""))
    .join(" ");
}

function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}
