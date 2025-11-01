export type MatchState = "waiting" | "in_progress" | "finished";

export type VsPlayer = {
  id: string;
  name: string;
  score: number;
  is_host?: boolean;
};

export type VsQuestion = {
  id?: string;
  prompt: string;
  choices: string[];
  answerIndex?: number;
  explanation?: string | null;
};

export type VsLastAnswer = {
  player_id?: string | null;
  correct: boolean;
  answerIndex?: number;
  index?: number;
  created_at?: string;
};

export type VsState = {
  match: {
    id: string;
    state: MatchState;
    current_index?: number | null;
    locked_by?: string | null;
  } | null;
  players: VsPlayer[];
  question?: VsQuestion | null;
  lastAnswer?: VsLastAnswer | null;
  history?: VsQuestion[];
};
