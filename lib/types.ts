export type Difficulty = "easy" | "normal" | "hard";

export interface Question {
  id: string;
  prompt: string;
  choices: string[]; // length: 4
  answerIndex: number; // 0-3
  answerText?: string | null;
  explanation?: string;
  category: string;
  subgenre?: string;
  difficulty: Difficulty;
  source: string;
}
