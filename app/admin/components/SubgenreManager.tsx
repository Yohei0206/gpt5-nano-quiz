import Select from "@/components/Select";
import type { FC } from "react";

export type Option = {
  value: string;
  label: string;
};

type SubgenreManagerProps = {
  slug: string;
  label: string;
  category: string;
  categories: Option[];
  onChangeSlug: (value: string) => void;
  onChangeLabel: (value: string) => void;
  onChangeCategory: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
};

const SubgenreManager: FC<SubgenreManagerProps> = ({
  slug,
  label,
  category,
  categories,
  onChangeSlug,
  onChangeLabel,
  onChangeCategory,
  onSubmit,
  loading,
}) => {
  return (
    <div className="card p-5 grid gap-4">
      <div className="font-semibold">サブジャンル管理</div>
      <div className="grid sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-sm mb-1">
            サブジャンルのスラッグ（英数字・ハイフン）
          </label>
          <input
            className="w-full bg-transparent border border-white/10 rounded-md p-2"
            placeholder="例: dragon-ball"
            value={slug}
            onChange={(e) => onChangeSlug(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">サブジャンル名</label>
          <input
            className="w-full bg-transparent border border-white/10 rounded-md p-2"
            placeholder="例: ドラゴンボール"
            value={label}
            onChange={(e) => onChangeLabel(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">所属ジャンル</label>
          <Select
            value={category}
            onChange={onChangeCategory}
            options={categories}
          />
        </div>
        <div>
          <button
            className="btn btn-primary w-full"
            onClick={onSubmit}
            disabled={loading}
          >
            {loading ? "追加中..." : "サブジャンル追加"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubgenreManager;
