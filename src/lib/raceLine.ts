import { VENUES } from "./courses";
import type { Going, Race } from "./types";

export type RaceLine = Partial<Pick<Race, "venue" | "name" | "surface" | "distance" | "raceClass" | "going">> & { raceNo?: number };

const CLASS_RE =
  /(?<![A-Za-z0-9])([ABC][1-3][一二三四五六七八九十]*(?:組)?|[ABC][1-3]?(?=\s|$)|\d歳[^\s]*|新馬|未勝利|未受賞|[1-3]勝(?:クラス)?|オープン|OP|重賞|G[1-3Ⅰ-Ⅲ]|Jpn[1-3Ⅰ-Ⅲ]|S[1-3Ⅰ-Ⅲ](?![\d.]))/;

/**
 * 「川崎 5R ダ1400 C2三 良」のような1行からレース情報を読む。順番は自由で、入っているものだけ返す。
 * 出馬表のレース名の行 (例: "川崎 第5競走 ダート1400m 2歳") にも使える。
 */
export function parseRaceLine(text: string): RaceLine {
  const s = text
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/Ｒ/g, "R")
    .replace(/　/g, " ");
  const out: RaceLine = {};

  const venue = [...VENUES].sort((a, b) => b.length - a.length).find((v) => s.includes(v));
  if (venue) out.venue = venue;

  const no = /(?:^|[^\d])(\d{1,2})\s*R(?![a-z])|第\s*(\d{1,2})\s*(?:競走|レース|R)/.exec(s);
  if (no) out.raceNo = Number(no[1] ?? no[2]);

  const course = /(芝|ダート|ダ|障害|障)\s*(?:右|左|外|内|直線)?\s*(\d{3,4})\s*m?/.exec(s);
  if (course) {
    out.surface = course[1].startsWith("芝") ? "芝" : course[1].startsWith("障") ? "障" : "ダ";
    out.distance = Number(course[2]);
  } else {
    // 「1500」「1500m」だけでも距離とみなす (800〜3600m)
    const d = /(?:^|\s)(\d{3,4})\s*m?(?=\s|$)/.exec(s);
    if (d && Number(d[1]) >= 800 && Number(d[1]) <= 3600) out.distance = Number(d[1]);
  }

  const cls = CLASS_RE.exec(s.replace(course?.[0] ?? "\u0000", " "));
  if (cls) out.raceClass = cls[1];

  const going = /(?:^|[\s(（])(良|稍重|稍|重|不良)(?=$|[\s)）])/.exec(s);
  if (going) out.going = (going[1] === "稍" ? "稍重" : going[1]) as Going;

  if (out.raceNo) out.name = `${out.venue ?? ""}${out.raceNo}R`;
  return out;
}

/** 読み取った分だけ、レースに重ねる (onlyEmpty なら空の項目だけ埋める) */
export function applyRaceLine(race: Race, line: RaceLine, onlyEmpty = false): Race {
  const next = { ...race };
  const set = <K extends keyof RaceLine & keyof Race>(k: K, empty: boolean) => {
    if (line[k] === undefined) return;
    if (onlyEmpty && !empty) return;
    (next as Record<string, unknown>)[k] = line[k];
  };
  set("venue", !race.venue);
  set("surface", !race.distance); // 馬場の種類は距離が空のときだけ (初期値の「ダ」と区別がつかないため)
  set("distance", !race.distance);
  set("raceClass", !race.raceClass);
  set("going", !race.going);
  set("name", !race.name);
  return next;
}

/** 次のレース用に、同じ日・同じ競馬場の情報を引き継いだ空のレースを作る */
export function nextRace(prev: Race | undefined, today: string): Race {
  const no = prev ? parseRaceLine(prev.name).raceNo : undefined;
  const sameDay = prev?.date === today;
  return {
    name: sameDay && no ? `${prev!.venue}${no + 1}R` : "",
    venue: sameDay ? prev!.venue : "",
    surface: sameDay ? prev!.surface : "ダ",
    distance: 0,
    ...(sameDay && prev!.going ? { going: prev!.going } : {}),
    horses: [],
    date: today,
  };
}

/**
 * 貼り付けた出馬表などの先頭のほうから、今回のレース名の行 (競馬場・R・距離がそろった行) を探す。
 * 過去走の行 (Rが付かない) と取り違えないよう、3つともそろった行だけを使う。
 */
export function raceLineInPaste(text: string): RaceLine | undefined {
  for (const l of text.split("\n").slice(0, 15)) {
    const r = parseRaceLine(l);
    if (r.venue && r.raceNo && r.distance) return r;
  }
  return undefined;
}
