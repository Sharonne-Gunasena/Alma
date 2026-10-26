# Flashcard Study

Upload study material (PDF, Word, text or Markdown), turn it into flashcards with Claude or with a free rule-based extractor, and study with spaced repetition.

- **Accounts and sync:** Supabase (email and password). There's also a guest mode that saves to the browser only.
- **AI generation:** each user's own Anthropic API key, stored only in their browser.
- **Hosting:** GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to `main`.

## Run locally

```bash
npm install
npm run dev
```

## One-time Supabase setup

1. In the Supabase dashboard, open **SQL Editor → New query**, paste [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
2. Under **Authentication → URL Configuration**, set **Site URL** to the GitHub Pages address, and add it under **Redirect URLs** too, so that email confirmation links open the live site.

The project URL and anon key are in `src/config.js`. The anon key is designed to be public, and row-level security restricts each user to their own data.

## Deploy

Push to `main` on GitHub. Then, in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
