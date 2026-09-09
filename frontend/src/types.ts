export interface StaticProblem {
  id: number;
  title: string;
  prompt: string;
  code?: string; // buggy code, for Round 3
  input: string;
  output: string;
  constraints: string[];
  examples: { input: string; output: string }[];
  expectedBehavior?: string; // for Round 3 debugging problems
}
