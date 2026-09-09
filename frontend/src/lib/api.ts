/**
 * Thin client around the Sherlock Protocol Flask backend.
 * Every function here throws an Error with a human-readable message on
 * failure, so callers can catch it and show `err.message` directly.
 */

import type { StaticProblem } from "../types";

export const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string) || "http://localhost:5000/api";

const TOKEN_KEY = "sherlock-auth-token";

export interface ApiUser {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  created_at: string;
}

export interface GameProgressPayload {
  user_id: number;
  investigator_name: string;
  team_name: string;
  score: number;
  chapters_completed: Record<string, boolean>;
  evidence_found: string[];
  answered_puzzles: string[];
  case_solved: boolean;
  updated_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  team_name: string;
  participant1_name?: string;
  participant2_name?: string;
  round1_score: number;
  round2_qualified?: boolean;
  round2_correct: number;
  score: number;
  updated_at: string;
}

export interface Round1Summary {
  answers: Record<string, string>;
  score: number | null;
  eligible: boolean | null;
  submitted: boolean;
  submitted_at: string | null;
}

export interface AdminParticipant extends ApiUser {
  progress: GameProgressPayload | null;
  round1: Round1Summary | null;
  round2_submissions: RoundSubmissionEntry[];
  overall_score: number;
  current_round: "round1" | "eligible_waiting" | "eliminated" | "round2";
  last_updated: string;
}

export interface AdminStats {
  total_participants: number;
  total_teams: number;
  round1_submitted: number;
  round1_eligible: number;
  round1_eliminated: number;
  recent_registrations: ApiUser[];
}

export interface ContactMessageEntry {
  id: number;
  name: string;
  email: string;
  message: string;
  created_at: string;
}

export interface NewsletterSubscriberEntry {
  id: number;
  email: string;
  subscribed_at: string;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}

/**
 * Every API call funnels through here, so network failures (backend not
 * running, wrong port, no internet) get one clear, consistent message
 * instead of the browser's generic "Failed to fetch".
 */
async function request<T>(
  path: string,
  options: RequestInit = {},
  { auth = false }: { auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };

  if (auth) {
    const token = getToken();
    if (!token) throw new Error("You need to be logged in for this.");
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error(
      `Can't reach the server at ${API_BASE_URL}. Make sure the backend is running (python app.py).`
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { error?: string }).error || `Request failed (${res.status}).`;
    throw new Error(message);
  }
  return data as T;
}

// --- Auth -------------------------------------------------------------

export async function loginUser(userIdOrEmail: string, password: string): Promise<ApiUser> {
  const data = await request<{ user: ApiUser; access_token: string }>("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userIdOrEmail, password }),
  });
  setToken(data.access_token);
  return data.user;
}

export async function logoutUser(): Promise<void> {
  if (!getToken()) return;
  await request("/logout", { method: "POST" }, { auth: true }).catch(() => {
    // Even if the network call fails, clear the local token below.
  });
  clearToken();
}

export async function fetchProfile(): Promise<ApiUser> {
  const data = await request<{ user: ApiUser }>("/profile", {}, { auth: true });
  return data.user;
}

// --- Game progress sync -------------------------------------------------

export async function fetchProgress(): Promise<GameProgressPayload | null> {
  const data = await request<{ progress: GameProgressPayload | null }>(
    "/progress",
    {},
    { auth: true }
  );
  return data.progress;
}

export async function saveProgress(payload: {
  investigator_name: string;
  team_name: string;
  score: number;
  chapters_completed: Record<string, boolean>;
  evidence_found: string[];
  answered_puzzles: string[];
  case_solved: boolean;
}): Promise<GameProgressPayload> {
  const data = await request<{ progress: GameProgressPayload }>(
    "/progress",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    { auth: true }
  );
  return data.progress;
}

// --- Leaderboard (public) ------------------------------------------------

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const data = await request<{ leaderboard: LeaderboardEntry[] }>("/leaderboard");
  return data.leaderboard;
}

// --- Contact & newsletter -------------------------------------------------

export async function submitContactMessage(
  name: string,
  email: string,
  message: string
): Promise<{ message: string }> {
  return request("/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, message }),
  });
}

