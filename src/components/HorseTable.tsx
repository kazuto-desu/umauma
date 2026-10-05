import { useState } from "react";
import { frameColor, frameOf } from "../lib/frame";
import { formatPassingText, parsePassingText } from "../lib/notation";
import type { Horse, HorseAnalysis, JockeyTendency } from "../lib/types";

interface Props {
  horses: Horse[];
  analyses: HorseAnalysis[];
  jockeyNotes: Record<string, JockeyTendency>;
  onJockeyNote: (name: string, t: JockeyTendency) => void;
  onChange: (horses: Horse[]) => void;
}

export function HorseTable({ horses, analyses, jockeyNotes, onJockeyNote, onChange }: Props) {
  const update = (idx: number, patch: Partial<Horse>) =>
    onChange(horses.map((h, i) => (i === idx ? { ...h, ...patch } : h)));

  const renumber = (list: Horse[]) =>
    list.map((h, i) => ({ ...h, number: i + 1, frame: frameOf(i + 1, list.length) }));

  return (
    <section className="card">
      <h2>出走馬</h2>
      <p className="hint">
        通過順は1走ずつ空白区切りで、新しい順に入力します。「/」の後ろは頭数 (省略可)。例: <code>3-3-2-1/16(34.5) 5-4/14</code> (「( )」は上がり3F)。サイトの成績をそのまま貼り付けても通過順だけを拾います。騎手の位置取りは騎手ごとに記憶され、次のレースでも使われます。
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>枠</th>
              <th>馬番</th>
              <th>馬名</th>
              <th>騎手 / 位置取り</th>
              <th>過去の通過順</th>
              <th>脚質</th>
              <th>展開</th>
              <th>末脚</th>
              <th>取消</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {horses.map((h, idx) => {
              const a = analyses.find((x) => x.number === h.number);
              const c = frameColor(h.frame);
              return (
                <tr key={idx} className={h.scratched ? "scratched" : undefined}>
                  <td>
                    <input
                      className="num frame"
                      style={{ background: c.bg, color: c.fg }}
                      type="number"
                      min={1}
                      max={8}
                      value={h.frame}
                      onChange={(e) => update(idx, { frame: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      className="num"
                      type="number"
                      min={1}
                      value={h.number}
                      onChange={(e) => update(idx, { number: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input className="name" value={h.name} onChange={(e) => update(idx, { name: e.target.value })} />
                  </td>
                  <td>
                    <input
                      className="jockey"
                      value={h.jockey ?? ""}
                      onChange={(e) => update(idx, { jockey: e.target.value || undefined })}
                    />
                    <select
                      className="tendency"
                      title="騎手の位置取りの傾向 (騎手ごとに記憶されます)"
                      disabled={!h.jockey}
                      value={(h.jockey && jockeyNotes[h.jockey]) || "普通"}
                      onChange={(e) => h.jockey && onJockeyNote(h.jockey, e.target.value as JockeyTendency)}
                    >
                      <option value="積極">積極</option>
                      <option value="普通">普通</option>
                      <option value="控える">控える</option>
                    </select>
                  </td>
                  <td>
                    <PassingInput horse={h} onChange={(pastRaces) => update(idx, { pastRaces })} />
                  </td>
                  <td className={`style style-${a?.style}`}>{h.scratched ? "" : a?.style}</td>
                  <td className={`adv adv-${a?.advantage}`}>{h.scratched ? "" : a?.advantage}</td>
                  <td className={`closing-${a?.closing}`}>{h.scratched ? "" : (a?.closing ?? "")}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!h.scratched}
                      onChange={(e) => update(idx, { scratched: e.target.checked })}
                    />
                  </td>
                  <td>
                    <button
                      className="ghost"
                      title="削除"
                      onClick={() => onChange(renumber(horses.filter((_, i) => i !== idx)))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        onClick={() => onChange(renumber([...horses, { number: 0, frame: 0, name: "", pastRaces: [] }]))}
      >
        ＋ 馬を追加
      </button>
    </section>
  );
}

/** 入力途中の文字列を壊さないよう、テキストはローカルに持ってフォーカスが外れたら確定する */
function PassingInput({ horse, onChange }: { horse: Horse; onChange: (r: Horse["pastRaces"]) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="passing"
      value={text ?? formatPassingText(horse.pastRaces)}
      placeholder="未入力 (例: 3-3-2-1/16)"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== null) onChange(mergePassing(horse.pastRaces, parsePassingText(text)));
        setText(null);
      }}
    />
  );
}

/** 手入力で書き換えた通過順に、画像から取れていた日付などの付加情報をなるべく残す */
function mergePassing(prev: Horse["pastRaces"], next: Horse["pastRaces"]) {
  const withPassing = prev.filter((r) => r.passing.length > 0);
  return next.map((r, i) => ({ ...withPassing[i], ...r, fieldSize: r.fieldSize ?? withPassing[i]?.fieldSize }));
}
