import { useEffect, useState } from "react";
import {
  fetchAdminRound1Questions,
  createRound1Question,
  updateRound1Question,
  deleteRound1Question,
  fetchAdminRound2Problems,
  createRound2Problem,
  updateRound2Problem,
  deleteRound2Problem,
  type AdminQuestionR1,
  type AdminProblem,
} from "../../lib/api";

type Tab = "round1" | "round2";

const MIN_COUNTS: Record<Tab, number> = { round1: 20, round2: 9 };
const MAX_COUNTS: Partial<Record<Tab, number>> = { round1: 60 };

function parseLines(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

function parseExamples(text: string): { input: string; output: string }[] {
  return parseLines(text)
    .map((line) => {
      const [input, output] = line.split("=>").map((s) => s?.trim());
      return input && output ? { input, output } : null;
    })
    .filter((e): e is { input: string; output: string } => e !== null);
}

function examplesToText(examples: { input: string; output: string }[]): string {
  return examples.map((e) => `${e.input} => ${e.output}`).join("\n");
}

export default function QuestionPoolsPanel() {
  const [tab, setTab] = useState<Tab>("round1");
  const [r1, setR1] = useState<AdminQuestionR1[]>([]);
  const [r2, setR2] = useState<AdminProblem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  function loadAll() {
    setLoading(true);
    Promise.all([fetchAdminRound1Questions(), fetchAdminRound2Problems()])
      .then(([q1, p2]) => {
        setR1(q1);
        setR2(p2);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }

  useEffect(loadAll, []);

  const count = tab === "round1" ? r1.length : r2.length;
  const maxCount = MAX_COUNTS[tab];

  function startAdd() {
    setEditingId(null);
    setShowForm(true);
  }
  function startEdit(id: number) {
    setEditingId(id);
    setShowForm(true);
  }
  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleDelete(tabKey: Tab, id: number) {
    if (count <= MIN_COUNTS[tabKey]) {
      setError(`Pool must keep at least ${MIN_COUNTS[tabKey]} items.`);
      return;
    }
    if (!confirm("Delete this item?")) return;
    try {
      if (tabKey === "round1") await deleteRound1Question(id);
      if (tabKey === "round2") await deleteRound2Problem(id);
      loadAll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="mb-8 rounded-lg border border-line bg-panel/90 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="font-display text-lg text-ivory">Question Pools</h2>
        <div className="flex gap-2">
          {(["round1", "round2"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                closeForm();
              }}
              className={`mono-tag rounded border px-3 py-1.5 text-[11px] uppercase tracking-widest ${
                tab === t ? "border-cyan bg-cyan/10 text-cyan" : "border-line text-paper/60 hover:text-cyan"
              }`}
            >
              {t === "round1" ? "Round 1" : "Round 2"}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {error ? <p className="mb-3 text-sm text-red">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-paper/60">Loading…</p>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="mono-tag text-xs text-paper/50">
                {count} item{count === 1 ? "" : "s"} (minimum {MIN_COUNTS[tab]}{maxCount ? `, maximum ${maxCount}` : ""})
              </p>
              <button
                onClick={startAdd}
                disabled={maxCount !== undefined && count >= maxCount}
                className="mono-tag rounded border border-green/50 bg-green/10 px-3 py-1.5 text-[11px] uppercase tracking-widest text-green hover:bg-green/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {maxCount !== undefined && count >= maxCount ? "Maximum reached" : "+ Add"}
              </button>
            </div>

            {showForm ? (
              tab === "round1" ? (
                <Round1Form
                  existing={editingId ? r1.find((q) => q.id === editingId) : undefined}
                  onCancel={closeForm}
                  onSaved={() => {
                    closeForm();
                    loadAll();
                  }}
                  setError={setError}
                />
              ) : (
                <ProblemForm
                  existing={editingId ? r2.find((p) => p.id === editingId) : undefined}
                  onCancel={closeForm}
                  onSaved={() => {
                    closeForm();
                    loadAll();
                  }}
                  setError={setError}
                />
              )
            ) : null}

            <div className="space-y-2">
              {tab === "round1" &&
                r1.map((q) => (
                  <div key={q.id} className="rounded-md border border-line bg-ink/60 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-ivory">{q.question}</p>
                      <div className="flex shrink-0 gap-2">
                        <button onClick={() => startEdit(q.id)} className="mono-tag text-[10px] uppercase text-cyan hover:underline">
                          Edit
                        </button>
                        <button onClick={() => handleDelete("round1", q.id)} className="mono-tag text-[10px] uppercase text-red hover:underline">
                          Delete
                        </button>
                      </div>
                    </div>
                    <p className="mono-tag mt-1 text-xs text-green">
                      Correct: {q.options.find((o) => o.id === q.correct_option_id)?.label}
                    </p>
                  </div>
                ))}
              {tab === "round2" &&
                r2.map((p) => (
                  <div key={p.id} className="rounded-md border border-line bg-ink/60 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-ivory">{p.title}</p>
                      <div className="flex shrink-0 gap-2">
                        <button onClick={() => startEdit(p.id)} className="mono-tag text-[10px] uppercase text-cyan hover:underline">
                          Edit
                        </button>
                        <button onClick={() => handleDelete("round2", p.id)} className="mono-tag text-[10px] uppercase text-red hover:underline">
                          Delete
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-paper/60 line-clamp-1">{p.prompt}</p>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Round1Form({
  existing,
  onCancel,
  onSaved,
  setError,
}: {
  existing?: AdminQuestionR1;
  onCancel: () => void;
  onSaved: () => void;
  setError: (e: string) => void;
}) {
  const [question, setQuestion] = useState(existing?.question ?? "");
  const [options, setOptions] = useState(
    existing?.options ?? [
      { id: "a", label: "" },
      { id: "b", label: "" },
      { id: "c", label: "" },
      { id: "d", label: "" },
    ]
  );
  const [correctId, setCorrectId] = useState(existing?.correct_option_id ?? "a");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!question.trim() || options.some((o) => !o.label.trim())) {
      setError("Fill in the question and all 4 options.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (existing) {
        await updateRound1Question(existing.id, { question, options, correct_option_id: correctId });
      } else {
        await createRound1Question({ question, options, correct_option_id: correctId });
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 space-y-3 rounded-md border border-cyan/30 bg-ink/40 p-4">
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Question text"
        rows={2}
        className="w-full rounded border border-line bg-ink px-3 py-2 text-sm text-ivory focus:border-cyan focus:outline-none"
      />
      {options.map((opt, i) => (
        <div key={opt.id} className="flex items-center gap-2">
          <input
            type="radio"
            name="correct"
            checked={correctId === opt.id}
            onChange={() => setCorrectId(opt.id)}
            className="shrink-0"
          />
          <input
            value={opt.label}
            onChange={(e) => {
              const next = [...options];
              next[i] = { ...opt, label: e.target.value };
              setOptions(next);
            }}
            placeholder={`Option ${opt.id.toUpperCase()}`}
            className="w-full rounded border border-line bg-ink px-3 py-1.5 text-sm text-ivory focus:border-cyan focus:outline-none"
          />
        </div>
      ))}
      <p className="mono-tag text-[10px] uppercase text-paper/40">Select the radio button next to the correct answer</p>
      <div className="flex gap-2">
        <button
          disabled={saving}
          onClick={handleSave}
          className="mono-tag rounded border border-green/50 bg-green/10 px-4 py-2 text-xs uppercase text-green hover:bg-green/20 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="mono-tag rounded border border-line px-4 py-2 text-xs uppercase text-paper/60">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ProblemForm({
  existing,
  onCancel,
  onSaved,
  setError,
}: {
  existing?: AdminProblem;
  onCancel: () => void;
  onSaved: () => void;
  setError: (e: string) => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [prompt, setPrompt] = useState(existing?.prompt ?? "");
  const [input, setInput] = useState(existing?.input ?? "");
  const [output, setOutput] = useState(existing?.output ?? "");
  const [constraintsText, setConstraintsText] = useState((existing?.constraints ?? []).join("\n"));
  const [examplesText, setExamplesText] = useState(examplesToText(existing?.examples ?? []));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim() || !prompt.trim() || !input.trim() || !output.trim()) {
      setError("Fill in all required fields.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      title,
      prompt,
      input,
      output,
      constraints: parseLines(constraintsText),
      examples: parseExamples(examplesText),
    };
    try {
      existing ? await updateRound2Problem(existing.id, payload) : await createRound2Problem(payload as Omit<AdminProblem, "id" | "code" | "expectedBehavior">);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full rounded border border-line bg-ink px-3 py-2 text-sm text-ivory focus:border-cyan focus:outline-none";

  return (
    <div className="mb-4 space-y-3 rounded-md border border-cyan/30 bg-ink/40 p-4">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={inputCls} />
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Prompt" rows={2} className={inputCls} />
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Input spec" className={inputCls} />
        <input value={output} onChange={(e) => setOutput(e.target.value)} placeholder="Output spec" className={inputCls} />
      </div>
      <textarea
        value={constraintsText}
        onChange={(e) => setConstraintsText(e.target.value)}
        placeholder="Constraints — one per line"
        rows={2}
        className={inputCls}
      />
      <textarea
        value={examplesText}
        onChange={(e) => setExamplesText(e.target.value)}
        placeholder="Examples — one per line, format: input => output"
        rows={2}
        className={`${inputCls} mono-tag`}
      />
      <div className="flex gap-2">
        <button
          disabled={saving}
          onClick={handleSave}
          className="mono-tag rounded border border-green/50 bg-green/10 px-4 py-2 text-xs uppercase text-green hover:bg-green/20 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="mono-tag rounded border border-line px-4 py-2 text-xs uppercase text-paper/60">
          Cancel
        </button>
      </div>
    </div>
  );
}
