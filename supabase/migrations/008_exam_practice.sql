-- Alma: practice exams.
--
-- One row per attempt. The questions, the student's answers, marks, confidence
-- and feedback are kept together in a jsonb array, because an attempt is
-- always read and written as a whole and never queried question by question.
-- Attempts are private: only their owner can see or change them.

create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module_id uuid references public.modules (id) on delete set null,
  title text not null,
  time_limit_minutes integer check (time_limit_minutes is null or time_limit_minutes between 1 and 300),
  -- in_progress: answering; marking: submitted, typed answers being marked; finished: scored.
  status text not null default 'in_progress' check (status in ('in_progress', 'marking', 'finished')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  questions jsonb not null default '[]'::jsonb,
  score real check (score is null or score between 0 and 1),
  -- The revision deadline added to the planner from this attempt, if any.
  revision_assignment_id uuid references public.assignments (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists exam_attempts_user_idx on public.exam_attempts (user_id, created_at desc);
create index if not exists exam_attempts_module_idx on public.exam_attempts (module_id);

alter table public.exam_attempts enable row level security;

drop policy if exists "Users manage their own exam attempts" on public.exam_attempts;
create policy "Users manage their own exam attempts" on public.exam_attempts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
