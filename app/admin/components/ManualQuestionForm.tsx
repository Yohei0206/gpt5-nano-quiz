import Select from "@/components/Select";
import type { Difficulty, Question } from "@/lib/types";
import type { FC } from "react";

export type Option = {
  value: string;
  label: string;
};

type ManualQuestionFormProps = {
  category: string;
  onChangeCategory: (value: string) => void;
  subgenre: string;
  onChangeSubgenre: (value: string) => void;
  difficulty: Difficulty;
  onChangeDifficulty: (value: Difficulty) => void;
  prompt: string;
  onChangePrompt: (value: string) => void;
  choices: string[];
  onChangeChoice: (index: number, value: string) => void;
  answerIndex: number;
  onChangeAnswerIndex: (index: number) => void;
  explanation: string;
  onChangeExplanation: (value: string) => void;
  onAdd: () => void;
  onReset: () => void;
  onCopyJSON: () => void;
  onSaveAll: () => void;
  items: Question[];
  onRemove: (id: string) => void;
  categories: Option[];
  subgenreOptions: Option[];
  saving: boolean;
};

const ManualQuestionForm: FC<ManualQuestionFormProps> = ({
  category,
  onChangeCategory,
  subgenre,
  onChangeSubgenre,
  difficulty,
  onChangeDifficulty,
  prompt,
  onChangePrompt,
  choices,
  onChangeChoice,
  answerIndex,
  onChangeAnswerIndex,
  explanation,
  onChangeExplanation,
  onAdd,
  onReset,
  onCopyJSON,
  onSaveAll,
  items,
  onRemove,
  categories,
  subgenreOptions,
  saving,
}) => {
  return (
    <div className="card p-5 grid gap-4">
      <div className="font-semibold">手動で問題を追加</div>
      <div className="grid gap-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">カテゴリ</label>
            <Select value={category} onChange={onChangeCategory} options={categories} />
          </div>
          <div>
            <label className="block text-sm mb-1">サブジャンル（任意）</label>
            <Select value={subgenre} onChange={onChangeSubgenre} options={subgenreOptions} />
          </div>
          <div>
            <label className="block text-sm mb-1">難易度</label>
            <Select
              value={difficulty}
              onChange={(v) => onChangeDifficulty(v as Difficulty)}
              options={[
                { value: "easy", label: "easy" },
                { value: "normal", label: "normal" },
                { value: "hard", label: "hard" },
              ]}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">正解インデックス (0-3)</label>
            <input
              type="number"
              min={0}
              max={3}
              className="w-full bg-transparent border border-white/10 rounded-md p-2"
              value={answerIndex}
              onChange={(e) =>
                onChangeAnswerIndex(Math.max(0, Math.min(3, Number(e.target.value) || 0)))
              }
            />
          </div>
        </div>
        <div>
          <label className="block text-sm mb-1">問題文</label>
          <textarea
            className="w-full bg-transparent border border-white/10 rounded-md p-2 min-h-[120px]"
            value={prompt}
            onChange={(e) => onChangePrompt(e.target.value)}
            placeholder="問題文を入力してください"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {choices.map((choice, index) => (
            <div key={index}>
              <label className="block text-sm mb-1">選択肢 {index + 1}</label>
              <input
                className="w-full bg-transparent border border-white/10 rounded-md p-2"
                value={choice}
                onChange={(e) => onChangeChoice(index, e.target.value)}
                placeholder={`選択肢 ${index + 1} を入力`}
              />
            </div>
          ))}
        </div>
        <div>
          <label className="block text-sm mb-1">解説（任意）</label>
          <textarea
            className="w-full bg-transparent border border-white/10 rounded-md p-2 min-h-[80px]"
            value={explanation}
            onChange={(e) => onChangeExplanation(e.target.value)}
            placeholder="解説があれば入力してください"
          />
        </div>
        <div className="flex flex-wrap gap-3 justify-end">
          <button className="btn btn-ghost" onClick={onReset} type="button">
            フォームをリセット
          </button>
          <button className="btn btn-outline" onClick={onCopyJSON} type="button">
            JSONをコピー
          </button>
          <button className="btn btn-primary" onClick={onAdd} type="button">
            1件追加
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">追加予定の問題 ({items.length} 件)</div>
          <button
            className="btn btn-primary btn-sm"
            onClick={onSaveAll}
            disabled={saving || items.length === 0}
            type="button"
          >
            {saving ? "保存中..." : "全件保存"}
          </button>
        </div>
        {items.length === 0 ? (
          <div className="text-sm text-white/60">まだ追加予定の問題はありません。</div>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <div key={item.id} className="border border-white/10 rounded-lg p-4">
                <div className="text-sm text-white/80">{item.prompt}</div>
                <div className="mt-2 text-xs text-white/60">
                  <span>カテゴリ: {item.category}</span>
                  {item.subgenre && <span className="ml-3">サブジャンル: {item.subgenre}</span>}
                  <span className="ml-3">難易度: {item.difficulty}</span>
                </div>
                <div className="mt-2 grid gap-1 text-xs text-white/70">
                  {item.choices.map((choice, idx) => (
                    <div key={idx}>
                      {idx === item.answerIndex ? "★" : "・"} {choice}
                    </div>
                  ))}
                </div>
                {item.explanation && (
                  <div className="mt-2 text-xs text-white/60">解説: {item.explanation}</div>
                )}
                <div className="mt-3 flex justify-end">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => onRemove(item.id)}
                    type="button"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ManualQuestionForm;
