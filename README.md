# My Roadmaps

Many learning roadmaps in one place. Each is a horizontal spine of stages with
**topics** (what to learn) and **resources** (where to learn it: courses, docs,
blog posts, videos, books, projects), a status on every item, and a dashboard of
how far along you are. Grown out of `../AI-Roadmap`.

## Two shells, one codebase

| | Desktop app (Tauri) | Web viewer |
|---|---|---|
| Browse roadmaps, dashboard, stats | yes | yes |
| Change status, notes, links, files, archive, move, delete | yes | no, read-only |
| Create a roadmap with AI research | yes | no |
| AI configuration | the Claude Code CLI on this Mac | none at all |

`src/lib/platform.ts` is the switch: `canEdit` is true only inside Tauri.

## How the AI works (and why there is no API key)

Research is one non-interactive turn of the **Claude Code CLI you are already
signed into** (`claude -p`), spawned by `src-tauri/src/ai.rs`. It uses your
Claude subscription, exactly like running `claude` in a terminal.

The child process is locked down: its only tools are `WebSearch` and `WebFetch`
(no shell, no file access, no MCP servers, no hooks), it runs in an empty
scratch folder, the prompt goes in on stdin, and the answer must match a JSON
schema (`--json-schema`). What comes back is still cleaned in
`normalise()` before you see it: unique keys, links only to topics that exist,
http(s) urls only, one main resource per topic.

Nothing is saved until you review the draft and press **Save roadmap**.

Later, if you want research on the web too, that is the point to add a server
with an Anthropic API key. Nothing here needs to change for that.

## Stack

| Piece | What | Notes |
|---|---|---|
| Tauri 2 + Rust | The desktop shell and the CLI runner | macOS build; unsigned, like dotclaude |
| Vite + React + TypeScript | The UI for both shells | |
| Supabase (Sydney), project `ai-roadmap` | Sign-in, Postgres, private file storage | Shared with `../AI-Roadmap`, whose `progress` table is untouched |
| Vercel Hobby (optional) | Hosting for the web viewer | Non-commercial use only. Not deployed yet |

Every table has Row Level Security: you can only read or write rows whose
`user_id` is you. Files live in a private bucket under `<your user id>/…` and
are opened through links that expire after five minutes.

## Run it

```bash
npm install
cp .env.example .env.local      # both values are public by design
npm run app                     # the desktop app, with hot reload
npm run app:build               # a .app and .dmg in src-tauri/target/release/bundle
npm run dev                     # just the web viewer, http://localhost:1420
```

Needs Rust (`brew install rust`), Xcode command line tools, and Claude Code
signed in (`claude` once in a terminal).

## Signing in

Email and password, because it works identically in the app and on the web.
If your account was made with an emailed link and has no password: choose
"Use an emailed link", copy the link from the email **without clicking it**,
paste it into the app, then set a password under the account button.

## Free-tier caps

| Cap | Limit | What happens | What to do |
|---|---|---|---|
| Supabase inactivity | 7 days with nobody opening it | Project pauses; the app can't load until resumed | Dashboard, Restore, about a minute |
| Supabase projects | 2 active on the free plan | This app shares one with AI-Roadmap for that reason | Pause another project or go Pro ($25/mo) to split them |
| Database | 500 MB | Writes fail | A 77-topic roadmap is about 60 KB. Thousands of roadmaps |
| File storage | 1 GB, 10 MB per file | Uploads fail | Delete old attachments |
| Claude plan allowance | Your subscription's usage limits | Research fails with a limit message until it resets | Use Sonnet, skip deep research, or wait |

Nothing here bills by overage, and no card is on file.

## Data model

| Table | Holds |
|---|---|
| `roadmaps` | Title, description, state |
| `stages` | Ordered stages of a roadmap, with pace and an optional milestone |
| `topics` | What to learn: importance, status, archived flag, markdown notes |
| `resources` | Where to learn it: kind, provider, url, cost, duration, plus the same status/archive/notes |
| `topic_resources` | Which resource covers which topic; one per topic is the main one |
| `item_links`, `item_files` | Extra links and attachments on a topic or resource |

Schema: `supabase/migrations/0001_my_roadmaps.sql`.

## Hand-off notes

- Data model and visual design: "you decide" (the Lagoon look carries over from AI-Roadmap).
- Archived items are hidden and leave your stats, but keep notes and files.
- "Move" means to another stage or earlier/later within one. Moving an item to a
  different roadmap is not built.
