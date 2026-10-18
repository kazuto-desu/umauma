import { parseComments } from "./comment";
import { frameOf } from "./frame";
import { parseNarCard } from "./narCard";
import { parseOdds } from "./odds";
import { parsePaddock } from "./paddock";
import { mergeCard, parsePastedCard, splitByEntries, splitByHorseNames } from "./paste";
import { parseFiveRunCard } from "./fiveRunCard";
import { parseBookJraCard } from "./bookJraCard";
import { extractCorners, parseResultTable, resultFromTable } from "./result";
import { parseWorkouts, trainingCommentOf } from "./training";
import type { Horse, Race, Workout } from "./types";

export type ImportKind = "card" | "training" | "comments" | "paddock" | "odds" | "result";

export const KIND_LABEL: Record<ImportKind, string> = {
  card: "馬柱",
  training: "調教",
  comments: "厩舎コメント",
  paddock: "パドック",
  odds: "オッズ",
  result: "結果",
};

export interface ImportOutcome {
  kind: ImportKind;
  race: Race; // 読み込んだあとのレース
  message: string;
  workouts?: { name: string; workouts?: Workout[] }[]; // 調教コースの時計として貯める分
}

type TrainingParsed = Pick<Horse, "workouts" | "trainingComment" | "trainingTrend">;

export function parseTrainingSegment(segment: string, name: string): TrainingParsed {
  const { comment, trend } = trainingCommentOf(segment, name);
  return { workouts: parseWorkouts(segment), trainingComment: comment, trainingTrend: trend };
}

/** 時計か短評 (矢印) のどれかが読めたか */
export const hasTraining = (p: TrainingParsed) => p.workouts!.length > 0 || !!p.trainingComment || !!p.trainingTrend;

/** 読めた分だけを馬に重ねる (時計がなく短評だけのときは、前に読んだ時計を消さない) */
export const mergeTraining = (h: Horse, p: TrainingParsed): Horse => ({
  ...h,
  ...(p.workouts!.length > 0 ? { workouts: p.workouts } : {}),
  ...(p.trainingComment ? { trainingComment: p.trainingComment } : {}),
  ...(p.trainingTrend ? { trainingTrend: p.trainingTrend } : {}),
});

const withHorses = (race: Race, horses: Horse[]): Race => ({ ...race, horses });

/**
 * 何を貼ったかを中身から見分けて読み込む。見分ける順番:
 *   地方の馬柱 → 厩舎コメント → パドック評価 → 結果 → ほかの形式の馬柱 → 調教 → オッズ
 * どれにも当てはまらなければ undefined。
 */
