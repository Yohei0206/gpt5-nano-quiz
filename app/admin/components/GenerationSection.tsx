import Select from "@/components/Select";
import type { FC } from "react";

export type Option = {
  value: string;
  label: string;
};

type GenerationSectionProps = {
  categories: Option[];
  genGenre: string;
  onChangeGenre: (value: string) => void;
  genTitleSlug: string;
  onChangeTitleSlug: (value: string) => void;
  topicOptions: Option[];
  genCount: number;
  onChangeCount: (value: number) => void;
  genDifficulty: "easy" | "normal" | "hard" | "mixed";
  onChangeDifficulty: (value: "easy" | "normal" | "hard" | "mixed") => void;
  parallelCount: number;
  onChangeParallelCount: (value: number) => void;
  onGenerate: () => void;
  onPreview: () => void;
  onGenerateParallel: () => void;
  onRebalance: () => void;
  generating: boolean;
  previewing: boolean;
  parallelRunning: boolean;
  rebalancing: boolean;
  catLoading: boolean;
  catError: string | null;
  topicsLoading: boolean;
  topicsError: string | null;
  rebalanceLimit: number;
  onChangeRebalanceLimit: (value: number) => void;
};

const GenerationSection: FC<GenerationSectionProps> = ({
  categories,
  genGenre,
  onChangeGenre,
  genTitleSlug,
  onChangeTitleSlug,
  topicOptions,
  genCount,
  onChangeCount,
  genDifficulty,
  onChangeDifficulty,
  parallelCount,
  onChangeParallelCount,
  onGenerate,
  onPreview,
  onGenerateParallel,
  onRebalance,
  generating,
  previewing,
  parallelRunning,
  rebalancing,
  catLoading,
  catError,
  topicsLoading,
  topicsError,
  rebalanceLimit,
  onChangeRebalanceLimit,
}) => {
  return (
    <>
      <div className="card p-5 grid gap-4">
        <div className="font-semibold">
          ジャンル指定でGPT生成（直接Supabaseへ保存）
        </div>
        <div className="grid sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm mb-1">ジャンル</label>
            <Select value={genGenre} onChange={onChangeGenre} options={categories} />
            {catLoading && (
              <div className="text-xs text-white/60 mt-1">読み込み中...</div>
            )}
            {catError && (
              <div className="text-xs text-red-400 mt-1">{catError}</div>
            )}
          </div>
          <div>
            <label className="block text-sm mb-1">サブジャンル</label>
            <Select
              value={genTitleSlug}
              onChange={onChangeTitleSlug}
              options={topicOptions}
            />
            {topicsLoading && (
              <div className="text-xs text-white/60 mt-1">
                サブジャンル読み込み中...
              </div>
            )}
            {topicsError && (
              <div className="text-xs text-red-400 mt-1">{topicsError}</div>
            )}
          </div>
          <div>
            <label className="block text-sm mb-1">件数</label>
            <input
              type="number"
              min={1}
              max={20}
              className="w-full bg-transparent border border-white/10 rounded-md p-2"
              value={genCount}
              onChange={(e) =>
                onChangeCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
              }
            />
          </div>
          <div>
            <label className="block text-sm mb-1">難易度</label>
            <Select
              value={genDifficulty}
              onChange={(v) => onChangeDifficulty(v as typeof genDifficulty)}
              options={[
                { value: "easy", label: "easy" },
                { value: "normal", label: "normal" },
                { value: "hard", label: "hard" },
                { value: "mixed", label: "mixed" },
              ]}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">並列数</label>
            <input
              type="number"
              min={1}
              max={10}
              className="w-full bg-transparent border border-white/10 rounded-md p-2"
              value={parallelCount}
              onChange={(e) =>
                onChangeParallelCount(
                  Math.max(1, Math.min(10, Number(e.target.value) || 1))
                )
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 justify-end">
          <button
            className="btn btn-outline"
            onClick={onPreview}
            disabled={previewing || generating || parallelRunning}
          >
            {previewing ? "プレビュー生成中..." : "生成のみ（プレビュー）"}
          </button>
          <button
            className="btn btn-primary"
            onClick={onGenerate}
            disabled={generating || previewing || parallelRunning}
          >
            {generating ? "生成中..." : "生成して保存"}
          </button>
          <button
            className="btn btn-primary"
            onClick={onGenerateParallel}
            disabled={parallelRunning || generating || previewing}
          >
            {parallelRunning ? "並列中..." : "並列で生成・保存"}
          </button>
        </div>
      </div>

      <div className="card p-5 grid gap-4">
        <div className="font-semibold">回答番号の一括並び替え（均等化）</div>
        <div className="grid sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm mb-1">対象ジャンル</label>
            <Select value={genGenre} onChange={onChangeGenre} options={categories} />
          </div>
          <div>
            <label className="block text-sm mb-1">対象件数（新しい順）</label>
            <input
              type="number"
              min={1}
              max={500}
              className="w-full bg-transparent border border-white/10 rounded-md p-2"
              value={rebalanceLimit}
              onChange={(e) =>
                onChangeRebalanceLimit(
                  Math.max(1, Math.min(500, Number(e.target.value) || 1))
                )
              }
            />
          </div>
          <div className="flex items-end">
            <button
              className="btn btn-primary w-full"
              onClick={onRebalance}
              disabled={rebalancing}
            >
              {rebalancing ? "並び替え中..." : "回答位置を均等化"}
            </button>
          </div>
        </div>
        <div className="text-xs text-white/60">
          指定ジャンルの直近N件について、正解の位置を 0→1→2→3→… の順で再配置します。
          問題本文や選択肢内容は変更せず、選択肢の並びのみ入れ替えます。
        </div>
      </div>
    </>
  );
};

export default GenerationSection;
