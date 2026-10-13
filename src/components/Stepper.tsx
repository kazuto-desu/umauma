export interface Step {
  key: string;
  label: string; // ステップ表示用の短い名前
  title: string; // 画面の見出し
  done: boolean;
}

interface Props {
  steps: Step[];
  current: number;
  onSelect: (index: number) => void;
}

/** 上部のフローチャート。丸をタップするとそのステップへ移動する */
export function Stepper({ steps, current, onSelect }: Props) {
  return (
    <nav className="stepper" aria-label="手順">
      <ol>
        {steps.map((s, i) => (
          <li key={s.key} className={[i === current ? "current" : "", s.done ? "done" : ""].join(" ")}>
            <button className="step-dot" onClick={() => onSelect(i)} aria-current={i === current ? "step" : undefined}>
              {s.done && i !== current ? "✓" : i + 1}
            </button>
            <span className="step-label">{s.label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