export async function subscribeNewsletter(email: string): Promise<{ message: string }> {
  return request("/newsletter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

// --- Competition: rounds, timers, submissions ------------------------------

export interface Round1Question {
  id: string;
  question: string;
  options: { id: string; label: string }[];
}

export interface RoundTimerInfo {
  round_number: number;
  started_at: string;
  duration_minutes: number;
  expires_at: string;
  completed_at: string | null;
  is_expired: boolean;
}

export interface Round1SubmitResult {
  score: number;
  total: number;
  eligible: boolean;
  results: {
    id: string;
    question: string;
    your_answer: string | null;
    correct_answer: string;
    is_correct: boolean;
  }[];
}

export interface RoundSubmissionEntry {
  round_number: number;
  problem_number: number;
  status: "not_started" | "attempted" | "submitted";
  result: "pending" | "correct" | "incorrect";
  submission_text: string | null;
  submitted_at: string | null;
  updated_at: string;
}

export type ExecutionLanguage = "python" | "c" | "cpp" | "java";

export interface CodeExecutionResult {
  problem_number: number;
  status: "success" | "compile_error" | "runtime_error" | "timeout" | "internal_error";
  stdout: string;
  stderr: string;
  exit_code: number | null;
  duration_ms: number;
}

export interface CodeSubmissionResult {
  problem_number: number;
  status: "accepted" | "wrong_answer" | "compile_error" | "runtime_error" | "timeout";
  accepted: boolean;
  tests_passed: number;
  tests_total: number;
  submission: RoundSubmissionEntry;
}

export interface RoundConfigEntry {
  round_number: number;
  is_unlocked: boolean;
  duration_minutes: number;
  updated_at: string;
  code_word?: string;
  key_update?: string;
}

export interface CompetitionStatus {
  rounds: Record<string, RoundConfigEntry>;
  round1: {
    submitted: boolean;
    score: number | null;
    eligible: boolean | null;
    timer: RoundTimerInfo | null;
  };
  round2: { access: boolean; timer: RoundTimerInfo | null; submissions: RoundSubmissionEntry[] };
  round3: {
    access: boolean;
    round2_completed: boolean;
    submitted: boolean;
    qualified: boolean;
    submission: RoundSubmissionEntry | null;
    result: { code_word: string; key_update: string } | null;
  };
}

export async function fetchCompetitionStatus(): Promise<CompetitionStatus> {
  return request<CompetitionStatus>("/competition/status", {}, { auth: true });
}

export async function startRound1(): Promise<{
  already_submitted: boolean;
  questions?: Round1Question[];
  timer?: RoundTimerInfo;
  result?: Round1SubmitResult & { submitted: boolean };
}> {
  return request("/round1/start", { method: "POST" }, { auth: true });
}

export async function submitRound1(
  answers: Record<string, string>
): Promise<Round1SubmitResult> {
  return request(
    "/round1/submit",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    },
    { auth: true }
  );
}

export async function fetchRound1Result(): Promise<
  ({ submitted: false } | ({ submitted: true } & Round1SubmitResult))
> {
  return request("/round1/result", {}, { auth: true });
}

export async function startRound(
  roundNumber: 2
): Promise<{ timer: RoundTimerInfo; problem_count: number; submissions: RoundSubmissionEntry[] }> {
  return request(`/round${roundNumber}/start`, { method: "POST" }, { auth: true });
}

export async function submitProblem(
  roundNumber: 2,
  problemNumber: number,
  status: "attempted" | "submitted",
  submissionText?: string
): Promise<{ submission: RoundSubmissionEntry }> {
  return request(
    `/rounds/${roundNumber}/submissions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        problem_number: problemNumber,
        status,
        submission_text: submissionText,
      }),
    },
    { auth: true }
  );
}

export async function runTeamRound2Code(
  problemNumber: number,
  language: ExecutionLanguage,
  sourceCode: string,
  inputData: string
): Promise<CodeExecutionResult> {
  return request(
    "/team/round2/run",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem_number: problemNumber, language, source_code: sourceCode, input_data: inputData }),
    },
    { auth: true }
  );
}

export async function submitTeamRound2Code(
  problemNumber: number,
  language: ExecutionLanguage,
  sourceCode: string
): Promise<CodeSubmissionResult> {
  return request(
    "/team/round2/submit",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem_number: problemNumber, language, source_code: sourceCode }),
    },
    { auth: true }
  );
}

// --- Admin: competition control ---------------------------------------------

export interface AdminRoundSummary {
  config: RoundConfigEntry;
  participants: number;
  eligible?: number;
  eliminated?: number;
  completed?: number;
  qualified?: number;
}

export interface AdminRoundsOverview {
  round1: AdminRoundSummary;
  round2: AdminRoundSummary;
  round3: AdminRoundSummary;
}

export async function fetchAdminRounds(): Promise<AdminRoundsOverview> {
  return request<AdminRoundsOverview>("/admin/rounds", {}, { auth: true });
}

export async function updateRoundConfig(
  roundNumber: 1 | 2 | 3,
  updates: { is_unlocked?: boolean; duration_minutes?: number; code_word?: string; key_update?: string }
): Promise<RoundConfigEntry> {
  const data = await request<{ round: RoundConfigEntry }>(
    `/admin/rounds/${roundNumber}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    },
    { auth: true }
  );
  return data.round;
}

