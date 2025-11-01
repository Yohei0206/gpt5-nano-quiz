import type { FC } from "react";

export type PreviewItem = {
  id: string;
  prompt: string;
  category?: string;
  difficulty?: string;
  source?: string;
  created_at?: string;
  subgenre?: string | null;
};

type PreviewSectionProps = {
  items: PreviewItem[];
  loading: boolean;
  onReload: () => void;
};

const PreviewSection: FC<PreviewSectionProps> = ({ items, loading, onReload }) => {
  return (
    <div className="card p-5 grid gap-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">最新の生成結果プレビュー</div>
        <button className="btn btn-ghost btn-sm" onClick={onReload} disabled={loading}>
          {loading ? "読み込み中..." : "最新を取得"}
        </button>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-white/60">プレビューできる問題がまだありません。</div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <div key={item.id} className="border border-white/10 rounded-lg p-4">
              <div className="text-sm text-white/80">{item.prompt}</div>
              <div className="mt-2 text-xs text-white/60">
                {item.category && <span>カテゴリ: {item.category}</span>}
                {item.subgenre && <span className="ml-3">サブジャンル: {item.subgenre}</span>}
                {item.difficulty && <span className="ml-3">難易度: {item.difficulty}</span>}
                {item.source && <span className="ml-3">source: {item.source}</span>}
                {item.created_at && (
                  <span className="ml-3">
                    {new Date(item.created_at).toLocaleString("ja-JP")}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PreviewSection;
