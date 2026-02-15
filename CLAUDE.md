# CLAUDE.md — efilo.ai

## What is this project?

efilo.ai is a compliance-first intelligence layer for mid-market MEP (mechanical, electrical, plumbing) construction contractors ($5M-$100M revenue). It monitors contract compliance deadlines, protects claims rights, and provides unified project visibility.

**Tagline:** "Your Projects. Finally Connected."

## Architecture: Single-Tenant, Multi-Instance

Each customer gets a fully isolated deployment. There is NO shared database, NO shared file storage, and NO shared vector index between customers. This means:

- No `organizationId` or `tenantId` columns on any model
- No row-level security or tenant filtering
- One `Organization` record per database (the customer identity)
- Cross-project search = querying across projects in the SAME dedicated database

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 14+ (App Router) | React Server Components, streaming SSR |
| Language | TypeScript 5+ (strict mode) | Path aliases: `@/` → `src/` |
| Styling | Tailwind CSS | Custom efilo design tokens |
| UI Components | shadcn/ui + Radix primitives | Custom component library |
| Database | Neon Postgres + pgvector | Relational data + vector embeddings in ONE database |
| ORM | Prisma v5+ | Standard client; pgvector via raw SQL for vector ops |
| File Storage | Cloudflare R2 | S3-compatible; presigned URL uploads |
| Auth | WorkOS | Enterprise SSO (SAML/OIDC), SCIM directory sync |
| AI — Reasoning | Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) | All analysis, drafting, search synthesis |
| AI — Complex | Claude Opus 4.5 (`claude-opus-4-5-20250620`) | Contract clause extraction only |
| AI — Vision/OCR | Claude Vision (Sonnet) | Scanned PDFs, photos, handwritten notes |
| AI — Embeddings | OpenAI `text-embedding-3-large` (1536d) | Document + query vectors; stored in pgvector |
| Background Jobs | Inngest | Event-driven, step functions, cron, per-step retry |
| State Management | Zustand + React Query (TanStack) | Server state caching, optimistic updates |
| Real-time | Server-Sent Events (SSE) | Agent progress streaming, notifications |
| Email | SendGrid | Transactional emails, notification digests |
| Logging | Axiom | Structured logging, customer-tagged |
| Errors | Sentry | Error capture, performance monitoring |
| Package Manager | pnpm | Strict dependency resolution |
| Testing | Vitest (unit) + Playwright (E2E) | |

## Key Design Decisions

### Why pgvector instead of Qdrant
Each customer has a dedicated Neon database. pgvector adds vector search directly inside that database. Document chunks, metadata, and embeddings live in the same DB — enabling single-query JOINs between vector search results and relational data. A typical contractor's document library produces 10K-100K chunks, well within pgvector's performance sweet spot.

### Why WorkOS instead of Clerk
Target customers mandate SSO via Azure Entra or Okta. WorkOS handles SAML/OIDC per customer, provides SCIM directory sync, and includes an Admin Portal.

### Why Cloudflare R2 instead of S3
Zero egress fees (construction drawings can be 100+ MB), S3-compatible API, 35% cheaper storage, each customer gets their own bucket.

### AI Vendor Strategy
Anthropic (Claude) handles ALL reasoning, analysis, and vision/OCR. OpenAI provides embeddings ONLY. Clean separation: Claude understands documents; OpenAI converts text to vectors.

## Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth routes (login, callback, logout)
│   ├── (dashboard)/              # Authenticated app shell
│   │   ├── projects/
│   │   │   └── [projectId]/
│   │   │       ├── search/       # Universal Search & Chat (Cap 1)
│   │   │       ├── rfis/         # RFI Workspace (Cap 2)
│   │   │       ├── compliance/   # Compliance Engine (Cap 3)
│   │   │       ├── health/       # Project Health (Cap 4)
│   │   │       ├── changes/      # Change Intelligence (Cap 5)
│   │   │       ├── meetings/     # Meeting & Workflow (Cap 6)
│   │   │       └── closeout/     # Closeout & Retention (Cap 8)
│   │   ├── enterprise/           # Enterprise Intelligence (Cap 7)
│   │   └── settings/
│   ├── api/                      # API routes
│   │   ├── auth/
│   │   ├── chat/
│   │   ├── projects/
│   │   ├── search/
│   │   ├── enterprise/
│   │   └── inngest/              # Inngest webhook endpoint
│   └── layout.tsx
├── components/
│   ├── ui/                       # shadcn/ui base components
│   ├── search/                   # Search & Chat components
│   ├── documents/                # Document upload, viewer
│   ├── rfis/                     # RFI components
│   └── layout/                   # Shell, sidebar, header
├── lib/
│   ├── db.ts                     # Prisma client singleton
│   ├── ai.ts                     # Claude AI service (shared)
│   ├── embeddings.ts             # OpenAI embedding service
│   ├── vector-search.ts          # pgvector query functions
│   ├── r2.ts                     # Cloudflare R2 client
│   ├── workos.ts                 # WorkOS client
│   ├── inngest.ts                # Inngest client
│   └── utils.ts                  # Shared utilities
├── services/
│   ├── document-processing.ts    # Text extraction, chunking
│   ├── vision.ts                 # Claude Vision OCR
│   ├── search.ts                 # Search orchestration (classify → embed → query → rank → generate)
│   ├── notifications.ts          # Notification service
│   └── audit.ts                  # Audit logging
├── inngest/
│   └── functions/
│       ├── document-ingestion.ts
│       ├── compliance-check.ts
│       ├── rfi-aging.ts
│       ├── health-score.ts
│       └── notifications.ts
├── middleware.ts                  # WorkOS auth middleware
└── types/
    └── index.ts                  # Shared TypeScript types
