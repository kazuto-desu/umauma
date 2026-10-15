import type { Horse } from "./types";

export interface CommentReading {
  tactic?: "前" | "控え"; // 作戦: 前に行く / 控える
  startRisk: boolean; // スタート・ゲートに不安がある
  mood: number; // 状態の評価 (プラスほど良い。-2〜+2)
  tags: string[]; // 画面に出す読み取り結果
}

// 作戦
const FRONT_RE = /ハナ|逃げ|先手|思い切って行|行くのみ|行き切|前に行|前にも行|前々|前付け|積極的|押して/;
const BACK_RE = /控え|溜め|差す|後方から|後ろから|追い込み|脚を溜|折り合い重視|じっくり/;
// スタート・ゲートの不安 (「スタート勘が良い」などは除く)
const START_RE = /(スタート|発馬|ゲート|出)[^。、]{0,8}(躓|つまず|ゴソゴソ|課題|悪|遅れ|負け|五分なら|タイミング|難し)|出遅れ|出負け|置かれ/;
const START_OK_RE = /(スタート|発馬|ゲート)[^。、]{0,4}(勘)?[^。、]{0,4}(良|いい|上手|安定)/;
// 状態が良い
const GOOD: [RegExp, string][] = [
  [/(デキ|出来|状態|調子)[^。、]{0,6}?(良(?!くな)|いい|上々|絶好|上向|悪くない)/, "状態良好"],
  [/(攻め気配|動き|気配)(は|も)?(悪くない|良|いい|上々|目立)/, "攻め気配良"],
  [/仕上が(り|って)[^。、]{0,4}(上々|良|いい|万全)|好調|絶好調/, "仕上がり良"],
  [/順調/, "順調"],
  [/(?<!時計)勝負(?!所|どころ)|メイチ|チャンス|前進|反撃|巻き返し/, "前向きな談話"],
  [/回復|復調|(夏負け|疲れ)[^。、]{0,8}(解消|取れ|抜け)/, "復調気配"],
  [/相手関係(は|に|が|も)?[^。、]{0,4}(楽|恵まれ|手頃)|相手(が|も)?楽|メンバー的にも/, "相手に恵まれた"],
];
// 割り引き材料 (「悪くない」の「悪」は拾わない)
const BAD: [RegExp, string][] = [
  [/叩き台|使いつつ|使って良く|一度使って/, "叩き台"],
  [/太め|重め|絞れて(い)?ない/, "太め残り"],
  [/鼻出血|骨折|骨瘤|ソエ|跛行|捻挫|熱発|体質|(夏負け|疲れ)(?![^。、]{0,8}(解消|取れ|抜け))/, "体調面の不安"],
  [/調整ができ(な|ず)|乗り込めてい?ない|思うように(調整|乗れ)|調整不足/, "調整不足"],
  [/休み明け|久々|再検明け|放牧明け/, "休み明け"],
  [/様子見|一息|本調子(では|に|じゃ)(な|無)|今ひとつ|今一つ|物足りな/, "状態一息"],
  [/気難し|気性|行きたがる|掛か/, "気性面の課題"],
  [/どうか|厳しい|苦しい|楽ではない|相手(が|も)強|分が悪|格上|入着まで|どこまで(やれ|通用)|不安(は|が)?ある|不安残/, "弱気な談話"],
];

/** 厩舎コメント1頭分を読む */
export function readComment(text: string): CommentReading {
  const t = text.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const tags: string[] = [];
  const front = FRONT_RE.test(t);
  const back = BACK_RE.test(t);
  const tactic = front && !back ? "前" : back && !front ? "控え" : undefined;
  if (tactic === "前") tags.push("前に行く意向");
  if (tactic === "控え") tags.push("控える意向");
  const startRisk = START_RE.test(t) && !START_OK_RE.test(t);
  if (startRisk) tags.push("スタートに不安");

  let mood = 0;
  for (const [re, tag] of GOOD)
    if (re.test(t)) {
      mood += 0.5;
      tags.push(tag);
    }
  // 割り引き材料はコメントでは控えめに書かれがちなので、良い言葉より重く見る
  for (const [re, tag] of BAD)
    if (re.test(t)) {
      mood -= 0.8;
      tags.push(tag);
    }
  return { tactic, startRisk, mood: Math.max(-2, Math.min(2, mood)), tags };
}

/**
 * 競馬ブックの厩舎コメントを貼り付けたテキストを馬ごとに分ける。
 *   1            ← 枠
 *   1 ニシノミニョンヌ   ← 馬番 馬名
 *   ○ニシノミニョンヌ【山口浩師】攻め気配は悪くないのだが…
 */
export function parseComments(text: string): { number?: number; frame?: number; name: string; speaker: string; comment: string }[] {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const out: { number?: number; frame?: number; name: string; speaker: string; comment: string }[] = [];
  lines.forEach((l, i) => {
    const c = parseCommentLine(l);
    if (!c) return;
    const entry = /^(\d{1,2})\s+(.+)$/.exec(lines[i - 1] ?? "");
    const number = entry && entry[2] === c.name ? Number(entry[1]) : undefined;
    const frame = number !== undefined && /^\d$/.test(lines[i - 2] ?? "") ? Number(lines[i - 2]) : undefined;
    out.push({ ...c, ...(number ? { number } : {}), ...(frame ? { frame } : {}) });
  });
  return out;
}

/**
 * コメント1行を読む。次の2つの書き方に対応する。
 *   ○馬名【山口浩師】コメント
 *   ○馬名(見出し) 　担当厩務員――コメント   (見出しはコメントの頭に残す)
 */
function parseCommentLine(l: string): { name: string; speaker: string; comment: string } | undefined {
  const bracket = /^[○◎●◯△▲☆×]?\s*([ァ-ヴー・]{2,12})\s*【([^】]+)】\s*(.+)$/.exec(l);
  if (bracket) return { name: bracket[1], speaker: bracket[2], comment: bracket[3] };
  const dash = /^[○◎●◯△▲☆×]?\s*([ァ-ヴー・]{2,12})\s*(?:[（(]([^）)]*)[）)])?[\s　]*([^\s　―]{1,12}?)\s*[―—─-]{2}\s*(.+)$/.exec(l);
  if (dash) return { name: dash[1], speaker: dash[3], comment: dash[2] ? `（${dash[2]}）${dash[4]}` : dash[4] };
  return undefined;
}

/** 読み取った作戦・スタートの不安を、1コーナーの位置のずれ (0〜1 の物差し) にする */
export function commentShift(h: Horse): number {
  if (!h.stableComment) return 0;
  const r = readComment(h.stableComment);
  return (r.tactic === "前" ? -0.06 : r.tactic === "控え" ? 0.06 : 0) + (r.startRisk ? 0.03 : 0);
}
