import { frameOf } from "./frame";
import { classOf } from "./form";
import type { Horse, PastRace } from "./types";

/**
 * 近5走が「着順 日付 馬場 頭数」「競馬場 コース距離 馬番」の2行ずつ並び、
 * そのあとに人気・体重・騎手、タイム・通過順・上がり、着差・勝ち馬がタブ区切りで並ぶ形式の馬柱を読む。例:
 *   1\t1\t(馬名)\t(騎手)（愛知）\t65.1
 *   (7人気)
 *   全 1- 0- 0- 5 … (成績)
 *   7 26.09.30　重　12頭
 *   名古屋　右1500　4番
 *   …
 *   牡3\t鹿毛\t04.20生\t▲ 54.0　0-0-0-1\t(レース名)…
 *   (父)\t(調教師)\t469
 *   (-3)\t8人　472　▲(騎手) 54.0\t…
 *   (母)\t(馬主)\t1:36.2　6-9-11-10　39.6\t…
 *   （母父）\t(生産者)\t\t3.7　(勝ち馬)\t…
 * 同じ枠の2頭目は先頭の枠番が省かれる。
 */
export function parseFiveRunCard(text: string): Horse[] {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+$/, ""));
  const starts: { at: number; frame?: number; number: number; name: string; jockey: string; odds?: number }[] = [];
  lines.forEach((l, i) => {
    if (!POPULARITY_RE.test(lines[i + 1]?.trim() ?? "")) return;
    const cells = l.split("\t").map((c) => c.trim());
    const withFrame = cells.length >= 5 && /^\d$/.test(cells[0]) && /^\d{1,2}$/.test(cells[1]);
    const [frame, number, name, jockeyCell, odds] = withFrame ? cells : [undefined, ...cells];
    if (!/^\d{1,2}$/.test(number ?? "") || !name || !jockeyCell) return;
    starts.push({
      at: i,
      ...(frame ? { frame: Number(frame) } : {}),
      number: Number(number),
      name,
      jockey: jockeyCell.replace(/[（(].*$/, "").replace(MARK_RE, ""),
      ...(odds && /^\d+(\.\d)?$/.test(odds) ? { odds: Number(odds) } : {}),
    });
  });

  let lastFrame = 0;
  const horses = starts.map((s, k) => {
    const block = lines.slice(s.at, starts[k + 1]?.at ?? lines.length);
    const frame = s.frame ?? lastFrame;
    lastFrame = frame;
    return { ...s, frame, ...readBlock(block) };
  });
  const fieldSize = horses.length;
  return horses.map(({ at: _at, ...h }) => ({ ...h, frame: h.frame || frameOf(h.number, fieldSize) }));
}

const POPULARITY_RE = /^\((\d+)人気\)/;
const MARK_RE = /^[▲△☆★◇◆]\s*/;
const RUN_RE = /^(\d{1,2}|取消|除外|中止|競走中止|失格)\s+(\d{2})\.(\d{2})\.(\d{2})\s+(良|稍重|重|不良)\s+(\d{1,2})頭/;
const COURSE_RE = /^([ＪJ])?\s*(\S+?)\s+(芝)?(?:左|右|直)?\s*(\d{3,4})(?:\s+(\d{1,2})番)?/;