export async function gradeSubmission(
  userId: number,
  roundNumber: number,
  problemNumber: number,
  result: "correct" | "incorrect" | "pending"
): Promise<RoundSubmissionEntry> {
  const data = await request<{ submission: RoundSubmissionEntry }>(
    `/admin/submissions/${userId}/${roundNumber}/${problemNumber}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result }),
    },
    { auth: true }
  );
  return data.submission;
}

// --- Admin dashboard: users, contacts, newsletter --------------------------

export async function fetchAdminStats(): Promise<AdminStats> {
  return request<AdminStats>("/admin/stats", {}, { auth: true });
}

export async function fetchAdminParticipants(search = ""): Promise<AdminParticipant[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  const data = await request<{ participants: AdminParticipant[] }>(
    `/admin/participants${query}`,
    {},
    { auth: true }
  );
  return data.participants;
}

export async function fetchAdminContacts(): Promise<ContactMessageEntry[]> {
  const data = await request<{ messages: ContactMessageEntry[] }>(
    "/admin/contacts",
    {},
    { auth: true }
  );
  return data.messages;
}

export async function fetchAdminNewsletter(): Promise<NewsletterSubscriberEntry[]> {
  const data = await request<{ subscribers: NewsletterSubscriberEntry[] }>(
    "/admin/newsletter",
    {},
    { auth: true }
  );
  return data.subscribers;
}

// =============================================================================
// TEAM-BASED DETECTIVE MYSTERY SYSTEM
// =============================================================================

export interface TeamInfo {
  id: number;
  name: string;
  participant1_name?: string;
  participant2_name?: string;
  user_id?: number | null;
  round2_qualified?: boolean;
  round3_enabled?: boolean;
  round3_qualified?: boolean;
  created_at: string;
}

export interface TeamMember {
  id: number;
  username: string;
}

export interface FinalResultSummary {
  round1_score: number;
  round1_completed: boolean;
  round2_qualified: boolean;
  round2_submitted_count: number;
  round2_correct_count: number;
  round2_completed: boolean;
  overall_score: number;
}

export interface TeamStatus {
  team: TeamInfo | null;
  members: TeamMember[];
  rounds: Record<string, RoundConfigEntry>;
  round1: {
    submitted: boolean;
    score: number | null;
    eligible: boolean | null;
    timer: RoundTimerInfo | null;
    result: { code_word: string; key_update: string } | null;
  };
  round2: {
    access: boolean;
    round1_completed: boolean;
    qualified: boolean;
    timer: RoundTimerInfo | null;
    submissions: RoundSubmissionEntry[];
    result: { code_word: string; key_update: string } | null;
  };
  round3: {
    access: boolean;
    round2_completed: boolean;
    submitted: boolean;
    qualified: boolean;
    submission: RoundSubmissionEntry | null;
    result: { code_word: string; key_update: string } | null;
    timer: RoundTimerInfo | null;
    timer_expired: boolean;
  };
  final_result: FinalResultSummary;
}

export async function fetchTeamStatus(): Promise<TeamStatus> {
  return request<TeamStatus>("/team/status", {}, { auth: true });
}

export async function startTeamRound1(): Promise<{
  already_submitted: boolean;
  questions?: Round1Question[];
  timer?: RoundTimerInfo;
  result?: Round1SubmitResult & { submitted: boolean };
}> {
  return request("/team/round1/start", { method: "POST" }, { auth: true });
}

export async function submitTeamRound1(answers: Record<string, string>): Promise<Round1SubmitResult> {
  return request(
    "/team/round1/submit",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers }) },
    { auth: true }
  );
}

export async function fetchTeamRound1Result(): Promise<
  { submitted: false } | ({ submitted: true } & Round1SubmitResult)
> {
  return request("/team/round1/result", {}, { auth: true });
}

export async function startTeamRound(
  roundNumber: 2 = 2
): Promise<{ timer: RoundTimerInfo; problems: StaticProblem[]; submissions: RoundSubmissionEntry[] }> {
  return request(`/team/round${roundNumber}/start`, { method: "POST" }, { auth: true });
}

export async function submitTeamProblem(
  roundNumber: 2 = 2,
  problemNumber: number,
  status: "attempted" | "submitted",
  submissionText?: string
): Promise<{ submission: RoundSubmissionEntry }> {
  return request(
    `/team/rounds/${roundNumber}/submissions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem_number: problemNumber, status, submission_text: submissionText }),
    },
    { auth: true }
  );
}

export async function submitTeamRound3(answer: string): Promise<{
  submission: RoundSubmissionEntry;
  qualified: boolean;
  result: { code_word: string; key_update: string } | null;
}> {
  return request(
    "/team/round3/submit",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    },
    { auth: true }
  );
}

