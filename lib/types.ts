export type Difficulty = "easy" | "normal" | "hard";

export interface Question {
  id: string;
  prompt: string;
  choices: string[]; // length: 4
  answerIndex: number; // 0-3
  explanation?: string;
  category: string;
  subgenre?: string;
  difficulty: Difficulty;
  source: string;
}

export interface GenerateParams {
  category: string;
  difficulty: Difficulty;
  count: number; // max 10
  language?: "ja" | "en";
}
