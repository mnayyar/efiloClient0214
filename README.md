# efilo.ai — Claude Code Build Guide

## Overview

This directory contains everything you need to build efilo.ai's MVP (Capability 1: Universal Search & Chat) using Claude Code. The files are structured so Claude Code can reference them at each phase without being overwhelmed by the full spec.

## File Structure

```
├── CLAUDE.md                          ← Claude Code reads this automatically
│                                        Architecture, tech stack, conventions, project structure
├── docs/
│   ├── SCHEMA.md                      ← Complete Prisma schema (all models, all enums)
│   ├── AI_SERVICE.md                  ← AI service patterns, token budgets, code templates
│   ├── SEARCH.md                      ← Search scoring algorithm, pgvector queries, ranking logic
│   └── phases/
│       ├── PHASE_1_SCAFFOLD.md        ← Project setup, deps, structure
│       ├── PHASE_2_AUTH.md            ← WorkOS auth, middleware, login flow
│       ├── PHASE_3_DOCUMENTS.md       ← Upload, extract, chunk, embed, store pipeline
│       ├── PHASE_4_SEARCH.md          ← pgvector search, scoring, classification
│       ├── PHASE_5_CHAT.md            ← Claude answer generation, sessions, streaming
│       └── PHASE_6_UI.md             ← Full frontend: chat, documents, dashboard
```

## How to Use with Claude Code

### Setup

1. Create a new project directory:
   ```bash
   mkdir efilo-app && cd efilo-app
   ```

2. Copy `CLAUDE.md` into the root:
   ```bash
   cp /path/to/CLAUDE.md ./CLAUDE.md
   ```

3. Copy the `docs/` directory:
   ```bash
   cp -r /path/to/docs ./docs
   ```

4. Open Claude Code:
   ```bash
   claude
   ```

### Build Sequence

Work through the phases IN ORDER. Each phase builds on the previous one.

#### Phase 1: Scaffold (~30 min)
```
Open docs/phases/PHASE_1_SCAFFOLD.md and follow the instructions inside the prompt block to set up the project.
```

Claude Code will: set up Next.js, install all dependencies, create the Prisma schema, configure Tailwind, create the directory structure, and stub out all lib files.

**Checkpoint:** `pnpm build` succeeds, `pnpm prisma validate` passes.

#### Phase 2: Auth (~45 min)
```
Open docs/phases/PHASE_2_AUTH.md and follow the instructions to implement WorkOS authentication.
```

Claude Code will: implement WorkOS client, auth middleware, login/callback/logout routes, and dashboard layout.

**Checkpoint:** Login page renders, auth middleware blocks unauthenticated requests, dev bypass works.

**Note:** You'll need WorkOS dev credentials OR use the dev bypass mode for local development.

#### Phase 3: Documents (~1-2 hours)
```
Open docs/phases/PHASE_3_DOCUMENTS.md and follow the instructions to build the document ingestion pipeline.
```

Claude Code will: implement R2 client, text extraction (PDF/DOCX/XLSX), Claude Vision OCR, semantic chunking, OpenAI embeddings, and the Inngest document ingestion pipeline.

**Checkpoint:** Upload a PDF, watch it process through Inngest, verify chunks + embeddings in database.

**Note:** You'll need:
- Neon Postgres with pgvector enabled
- OpenAI API key (for embeddings)
- Anthropic API key (for Vision OCR)
- Inngest dev server (`npx inngest-cli dev`)
- Cloudflare R2 bucket OR local file storage for dev

#### Phase 4: Search (~1-2 hours)
```
Open docs/phases/PHASE_4_SEARCH.md and follow the instructions to implement the search backend.
```

Claude Code will: implement pgvector queries, scoring/ranking algorithm, query classification, and search API endpoints.

**Checkpoint:** POST a search query, get back ranked results with similarity scores and type weights.

#### Phase 5: Chat (~1-2 hours)
```
Open docs/phases/PHASE_5_CHAT.md and follow the instructions to implement chat with AI answer generation.
```

Claude Code will: implement Claude Sonnet answer generation with citations, session management, SSE streaming, and suggested prompts.

**Checkpoint:** Full chat conversation with cited answers, conflict detection, and follow-up suggestions.

#### Phase 6: UI (~2-3 hours)
```
Open docs/phases/PHASE_6_UI.md and follow the instructions to build the frontend.
```

Claude Code will: build the dashboard shell, document upload UI, chat interface with streaming, source badges, alert cards, and session history.

**Checkpoint:** Full end-to-end flow from login → upload → search → chat → multi-turn conversation.

### Tips for Working with Claude Code

1. **One phase at a time.** Don't try to do multiple phases in one session. Complete one, verify it works, then start the next.

2. **Copy the prompt block.** Each phase file has a prompt inside a code block. Copy that entire block and paste it into Claude Code.

3. **Reference the docs.** If Claude Code asks a question about the schema, tell it to `read docs/SCHEMA.md`. For AI patterns, `read docs/AI_SERVICE.md`. For search logic, `read docs/SEARCH.md`.

4. **Test after each phase.** Don't skip checkpoints. If Phase 3 doesn't work, Phase 4 will definitely fail.

5. **Keep sessions focused.** If a session gets too long or confused, start a new one. Claude Code can pick up from the codebase state.

6. **Use Inngest dev server.** For Phase 3+, run `npx inngest-cli dev` in a separate terminal to see and trigger background jobs.

## Required Accounts & Keys

Before starting, set up these services:

| Service | Purpose | Sign Up |
|---------|---------|---------|
| Neon | Postgres + pgvector | neon.tech |
| Anthropic | Claude AI | console.anthropic.com |
| OpenAI | Embeddings | platform.openai.com |
| WorkOS | Auth (SSO) | workos.com |
| Cloudflare | R2 storage | dash.cloudflare.com |
| Inngest | Background jobs | inngest.com |

For local development, only Neon, Anthropic, and OpenAI are strictly required. WorkOS can use dev bypass, R2 can use local disk, and Inngest has a local dev server.

## What Comes After Phase 6

Once the MVP Search & Chat is working, the next capabilities to build:
- **Capability 2: RFI Workspace** — RFI CRUD, AI draft generation, CO detection
- **Capability 3: Compliance Engine** — Contract clause extraction, deadline monitoring
- **Capability 4: Project Health** — 5-dimension scoring, WIP reports

These follow the same pattern: create a phase doc with the prompt, reference the schema and AI service, and build incrementally.
