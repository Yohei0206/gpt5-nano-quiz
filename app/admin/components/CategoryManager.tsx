import type { FC } from "react";

type CategoryManagerProps = {
  slug: string;
  label: string;
  onChangeSlug: (value: string) => void;
  onChangeLabel: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
};

const CategoryManager: FC<CategoryManagerProps> = ({
  slug,
  label,
  onChangeSlug,
  onChangeLabel,
  onSubmit,
  loading,
}) => {
  return (
    <div className="card p-5 grid gap-4">
      <div className="font-semibold">カテゴリー管理</div>
      <div className="grid sm:grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-sm mb-1">スラッグ（英数字・ハイフン）</label>
          <input
            className="w-full bg-transparent border border-white/10 rounded-md p-2"
            placeholder="例: doraemon"
            value={slug}
            onChange={(e) => onChangeSlug(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">表示名</label>
          <input
            className="w-full bg-transparent border border-white/10 rounded-md p-2"
            placeholder="例: ドラえもん"
            value={label}
            onChange={(e) => onChangeLabel(e.target.value)}
          />
        </div>
        <div>
          <button
            className="btn btn-primary w-full"
            onClick={onSubmit}
            disabled={loading}
          >
            {loading ? "追加中..." : "カテゴリー追加"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CategoryManager;