export function importAny(text: string, race: Race): ImportOutcome | { error: string } {
  const horses = race.horses;
  const named = horses.filter((h) => h.name);

  // 近5走が2行ずつ並ぶ形式の馬柱 (着順 日付 馬場 頭数 / 競馬場 コース距離 馬番)
  const five = parseFiveRunCard(text);
  if (five.length >= 2) {
    const r = mergeCard(five, horses);
    return {
      kind: "card",
      race: withHorses(race, r.horses),
      message: `馬柱を読み込みました (${r.horses.length}頭・過去走${five.reduce((s, h) => s + h.pastRaces.length, 0)}走)。`,
    };
  }

  // 競馬ブックの中央の馬柱 (1項目1行・通過順なし・脚質の印あり)
  const jra = parseBookJraCard(text);
  if (jra.length >= 2) {
    const r = mergeCard(jra, horses);
    return {
      kind: "card",
      race: withHorses(race, r.horses.map((h) => ({ ...h, ...(jra.find((x) => x.name === h.name)?.styleHint ? { styleHint: jra.find((x) => x.name === h.name)!.styleHint } : {}) }))),
      message: `馬柱を読み込みました (${r.horses.length}頭・過去走${jra.reduce((s, h) => s + h.pastRaces.length, 0)}走。通過順がないので脚質の印から位置取りを見積もります)。`,
    };
  }

  // 地方の馬柱 (1項目1行・3走前→前走)
  if (parseNarCard(text).length >= 2) {
    const r = parsePastedCard(text, horses)!;
    return {
      kind: "card",
      race: withHorses(race, r.horses),
      message: `馬柱を読み込みました (${r.horses.length}頭・通過順${r.withPassing}頭・騎手${r.withJockey}頭)。`,
    };
  }

  // 厩舎コメント (「○馬名【○○師】」「○馬名(見出し) 話者――」)
  const comments = parseComments(text);
  if (comments.length >= 2) {
    if (horses.length === 0) {
      const entries = comments.filter((c) => c.number);
      return {
        kind: "comments",
        race: withHorses(
          race,
          entries.map((c) => ({
            number: c.number!,
            frame: c.frame ?? frameOf(c.number!, entries.length),
            name: c.name,
            pastRaces: [],
            stableComment: c.comment,
          })),
        ),
        message: `${entries.length}頭を出走馬として登録し、厩舎コメントを読み込みました。`,
      };
    }
    const matched = comments.filter((c) => horses.some((h) => h.name === c.name));
    if (matched.length === 0) return { error: "厩舎コメントの馬名が、このレースの出走馬と一致しませんでした。" };
    return {
      kind: "comments",
      race: withHorses(
        race,
        horses.map((h) => {
          const c = matched.find((x) => x.name === h.name);
          return c ? { ...h, stableComment: c.comment } : h;
        }),
      ),
      message: `${matched.length}頭の厩舎コメントを読み込みました。`,
    };
  }

  // パドック評価 (「⑤馬名 494(-5) 3.3」と評価・短評)
  const paddock = parsePaddock(text).filter((p) => p.grade || p.weight);
  if (paddock.length >= 1 && horses.length > 0) {
    const matched = paddock.filter((p) => horses.some((h) => h.number === p.number && (!h.name || h.name === p.name)));
    if (matched.length > 0)
      return {
        kind: "paddock",
        race: withHorses(
          race,
          horses.map((h) => {
            const p = matched.find((x) => x.number === h.number);
            if (!p) return h;
            const { number: _n, name: _m, odds, ...rest } = p;
            return { ...h, paddock: rest, ...(odds ? { odds } : {}) };
          }),
        ),
        message: `${matched.length}頭のパドック評価を読み込みました (載っていない馬は評価C扱い)。`,
      };
  }

  // 結果 (コーナー通過順位・結果表)
  if (horses.length > 0) {
    const corners = extractCorners(text);
    if (corners.firstCorner) {
      const r = race.result ?? { firstCorner: "", finalCorner: "" };
      return {
        kind: "result",
        race: { ...race, result: { ...r, firstCorner: corners.firstCorner, finalCorner: corners.finalCorner ?? corners.firstCorner } },
        message: "コーナー通過順位を読み込みました。",
      };
    }
    const rows = parseResultTable(text);
    const table = resultFromTable(rows);
    const matched = rows.filter((row) => horses.some((h) => h.number === row.number && (!h.name || h.name === row.name)));
    if (table && rows.some((r) => r.finish) && matched.length >= rows.length / 2) {
      const stopped = rows.filter((r) => r.stopped).map((r) => r.number);
      return {
        kind: "result",
        race: { ...race, result: table },
        message: `結果を読み込みました (${rows.length}頭)。` + (stopped.length ? ` 競走中止の${stopped.join("・")}番は最終コーナーと着順から外しています。` : ""),
      };
    }
  }

  // ほかの形式の馬柱 (通過順 "3-3-2" が取れるもの)
  const card = parsePastedCard(text, horses);
  if (card && card.withPassing >= Math.max(2, card.horses.length / 2))
    return {
      kind: "card",
      race: withHorses(race, card.horses),
      message:
        card.mode === "new"
          ? `${card.horses.length}頭を読み込み、うち${card.withPassing}頭の通過順を取得しました。`
          : `${card.withPassing}頭の通過順を更新しました。`,
    };

  // 調教 (表の馬名で分ける → 「馬番 馬名」で分ける)
  const byName = splitByHorseNames(text, named)
    .map((s) => ({ horse: s.horse, parsed: parseTrainingSegment(s.segment, s.horse.name) }))
    .filter((p) => hasTraining(p.parsed) && (p.parsed.workouts!.length > 0 || parseWorkouts(text).length > 0));
  if (byName.length > 0) {
    const commentOnly = byName.filter((p) => p.parsed.workouts!.length === 0).length;
    return {
      kind: "training",
      race: withHorses(
        race,
        horses.map((h) => {
          const p = byName.find((x) => x.horse === h);
          return p ? mergeTraining(h, p.parsed) : h;
        }),
      ),
      message: `${byName.length}頭の調教を読み込みました。` + (commentOnly ? ` うち${commentOnly}頭は短評だけです。` : ""),
      workouts: byName.map((p) => ({ name: p.horse.name, workouts: p.parsed.workouts })),
    };
  }
  if (parseWorkouts(text).length > 0) {
    const entries = splitByEntries(text).map((e) => ({ ...e, parsed: parseTrainingSegment(e.segment, e.name) }));
    if (entries.length > 0 && horses.length === 0)
      return {
        kind: "training",
        race: withHorses(
          race,
          entries.map((e) =>
            mergeTraining({ number: e.number, frame: frameOf(e.number, entries.length), name: e.name, pastRaces: [] }, e.parsed),
          ),
        ),
        message: `${entries.length}頭を出走馬として登録し、調教を読み込みました。`,
        workouts: entries.map((e) => ({ name: e.name, workouts: e.parsed.workouts })),
      };
  }

  // オッズ
  if (horses.length > 0) {
    const odds = parseOdds(text, horses);
    if (odds.size >= Math.max(2, horses.length / 2))
      return {
        kind: "odds",
        race: withHorses(
          race,
          horses.map((h) => (odds.has(h.number) ? { ...h, odds: odds.get(h.number) } : h)),
        ),
        message: `${odds.size}頭の単勝オッズを読み込みました (人気は「人気を見る」を押すまで出ません)。`,
      };
  }

  // 種類は分かったが、このレースの馬と合わなかったとき
  if (horses.length > 0) {
    if (parseResultTable(text).filter((r) => r.finish).length >= 2)
      return { error: "結果のようですが、馬番・馬名がこのレースの出走馬と一致しません。別のレースの結果ではないか確認してください。" };
    if (parsePaddock(text).some((p) => p.grade || p.weight))
      return { error: "パドック評価のようですが、馬番・馬名がこのレースの出走馬と一致しません。" };
    if (parseWorkouts(text).length > 0)
      return { error: "調教のようですが、馬名がこのレースの出走馬と一致しません。別のレースの調教ではないか確認してください。" };
  }

  return {
    error:
      horses.length === 0
        ? "読み取れませんでした。まず馬柱・調教・厩舎コメントのどれかを貼ると、出走馬が登録されます。"
        : "読み取れませんでした。うまくいかないときは、下の「種類を選んで貼る」から試してください。",
  };
}

/** そのレースにどの材料が入っているか */
export function filledKinds(race: Race): Record<ImportKind, boolean> {
  const hs = race.horses.filter((h) => !h.scratched);
  return {
    card: hs.some((h) => h.pastRaces.length > 0),
    training: hs.some((h) => h.workouts?.length || h.trainingComment || h.trainingTrend),
    comments: hs.some((h) => h.stableComment),
    paddock: hs.some((h) => h.paddock),
    odds: hs.some((h) => h.odds),
    result: !!(race.result?.firstCorner || race.result?.finish),
  };
}