```

## Coding Conventions

### General
- Use `async/await` everywhere, never `.then()` chains
- All API routes return `{ data: T }` on success, `{ error: string, details?: any }` on failure
- Use Zod for all input validation on API routes
- Log all AI calls to Axiom: `{ model, tokensUsed, latencyMs, entityType, entityId, projectId }`
- Use `cuid()` for all IDs (via Prisma `@default(cuid())`)

### Database
- Prisma for all relational operations
- Raw SQL (via `prisma.$queryRaw`) for pgvector operations only
- Never use `organizationId` scoping — single-tenant means every query hits the right DB
- Always include `createdAt` and `updatedAt` on models

### API Routes
- All routes behind WorkOS auth middleware (except `/api/auth/*` and `/api/inngest`)
- In-memory rate limiting: 100 req/hour per user (general), 10 req/min (search/chat)
- Standard error handler with Prisma error code mapping (P2025 → 404, P2002 → 409)

### AI Calls
- All Claude calls go through `lib/ai.ts` shared service
- All embedding calls go through `lib/embeddings.ts`
- Token budgets enforced per call type (see docs/ai-budgets.md)
- Never send entire documents to Claude — always chunk first

### Components
- shadcn/ui as base, customized with efilo design tokens
- Construction Orange (#C67F17) is the primary action color
- DM Sans for UI text, JetBrains Mono for data/code
- Responsive: Desktop 1024px+, Tablet 768-1024px, Mobile <768px

## Brand Colors

| Name | Hex | Usage |
|------|-----|-------|
| Construction Orange | #C67F17 | Primary action, highlights, brand |
| Warm Off-White | #FAFAF8 | Background |
| Primary Text | #1C1917 | Dark brown-black |
| Secondary Text | #57534E | Warm gray |
| Card Border | #E8E5DE | Warm beige |
| Success | #0F8A5F | Forest green |
| Warning | #C67F17 | Construction orange |
| Critical | #DC2626 | Red |
| Info | #2563EB | Blue |

## Environment Variables

```env
# Database (Dedicated Neon + pgvector)
DATABASE_URL=postgresql://user:pass@{customer}.pg.neon.tech/efilo?sslmode=require

# Auth (WorkOS)
WORKOS_API_KEY=sk_live_...
WORKOS_CLIENT_ID=client_...
WORKOS_WEBHOOK_SECRET=whsec_...
WORKOS_REDIRECT_URI=https://{customer}.efilo.ai/api/auth/callback/workos

# AI — Anthropic (Reasoning + Vision/OCR)
ANTHROPIC_API_KEY=sk-ant-...

# AI — OpenAI (Embeddings only)
OPENAI_API_KEY=sk-...

# File Storage (Dedicated R2 Bucket)
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=efilo-{customerSlug}-prod
R2_PUBLIC_URL=https://efilo-{customerSlug}-prod.r2.dev

# Background Jobs (Dedicated Inngest Env)
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# Monitoring
AXIOM_DATASET=efilo-{customerSlug}
AXIOM_API_TOKEN=xat_...
SENTRY_AUTH_TOKEN=sntrys_...
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...

# Email
SENDGRID_API_KEY=SG.xxx...
SENDGRID_FROM_EMAIL=noreply@efilo.ai

# App
ENVIRONMENT=production
NEXT_PUBLIC_APP_URL=https://{customerSlug}.efilo.ai
```

## Current Build Phase

We are building **Release 1: MVP (Capabilities 1-4)**. See `docs/phases/` for step-by-step implementation prompts.

## Reference Docs

- `docs/SCHEMA.md` — Complete Prisma schema
- `docs/AI_SERVICE.md` — AI service patterns and token budgets
- `docs/SEARCH.md` — Search scoring, retrieval, and ranking logic
- `docs/phases/` — Phase-by-phase build prompts