export async function startTeamRound3(): Promise<{
  timer: RoundTimerInfo;
  submission: RoundSubmissionEntry | null;
}> {
  return request("/team/round3/start", { method: "POST" }, { auth: true });
}

// --- Admin: question pools and teams -----------------------------------------

export interface AdminQuestionR1 {
  id: number;
  question: string;
  options: { id: string; label: string }[];
  correct_option_id: string;
}

export interface AdminProblem {
  id: number;
  title: string;
  prompt: string;
  input: string;
  output: string;
  constraints: string[];
  examples: { input: string; output: string }[];
  code?: string;
  expectedBehavior?: string;
}

export interface AdminTeam {
  team: TeamInfo;
  members: { id: number; username: string; email: string }[];
  login_user_id?: string;
  participant1_name?: string;
  participant2_name?: string;
  investigator_name?: string;
  round1: Round1Summary | null;
  round2_qualified?: boolean;
  round2_submissions: RoundSubmissionEntry[];
  round3_submission: RoundSubmissionEntry | null;
  round3_qualified: boolean;
  round3_enabled: boolean;
  overall_score: number;
}

async function adminGet<T>(path: string): Promise<T> {
  return request<T>(path, {}, { auth: true });
}
async function adminPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, { auth: true });
}
async function adminPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, { auth: true });
}
async function adminDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" }, { auth: true });
}

export const fetchAdminRound1Questions = () => adminGet<{ questions: AdminQuestionR1[] }>("/admin/questions/round1").then((d) => d.questions);
export const createRound1Question = (data: Omit<AdminQuestionR1, "id">) => adminPost<{ question: AdminQuestionR1 }>("/admin/questions/round1", data).then((d) => d.question);
export const updateRound1Question = (id: number, data: Partial<Omit<AdminQuestionR1, "id">>) => adminPut<{ question: AdminQuestionR1 }>(`/admin/questions/round1/${id}`, data).then((d) => d.question);
export const deleteRound1Question = (id: number) => adminDelete(`/admin/questions/round1/${id}`);

export const fetchAdminRound2Problems = () => adminGet<{ problems: AdminProblem[] }>("/admin/questions/round2").then((d) => d.problems);
export const createRound2Problem = (data: Omit<AdminProblem, "id" | "code" | "expectedBehavior">) => adminPost<{ problem: AdminProblem }>("/admin/questions/round2", data).then((d) => d.problem);
export const updateRound2Problem = (id: number, data: Partial<AdminProblem>) => adminPut<{ problem: AdminProblem }>(`/admin/questions/round2/${id}`, data).then((d) => d.problem);
export const deleteRound2Problem = (id: number) => adminDelete(`/admin/questions/round2/${id}`);

export const fetchAdminTeams = () => adminGet<{ count: number; teams: AdminTeam[] }>("/admin/teams").then((d) => d.teams);

export async function createAdminTeam(data: {
  team_name: string;
  participant1_name: string;
  participant2_name: string;
  participant1_user_id: string;
  participant1_password: string;
  participant2_user_id: string;
  participant2_password: string;
}): Promise<{ team: TeamInfo; users: ApiUser[] }> {
  return adminPost<{ team: TeamInfo; users: ApiUser[] }>("/admin/teams", data);
}

export async function qualifyTeamRound2(teamId: number, qualified: boolean): Promise<{ team: TeamInfo; round2_qualified: boolean }> {
  return adminPut<{ team: TeamInfo; round2_qualified: boolean }>(`/admin/teams/${teamId}/qualify-round2`, { qualified });
}

export async function enableTeamRound3(teamId: number, enabled: boolean): Promise<{ team: TeamInfo; round3_enabled: boolean }> {
  return adminPut<{ team: TeamInfo; round3_enabled: boolean }>(`/admin/teams/${teamId}/enable-round3`, { enabled });
}

export async function retryTeamRound(teamId: number, roundNumber: 1 | 2 | 3): Promise<{ message: string }> {
  return adminPost<{ message: string }>(`/admin/teams/${teamId}/retry-round/${roundNumber}`, {});
}

export async function gradeTeamSubmission(
  teamId: number,
  roundNumber: number,
  problemNumber: number,
  result: "correct" | "incorrect" | "pending"
): Promise<RoundSubmissionEntry> {
  const data = await adminPut<{ submission: RoundSubmissionEntry }>(
    `/admin/team-submissions/${teamId}/${roundNumber}/${problemNumber}`,
    { result }
  );
  return data.submission;
}

export const fetchAdminUsers = () => adminGet<{ count: number; users: ApiUser[] }>("/admin/users").then((d) => d.users);
