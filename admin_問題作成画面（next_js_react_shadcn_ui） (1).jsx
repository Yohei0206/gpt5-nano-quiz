import React, { useMemo, useState } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ====== ジャンル定義（必要に応じてDBから取得に置換） ======
const CATEGORIES: { slug: string; label: string; subgenres: { slug: string; label: string }[] }[] = [
  { slug: "general", label: "一般教養", subgenres: [
    { slug: "history", label: "歴史" },
    { slug: "geography", label: "地理" },
    { slug: "literature", label: "文学" },
    { slug: "art", label: "芸術" },
  ]},
  { slug: "science", label: "理系・科学", subgenres: [
    { slug: "math", label: "数学" },
    { slug: "physics", label: "物理" },
    { slug: "chemistry", label: "化学" },
    { slug: "biology", label: "生物" },
    { slug: "astronomy", label: "天文" },
  ]},
  { slug: "entertainment", label: "文化・エンタメ", subgenres: [
    { slug: "anime", label: "アニメ" },
    { slug: "games", label: "ゲーム" },
    { slug: "movies", label: "映画" },
    { slug: "music", label: "音楽" },
    { slug: "sports", label: "スポーツ" },
  ]},
  { slug: "trivia", label: "雑学", subgenres: [
    { slug: "food", label: "食べ物" },
    { slug: "animals", label: "動物" },
    { slug: "transport", label: "乗り物" },
    { slug: "brands", label: "ブランド" },
    { slug: "proverbs", label: "ことわざ" },
  ]},
  { slug: "japan", label: "日本", subgenres: [
    { slug: "japanese-history", label: "日本史" },
    { slug: "culture", label: "伝統文化" },
    { slug: "dialects", label: "方言" },
    { slug: "tourism", label: "観光地" },
  ]},
  { slug: "world", label: "世界", subgenres: [
    { slug: "world-history", label: "世界史" },
    { slug: "world-geography", label: "世界地理" },
    { slug: "flags", label: "国旗" },
    { slug: "culture", label: "文化" },
  ]},
  { slug: "society", label: "時事・社会", subgenres: [
    { slug: "politics", label: "政治" },
    { slug: "economy", label: "経済" },
    { slug: "technology", label: "テクノロジー" },
    { slug: "sdgs", label: "SDGs" },
  ]},
];

// ====== Zod スキーマ（手動作成） ======
const ManualQuestionSchema = z.object({
  prompt: z.string().min(5, "5文字以上で入力してください").max(200, "200文字以内で入力してください"),
  choices: z.array(z.string().min(1, "選択肢を入力してください")).length(4, "選択肢は4つ必要です").refine(
    (arr) => new Set(arr.map((s) => s.trim())).size === 4,
    { message: "選択肢は重複しないようにしてください" }
  ),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().max(300, "解説は300文字以内です").optional().or(z.literal("")),
  category: z.string().min(1, "カテゴリを選択してください"),
  subgenre: z.string().optional(),
  difficulty: z.enum(["easy", "normal", "hard"]).default("normal"),
  source: z.string().default("curated:manual"),
});

// ====== Zod スキーマ（AI一括生成） ======
const BatchGenSchema = z.object({
  genre: z.string().min(1, "カテゴリを選択してください"),
  subgenre: z.string().optional(),
  difficulty: z.enum(["easy", "normal", "hard"]).default("normal"),
  count: z.number().int().min(1).max(50).default(10),
  language: z.enum(["ja", "en"]).default("ja"),
});

type ManualQuestionInput = z.infer<typeof ManualQuestionSchema>;
type BatchGenInput = z.infer<typeof BatchGenSchema>;

type GeneratedItem = {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation?: string;
  category: string;
  subgenre?: string;
  difficulty: "easy" | "normal" | "hard";
  source: string;
};

