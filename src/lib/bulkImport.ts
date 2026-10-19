import { frameOf } from "./frame";
import { importAny } from "./importer";
import { parseResultTable, resultFromTable } from "./result";
import { applyRaceLine, parseRaceLine, raceLineInPaste } from "./raceLine";
import type { Race } from "./types";

/** 貼り付けの先頭のほうから、レースの日付 (2025年10月1日・2025/10/01 など年付き) を探す */
export function dateInPaste(text: string): string | undefined {
  for (const l of text.split("\n").slice(0, 20)) {
    const s = l.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    const m = /(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})/.exec(s);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return undefined;
}

export interface PastImportInput {
  card: string; // 馬柱
  result?: string; // 結果 (あれば)
  date?: string; // 入力した日付 (貼り付けに年付きの日付があればそちらを使う)
  line?: string; // 入力したレース情報 (例: 川崎 5R ダ1400)
}

export type PastImportOutcome = { race: Race; notes: string[] } | { error: string };

/**
 * 過去のレースの馬柱 (と結果) を、予想ページを通さずに1つのレースとして作る。
 * 日付は過去走の年を決める手がかりなので必須 (貼り付けに年付きの日付があればそれを使う)。
 */
export function importPastRace(input: PastImportInput): PastImportOutcome {
  if (!input.card.trim()) return { error: "馬柱を貼ってください。" };
  const date = dateInPaste(input.card) ?? input.date;
  if (!date) return { error: "日付を入れてください (過去走の年を決めるのに使います)。" };

  let race: Race = { name: "", venue: "", surface: "ダ", distance: 0, horses: [], date };
  const fromPaste = raceLineInPaste(input.card);
  if (fromPaste) race = applyRaceLine(race, fromPaste, true);
  if (input.line?.trim()) race = applyRaceLine(race, parseRaceLine(input.line), true);

  const card = importAny(input.card, race);
  if ("error" in card || card.kind !== "card") return { error: "馬柱として読めませんでした。出走馬と過去走が入った部分を貼ってください。" };
  race = card.race;
  const notes = [card.message];

  if (input.result?.trim()) {
    const res = importAny(input.result, race);
    if ("error" in res || res.kind !== "result") notes.push("結果は読めなかったので、馬柱だけ保存しました。");
    else {
      race = res.race;
      notes.push(res.message);
    }
  }
  if (!race.name) race = { ...race, name: race.venue ? `${race.venue}の過去レース` : "過去レース" };
  return { race, notes };
}

/** 同じ日・同じ名前で、出走馬もほとんど同じレースがもう保存されているか */
export function isDuplicate(race: Race, saved: Race[]): boolean {
  const names = new Set(race.horses.map((h) => h.name));
  return saved.some(
    (r) =>
      r.date === race.date &&
      r.name === race.name &&
      r.horses.filter((h) => names.has(h.name)).length >= Math.max(2, Math.ceil(race.horses.length * 0.7)),
  );
}

/**
 * 結果だけを1つのレースとして作る (傾向を見るため。馬柱がなくても、結果の表から出走馬を起こす)。
 */
export function importResultOnly(input: { text: string; date?: string; venue?: string; line?: string; surface?: Race["surface"]; distance?: number }): PastImportOutcome {
  if (!input.text.trim()) return { error: "結果を貼ってください。" };
  const date = dateInPaste(input.text) ?? input.date;
  if (!date) return { error: "日付を入れてください。" };
  const rows = parseResultTable(input.text);
  const table = resultFromTable(rows);
  if (!table || !rows.some((r) => r.finish)) return { error: "結果として読めませんでした。着順・馬番・通過順が入った結果の表を貼ってください。" };
  let race: Race = {
    name: "",
    venue: input.venue ?? "",
    surface: input.surface ?? "ダ",
    distance: input.distance ?? 0,
    horses: rows.map((r) => ({ number: r.number, frame: frameOf(r.number, rows.length), name: r.name, pastRaces: [] })),
    result: table,
    date,
  };
  const fromPaste = raceLineInPaste(input.text);
  if (fromPaste) race = applyRaceLine(race, fromPaste, false);
  if (input.line?.trim()) race = applyRaceLine(race, parseRaceLine(input.line), false);
  if (!race.name) race = { ...race, name: `${race.venue}の結果` };
  else if (race.venue && !race.name.startsWith(race.venue)) race = { ...race, name: `${race.venue}${race.name}` };
  return { race, notes: [`結果を読み込みました (${rows.length}頭)。`] };
}
