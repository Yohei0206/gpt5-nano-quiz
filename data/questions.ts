import type { Question, Difficulty } from "@/lib/types";

const make = (
  id: string,
  prompt: string,
  choices: [string, string, string, string],
  answerIndex: number,
  category: string,
  difficulty: Difficulty,
  explanation?: string,
): Question => ({ id, prompt, choices, answerIndex, category, difficulty, source: "static", explanation });

export const QUESTIONS: Question[] = [
  // 雑学 easy
  make("z-e-1", "富士山の標高に最も近いのは？", ["2,776m", "3,776m", "4,776m", "1,776m"], 1, "雑学", "easy", "実測で3,776m"),
  make("z-e-2", "日本の通貨単位は？", ["ドル", "ユーロ", "円", "ウォン"], 2, "雑学", "easy"),
  make("z-e-3", "地球は何番目の惑星？", ["2番目", "3番目", "4番目", "5番目"], 1, "雑学", "easy"),
  make("z-e-4", "りんごは英語で？", ["banana", "grape", "apple", "orange"], 2, "雑学", "easy"),

  // 雑学 normal
  make("z-n-1", "虹は何色？（一般的な表現）", ["5色", "6色", "7色", "8色"], 2, "雑学", "normal"),
  make("z-n-2", "元素記号Naは何？", ["窒素", "ナトリウム", "ニッケル", "ネオン"], 1, "雑学", "normal"),
  make("z-n-3", "世界で最も話者が多い言語は？", ["英語", "中国語(北京官話)", "スペイン語", "ヒンディー語"], 1, "雑学", "normal"),
  make("z-n-4", "πの近似値として適切なのは？", ["2.41", "3.14", "3.41", "3.34"], 1, "雑学", "normal"),

  // 雑学 hard
  make("z-h-1", "光の速さcは約どれ？", ["3.0×10^6 m/s", "3.0×10^8 m/s", "3.0×10^10 m/s", "3.0×10^12 m/s"], 1, "雑学", "hard"),
  make("z-h-2", "相対性理論を提唱した人物は？", ["ニュートン", "アインシュタイン", "マックスウェル", "ファラデー"], 1, "雑学", "hard"),
  make("z-h-3", "ボイルの法則はどの関係？", ["圧力と温度", "体積と温度", "圧力と体積", "質量と密度"], 2, "雑学", "hard"),

  // 歴史 normal
  make("h-n-1", "織田信長の後を継ぎ天下統一を果たしたのは？", ["徳川家康", "豊臣秀吉", "足利義昭", "明智光秀"], 1, "歴史", "normal"),
  make("h-n-2", "フランス革命が始まった年は？", ["1789年", "1776年", "1815年", "1642年"], 0, "歴史", "normal"),
  make("h-n-3", "ローマ帝国を東西に分割した皇帝は？", ["アウグストゥス", "ディオクレティアヌス", "ネロ", "トラヤヌス"], 1, "歴史", "normal"),

  // 科学 normal
  make("s-n-1", "DNAを構成する塩基に含まれないのは？", ["アデニン", "グアニン", "ウラシル", "シトシン"], 2, "科学", "normal", "DNAはチミン、RNAはウラシル"),
  make("s-n-2", "ニュートンの第2法則は？", ["F=ma", "E=mc^2", "pV=nRT", "V=IR"], 0, "科学", "normal"),
  make("s-n-3", "水の凝固点は？", ["-10℃", "0℃", "10℃", "100℃"], 1, "科学", "normal"),

  // 科学 hard
  make("s-h-1", "pH7の水溶液は？", ["酸性", "中性", "塩基性", "強塩基性"], 1, "科学", "hard"),
  make("s-h-2", "ハイゼンベルクの原理は？", ["相互排他性", "不確定性", "相補性", "慣性"], 1, "科学", "hard"),
  make("s-h-3", "膜電位に主に寄与するイオンは？", ["Na+", "K+", "Ca2+", "Cl-"], 1, "科学", "hard"),
];

export function getQuestions(category: string, difficulty: Difficulty, count: number): Question[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const cat = norm(category);
  const all = QUESTIONS;
  const primary = all.filter(q => norm(q.category) === cat && q.difficulty === difficulty);
  const secondary = all.filter(q => norm(q.category) === cat && q.difficulty !== difficulty);
  const others = all.filter(q => norm(q.category) !== cat);

  const pool = [...primary, ...secondary, ...others];
  const picked: Question[] = [];
  const seen = new Set<string>();
  for (const q of shuffle(pool)) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    picked.push(q);
    if (picked.length >= count) break;
  }
  return picked;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