export default function AdminQuestionCreator() {
  const [genResult, setGenResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [loadingGen, setLoadingGen] = useState(false);
  const [previewManual, setPreviewManual] = useState<GeneratedItem | null>(null);

  const defaultManual: ManualQuestionInput = {
    prompt: "日本で最も高い山は？",
    choices: ["富士山", "北岳", "奥穂高岳", "間ノ岳"],
    answerIndex: 0,
    explanation: "標高3,776mで日本一の山です。",
    category: "japan",
    subgenre: "japanese-history",
    difficulty: "normal",
    source: "curated:manual",
  };

  const manualForm = useForm<ManualQuestionInput>({
    resolver: zodResolver(ManualQuestionSchema),
    defaultValues: defaultManual,
    mode: "onChange",
  });

  const batchForm = useForm<BatchGenInput>({
    resolver: zodResolver(BatchGenSchema),
    defaultValues: { genre: "general", difficulty: "normal", count: 10, language: "ja" },
    mode: "onChange",
  });

  const categoryOptions = useMemo(() => COLD_CACHE(CATEGORIES), []);
  const subgenreOptions = useMemo(() => {
    const g = categoryOptions.find((c) => c.slug === manualForm.watch("category"));
    return g?.subgenres ?? [];
  }, [categoryOptions, manualForm.watch("category")]);

  const onSubmitManual = async (values: ManualQuestionInput) => {
    try {
      const payload: Omit<GeneratedItem, "id"> = {
        prompt: values.prompt,
        choices: values.choices,
        answerIndex: values.answerIndex,
        explanation: values.explanation?.trim() ? values.explanation : undefined,
        category: values.category,
        subgenre: values.subgenre?.trim() ? values.subgenre : undefined,
        difficulty: values.difficulty,
        source: values.source || "curated:manual",
      };

      setPreviewManual({ id: "preview", ...payload });

      const res = await fetch("/api/admin/create-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "保存に失敗しました");
      }

      const data = await res.json();
      toast.success(`保存しました（新規: ${data.inserted ?? 1} 件）`);
      manualForm.reset(defaultManual);
      setPreviewManual(null);
    } catch (e: any) {
      toast.error(e.message || "エラーが発生しました");
    }
  };

  const onSubmitBatch = async (values: BatchGenInput) => {
    try {
      setLoadingGen(true);
      setGenResult(null);

      const res = await fetch("/api/admin/generate-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "生成に失敗しました");
      }

      const data = await res.json();
      setGenResult(data);
      toast.success(`生成完了: 追加 ${data.inserted} / 重複スキップ ${data.skipped}`);
    } catch (e: any) {
      toast.error(e.message || "エラーが発生しました");
    } finally {
      setLoadingGen(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">管理者用：問題作成</h1>
        <Tabs defaultValue="manual" className="w-full">
          <TabsList>
            <TabsTrigger value="manual">手動作成</TabsTrigger>
            <TabsTrigger value="batch">AI一括生成（gpt‑5‑nano）</TabsTrigger>
          </TabsList>

          {/* 手動作成タブ */}
          <TabsContent value="manual">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle>新規問題を作成</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form onSubmit={manualForm.handleSubmit(onSubmitManual)} className="space-y-4">
                    <div className="space-y-2">
                      <Label>カテゴリ</Label>
                      <Controller
                        control={manualForm.control}
                        name="category"
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger>
                              <SelectValue placeholder="選択してください" />
                            </SelectTrigger>
                            <SelectContent>
                              {categoryOptions.map((c) => (
                                <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {manualForm.formState.errors.category && (
                        <p className="text-sm text-red-600">{manualForm.formState.errors.category.message as string}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>サブジャンル（任意）</Label>
                      <Controller
                        control={manualForm.control}
                        name="subgenre"
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger>
                              <SelectValue placeholder="選択してください" />
                            </SelectTrigger>
                            <SelectContent>
                              {(subgenreOptions || []).map((sg) => (
                                <SelectItem key={sg.slug} value={sg.slug}>{sg.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>難易度</Label>
                      <Controller
                        control={manualForm.control}
                        name="difficulty"
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="easy">やさしい</SelectItem>
                              <SelectItem value="normal">ふつう</SelectItem>
                              <SelectItem value="hard">むずかしい</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>問題文</Label>
                      <Textarea rows={3} {...manualForm.register("prompt")} placeholder="例）日本で最も高い山は？" />
                      {manualForm.formState.errors.prompt && (
                        <p className="text-sm text-red-600">{manualForm.formState.errors.prompt.message as string}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>選択肢（4つ）</Label>
                      <div className="space-y-2">
                        {[0,1,2,3].map((i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="radio"
                              className="h-4 w-4"
                              checked={manualForm.watch("answerIndex") === i}
                              onChange={() => manualForm.setValue("answerIndex", i)}
                            />
                            <Input {...manualForm.register(`choices.${i}` as const)} placeholder={`選択肢 ${i+1}`} />
                          </div>
                        ))}
                        {manualForm.formState.errors.choices && (
                          <p className="text-sm text-red-600">{(manualForm.formState.errors.choices as any)?.message || ""}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>解説（任意）</Label>
                      <Textarea rows={3} {...manualForm.register("explanation")} placeholder="解説があれば記入" />
                      {manualForm.formState.errors.explanation && (
                        <p className="text-sm text-red-600">{manualForm.formState.errors.explanation.message as string}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">正解: {String.fromCharCode(65 + (manualForm.watch("answerIndex") ?? 0))}</p>
                    </div>

                    <CardFooter className="flex gap-3 px-0">
                      <Button type="button" variant="secondary" onClick={() => setPreviewManual({
                        id: "preview",
                        prompt: manualForm.getValues("prompt"),
                        choices: manualForm.getValues("choices"),
                        answerIndex: manualForm.getValues("answerIndex"),
                        explanation: manualForm.getValues("explanation") || undefined,
                        category: manualForm.getValues("category"),
                        subgenre: manualForm.getValues("subgenre") || undefined,
                        difficulty: manualForm.getValues("difficulty"),
                        source: "curated:manual",
                      })}>プレビュー更新</Button>
                      <Button type="submit">保存する</Button>
                    </CardFooter>
                  </form>
                </CardContent>
              </Card>

              <Card className="sticky top-6 h-fit shadow-sm">
                <CardHeader>
                  <CardTitle>送信プレビュー（JSON）</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap text-sm bg-white p-3 rounded-xl border overflow-auto max-h-[480px]">
{JSON.stringify(previewManual ?? {
  id: "(保存時に付与)",
  prompt: manualForm.watch("prompt"),
  choices: manualForm.watch("choices"),
  answerIndex: manualForm.watch("answerIndex"),
  explanation: manualForm.watch("explanation") || undefined,
  category: manualForm.watch("category"),
  subgenre: manualForm.watch("subgenre") || undefined,
  difficulty: manualForm.watch("difficulty"),
  source: "curated:manual"
}, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* AI一括生成タブ */}
          <TabsContent value="batch">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>AIで問題を一括生成（gpt‑5‑nano）</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={batchForm.handleSubmit(onSubmitBatch)} className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>カテゴリ</Label>
                      <Controller
                        control={batchForm.control}
                        name="genre"
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger>
                              <SelectValue placeholder="選択してください" />
                            </SelectTrigger>
                            <SelectContent>
                              {categoryOptions.map((c) => (
                                <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>サブジャンル（任意）</Label>
                      <Controller
                        control={batchForm.control}
                        name="subgenre"
                        render={({ field }) => {
                          const g = categoryOptions.find((c) => c.slug === batchForm.watch("genre"));
                          const subs = g?.subgenres ?? [];
                          return (
                            <Select onValueChange={field.onChange} value={field.value}>
                              <SelectTrigger>
                                <SelectValue placeholder="選択してください" />
                              </SelectTrigger>
                              <SelectContent>
                                {subs.map((sg) => (
                                  <SelectItem key={sg.slug} value={sg.slug}>{sg.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          );
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>難易度</Label>
                      <Controller
                        control={batchForm.control}
                        name="difficulty"
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="easy">やさしい</SelectItem>
                              <SelectItem value="normal">ふつう</SelectItem>
                              <SelectItem value="hard">むずかしい</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>件数</Label>
                      <Controller
                        control={batchForm.control}
                        name="count"
                        render={({ field }) => (
                          <Input type="number" min={1} max={50} {...field} />
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>言語</Label>
                      <Controller
                        control={batchForm.control}
                        name="language"
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ja">日本語</SelectItem>
                              <SelectItem value="en">English</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button type="submit" disabled={loadingGen}>{loadingGen ? "生成中..." : "生成して保存"}</Button>
                    <Button type="button" variant="secondary" onClick={() => setGenResult(null)}>リセット</Button>
                  </div>
                </form>

                {genResult && (
                  <div className="mt-6 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge>追加 {genResult.inserted}</Badge>
                      <Badge variant="outline">重複スキップ {genResult.skipped}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Supabaseに保存されました。/api/admin/generate-batch の戻り値を表示しています。</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// 簡易な不変化用ヘルパ（配列をそのままmemo）
function COLD_CACHE<T>(v: T): T { return v; }