function readBlock(block: string[]): Omit<Horse, "number" | "frame" | "name"> {
  // 近走: 2行ずつ (新しい順)
  const runs: { finish?: number; skip: boolean; date: string; fieldSize: number; venue?: string; jra: boolean; surface: "芝" | "ダ"; distance?: number }[] = [];
  let sexAt = -1;
  block.forEach((l, i) => {
    const t = l.trim();
    if (sexAt < 0 && /^(牡|牝|セ|騸)\d{1,2}\t/.test(t)) sexAt = i;
    const m = RUN_RE.exec(t);
    if (!m || sexAt >= 0) return;
    const c = COURSE_RE.exec((block[i + 1] ?? "").trim());
    runs.push({
      ...(/^\d+$/.test(m[1]) ? { finish: Number(m[1]) } : {}),
      skip: /取消|除外/.test(m[1]), // 走っていない
      date: `20${m[2]}-${m[3]}-${m[4]}`,
      fieldSize: Number(m[6]),
      ...(c ? { venue: c[2] } : {}),
      jra: !!c?.[1],
      surface: c?.[3] ? "芝" : "ダ",
      ...(c ? { distance: Number(c[4]) } : {}),
    });
  });
  if (sexAt < 0) return { pastRaces: runs.filter((r) => !r.skip).map((r) => toPast(r)) };

  // 性齢の行: 性齢・毛色・生年月日・今回の斤量・レース名… (入りきらないレース名は次の行から)
  const sexCells = block[sexAt].split("\t").map((c) => c.trim());
  const carried = /(\d{2}\.\d)/.exec(sexCells[3] ?? "")?.[1];
  const names = sexCells.slice(4).filter(Boolean);
  let i = sexAt + 1;
  while (i < block.length && !block[i].includes("\t")) {
    if (block[i].trim()) names.push(block[i].trim());
    i++;
  }
  const sireLine = (block[i] ?? "").split("\t").map((c) => c.trim());
  const cols = (line: string | undefined, skip: number) => (line ?? "").split("\t").slice(skip).map((c) => c.trim());
  const riders = cols(block[i + 1], 1); // 人気 体重 騎手 斤量
  const damLine = (block[i + 2] ?? "").split("\t").map((c) => c.trim());
  const times = damLine.slice(2); // タイム 通過順 上がり
  const damsireLine = (block[i + 3] ?? "").split("\t").map((c) => c.trim());
  const margins = damsireLine.slice(3); // 着差 勝ち馬

  const pastRaces = runs
    .map((r, k) => {
      if (r.skip) return undefined;
      const rider = /(\d+)人\s+\d+\s+(\S+)\s+(\d{2}\.\d)/.exec(riders[k] ?? "");
      const time = /\d:\d{2}\.\d\s+([\d-]+)\s+(\d{2}\.\d)/.exec(times[k] ?? "");
      const margin = /^(\d{1,2}\.\d)\s/.exec(margins[k] ?? "");
      const cls = names[k] ? classOf(r.jra ? `${r.venue}${names[k]}` : names[k]) : undefined;
      return toPast(r, {
        ...(time ? { passing: time[1].split("-").map(Number).filter((n) => n > 0), last3f: Number(time[2]) } : {}),
        ...(rider ? { jockey: rider[2].replace(MARK_RE, ""), carried: Number(rider[3]) } : {}),
        // 勝ったレースは2着馬との差が書かれているので、勝ち馬との差は 0
        ...(r.finish === 1 ? { margin: 0 } : margin ? { margin: Number(margin[1]) } : {}),
        ...(names[k] ? { className: cls?.name ?? names[k] } : {}),
        ...(cls ? { classLevel: cls.level } : {}),
      });
    })
    .filter((r): r is PastRace => !!r);

  const strip = (s: string | undefined) => s?.replace(/^[（(]|[）)]$/g, "").trim() || undefined;
  const sire = sireLine[0] && !/\d/.test(sireLine[0]) ? sireLine[0] : undefined;
  const dam = damLine[0] && !/\d/.test(damLine[0]) ? damLine[0] : undefined;
  const damsire = strip(damsireLine[0]);
  return {
    pastRaces,
    ...(carried ? { carried: Number(carried) } : {}),
    ...(sire ? { sire } : {}),
    ...(dam ? { dam } : {}),
    ...(damsire ? { damsire } : {}),
  };
}

function toPast(
  r: { finish?: number; date: string; fieldSize: number; venue?: string; surface: "芝" | "ダ"; distance?: number },
  more: Partial<PastRace> = {},
): PastRace {
  return {
    date: r.date,
    passing: [],
    fieldSize: r.fieldSize,
    surface: r.surface,
    ...(r.venue ? { venue: r.venue } : {}),
    ...(r.distance ? { distance: r.distance } : {}),
    ...(r.finish !== undefined ? { finish: r.finish } : {}),
    ...more,
  };
}
