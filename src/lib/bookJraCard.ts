import { classOf } from "./form";
import type { Horse, PastRace, StyleHint } from "./types";

/**
 * 競馬ブックの中央の馬柱 (1項目1行で、上から 枠 / 馬番 / 指数 / 印 / 脚質 / 斤量と騎手 (1文字ずつ) / 父・性齢 / 馬名 …) を読む。例:
 *   1 / "1\t" / 50.6 / 先 / "56\t丹" / 内 / 祐 / (父)牡 2 鹿 / (馬名) / … /
 *   3名8･30 新馬 10頭5 / 1600芝B1.34.8(騎手) 55 / S36.1-34.5内S73 / (勝ち馬)0.24462枠1人
 * 近走は古い順に並ぶ。通過順は載っていないので、脚質 (逃・先・差・追) を位置取りの手がかりにする。
 */
export function parseBookJraCard(text: string): Horse[] {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const starts: number[] = [];
  lines.forEach((l, i) => {
    if (/^[1-8]$/.test(l) && /^\d{1,2}$/.test(lines[i + 1] ?? "") && /^\d{2}\.\d$/.test(lines[i + 2] ?? "")) starts.push(i);
  });
  const horses: Horse[] = [];
  starts.forEach((at, k) => {
    const h = readHorse(lines.slice(at, starts[k + 1] ?? lines.length));
    if (h) horses.push(h);
  });
  return horses.length >= 2 ? horses : [];
}

// 競馬場の1文字表記
const VENUE: Record<string, string> = { 東: "東京", 中: "中山", 京: "京都", 阪: "阪神", 名: "中京", 新: "新潟", 福: "福島", 小: "小倉", 札: "札幌", 函: "函館" };
const SIRE_RE = /^(.+?)(牡|牝|セ|騸)\s*(\d{1,2})\s+\S+$/;
const RUN_RE = /^\d{0,2}(東|中|京|阪|名|新|福|小|札|函)(\d{1,2})[･・.](\d{1,2})\s+(\S+)\s+(\d{1,2})頭(\d{1,2})?/;
const COURSE_RE = /^(\d{3,4})(芝|ダ|障)(?:内|外|直)?[A-D]?(\d\.\d{2}\.\d|\d{2}\.\d)(\D+?)\s+(\d{2}(?:\.\d)?)/;
const PACE_RE = /^([SMH])(\d{2}\.\d)-(\d{2}\.\d)/;
const MARGIN_RE = /(\d{1,2}\.\d)(\d{3})(\d{1,2})枠(\d{1,2})人$/;

function readHorse(block: string[]): Horse | undefined {
  const frame = Number(block[0]);
  const number = Number(block[1]);
  const carriedAt = block.findIndex((l, i) => i > 2 && /^\d{2}(\.\d)?\t?\S?$/.test(l) && /\t/.test(l));
  const sireAt = block.findIndex((l) => SIRE_RE.test(l));
  if (carriedAt < 0 || sireAt < carriedAt) return undefined;
  // 指数と斤量の間: 印 (◎○▲△・など)、脚質、減量の記号 (★◇▲☆)
  const style = block.slice(3, carriedAt).find((l) => /^(逃|先|差|追)$/.test(l)) as StyleHint | undefined;
  const [carried, firstChar] = block[carriedAt].split("\t");
  const jockey = [firstChar ?? "", ...block.slice(carriedAt + 1, sireAt)].join("").replace(/\s/g, "");
  const sire = SIRE_RE.exec(block[sireAt])![1];
  const name = (block[sireAt + 1] ?? "").replace(/^[(（][^)）]*[)）]\s*/, "").replace(/[［\[].*$/, "").trim();
  if (!name) return undefined;

  const pastRaces: PastRace[] = [];
  block.forEach((l, i) => {
    const m = RUN_RE.exec(l);
    if (!m || i <= sireAt) return;
    const venue = VENUE[m[1]];
    const course = COURSE_RE.exec(block[i + 1] ?? "");
    const pace = PACE_RE.exec(block[i + 2] ?? "");
    const margin = MARGIN_RE.exec(block[i + 3] ?? "");
    const finish = m[6] ? Number(m[6]) : undefined;
    const cls = classOf(`${venue}${m[4]}`);
    pastRaces.push({
      date: `${m[2]}/${m[3]}`,
      venue,
      passing: [] as number[],
      fieldSize: Number(m[5]),
      ...(finish !== undefined ? { finish } : {}),
      ...(course ? { distance: Number(course[1]), surface: course[2] as "芝" | "ダ" | "障", jockey: course[4].trim(), carried: Number(course[5]) } : {}),
      ...(pace ? { pace: pace[1] as "S" | "M" | "H", first3f: Number(pace[2]), last3f: Number(pace[3]) } : {}),
      ...(pace ? passingOf((block[i + 2] ?? "").slice(pace[0].length), Number(m[5])) : {}),
      // 勝ったレースは2着馬との差が書かれているので、勝ち馬との差は 0
      ...(finish === 1 ? { margin: 0 } : margin ? { margin: Number(margin[1]) } : {}),
      className: cls?.name ?? m[4],
      ...(cls ? { classLevel: cls.level } : {}),
    });
  });

  return {
    number,
    frame,
    name,
    pastRaces: pastRaces.reverse(), // 新しい順にする
    ...(jockey ? { jockey } : {}),
    ...(carried ? { carried: Number(carried) } : {}),
    ...(sire ? { sire } : {}),
    ...(style ? { styleHint: style } : {}),
  };
}

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱";

/**
 * ペースの行の上がり3Fのあと (通過順・4角位置取り・スピード指数) から通過順を取る。
 * 「5-5-4内S73」「⑤⑤④内73」「5 5 4 中 61」などに対応。通過順がなければ何も返さない。
 */
export function passingOf(rest: string, fieldSize: number): { passing: number[] } | Record<string, never> {
  const body = rest.replace(/(最内|大外|内|中|外)?\s*S?\s*\d{1,3}\s*$/, "").trim();
  if (!body) return {};
  const nums = [...body.replace(/[①-⑱]/g, (c) => ` ${CIRCLED.indexOf(c) + 1} `).matchAll(/\d{1,2}/g)].map((x) => Number(x[0]));
  if (nums.length === 0 || nums.length > 4 || nums.some((n) => n < 1 || n > Math.max(fieldSize, 18))) return {};
  return { passing: nums };
}
