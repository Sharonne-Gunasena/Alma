# Alma

**The student life operating system.** Timetable, deadlines, an adaptive study planner and AI-built flashcards from your own lecture slides, all in one place.

Live: https://sharonne-gunasena.github.io/Alma/

## Features

- **Timetable import:** upload a calendar export (.ics) from Google Calendar, Outlook or Apple Calendar. Recurring classes collapse into weekly slots, and a module is created for each module code (e.g. `COMP10110: Computer Programming I (Lecture)`).
- **Adaptive study planner:** fits study sessions into your study hours around your classes, using a *least-slack-first* rule: each session goes to the task with the least spare time before its deadline. The plan rebuilds every time it's shown, so missed sessions roll forward, and it warns when work no longer fits before a deadline. See [`src/lib/planner.js`](src/lib/planner.js).
- **Lecture → flashcards + study guide:** a multi-step process instead of one big prompt ([`src/ai/engine.js`](src/ai/engine.js)):
  1. Splits the lecture into sections, keeping page numbers.
  2. Per section, writes a summary, key terms and varied card types (definition, why/how, fill-the-blank, compare, steps, worked problem, code). With vision models it also reads the slide images, so diagrams and equations aren't lost.
  3. Optionally runs a review pass that fixes vague, ambiguous or unsupported cards.
  4. Checks the cards in code: duplicates are removed, and answers not found in the notes are flagged.
- **Study mode:** spaced repetition (SM-2), with AI-graded typed answers, "Explain this", and "Show in my notes" to jump to the source page.
- **Weak-topic tracking:** the dashboard surfaces the topics with the lowest recall.
- **Free AI:** each user brings their own key. Google Gemini and Groq both offer free keys, and Claude is an optional paid upgrade. Keys stay in the browser.
- **Accounts:** Supabase auth and Postgres with row-level security, or a guest mode stored in the browser.

## Tech

React 19 + Vite · Tailwind CSS v4 · Radix UI primitives · Motion · Lucide icons · Geist type · Supabase (Postgres, Auth, Storage, RLS) · pdf.js, mammoth, ical.js · Gemini / Groq / Anthropic SDKs · zod · Vitest · GitHub Actions → GitHub Pages

The UI is a small in-house design system in [`src/ui/`](src/ui): buttons, cards, dialogs and side sheets, form fields, progress rings and a week calendar ([`TimeGrid`](src/ui/TimeGrid.jsx)) where you drag to block out busy time. Pages load on demand with `React.lazy`.

```
src/
  ai/          providers.js (one interface over Gemini/Groq/Claude), engine.js (flashcard process), quality.js (code checks)
  lib/         db.js (cloud + guest storage), planner.js, ics.js, srs.js, extract.js, time.js
  components/  pages (Dashboard, Planner, Timetable, Modules, Decks, Create, Study, Guide, Settings, Onboarding)
supabase/migrations/  database schema, run in order
```

## Run locally

```bash
npm install
npm run dev
npm test
```

## Database setup

In the Supabase dashboard, open **SQL Editor → New query** and run each file in [`supabase/migrations/`](supabase/migrations) in order. Each file is safe to run again.

Under **Authentication → URL Configuration**, set the Site URL and Redirect URLs to the live address.

## Course page reader (Supabase Edge Function)

[`supabase/functions/read-course-page`](supabase/functions/read-course-page/index.ts) fetches a university course page so the app can find its modules. It only reads pages on domains listed in the `universities` table. Deploy it once:

```bash
npx supabase login
npx supabase functions deploy read-course-page --project-ref ncqppzpfnvlrtqhbftnx
```

## Deploy

Every push to `main` builds, tests and deploys to GitHub Pages ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

## Roadmap

- [x] Planner, timetable, modules, AI flashcards and study guides
- [ ] Module communities: shared decks and resources rated by classmates, study-group matching
- [ ] Student marketplace (textbooks, calculators, equipment), linked to modules
- [ ] Notifications and exam-countdown review mode
