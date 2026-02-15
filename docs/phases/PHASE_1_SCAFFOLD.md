# Phase 1: Project Scaffold

## Goal
Set up the Next.js 14 project with all dependencies, Prisma schema, project structure, and development tooling. No features yet — just a solid foundation.

## Prompt for Claude Code

```
Set up a new Next.js 14 project for efilo.ai using the App Router. Follow the architecture in CLAUDE.md exactly.

### Step 1: Initialize Project

- Use `pnpm create next-app@latest efilo-app --typescript --tailwind --eslint --app --src-dir`
- Add path alias `@/` → `src/` in tsconfig.json
- Set TypeScript strict mode

### Step 2: Install Dependencies

Core:
- prisma @prisma/client (ORM)
- @anthropic-ai/sdk (Claude AI)
- openai (embeddings only)
- @workos-inc/node (auth)
- @aws-sdk/client-s3 @aws-sdk/s3-request-presigner (R2 via S3 API)
- inngest (background jobs)
- zod (validation)
- zustand @tanstack/react-query (state management)

UI:
- Install shadcn/ui: `pnpm dlx shadcn@latest init`
- Add components: button, input, card, dialog, dropdown-menu, badge, separator, scroll-area, skeleton, toast, avatar, sheet, tabs, tooltip
- lucide-react (icons)
- class-variance-authority, clsx, tailwind-merge (shadcn deps)

Document processing:
- pdf-parse (PDF text extraction)
- mammoth (DOCX to text)
- xlsx (spreadsheet parsing)
- sharp (image processing)

Dev:
- vitest @testing-library/react (unit tests)
- prettier prettier-plugin-tailwindcss

### Step 3: Configure Tailwind

Update tailwind.config.ts with efilo design tokens:

```typescript
// Brand colors
colors: {
  brand: {
    orange: '#C67F17',
    'off-white': '#FAFAF8',
  },
  text: {
    primary: '#1C1917',
    secondary: '#57534E',
  },
  border: {
    card: '#E8E5DE',
  },
  status: {
    success: '#0F8A5F',
    warning: '#C67F17',
    critical: '#DC2626',
    info: '#2563EB',
  },
}
```

Add DM Sans and JetBrains Mono via next/font.

### Step 4: Create Project Structure

Create the directory structure from CLAUDE.md:
- src/app/(auth)/ — login, callback, logout pages
- src/app/(dashboard)/ — authenticated layout with sidebar
- src/app/(dashboard)/projects/[projectId]/ — project pages
- src/app/api/ — API routes
- src/components/ui/ — shadcn components (already done)
- src/components/layout/ — Shell, Sidebar, Header
- src/lib/ — db.ts, ai.ts, embeddings.ts, vector-search.ts, r2.ts, workos.ts, inngest.ts, utils.ts
- src/services/ — document-processing.ts, vision.ts, search.ts, notifications.ts, audit.ts
- src/inngest/functions/ — background job functions
- src/middleware.ts — auth middleware (placeholder)
- src/types/index.ts — shared types

### Step 5: Set Up Prisma

- Run `pnpm prisma init`
- Copy the COMPLETE schema from docs/SCHEMA.md into prisma/schema.prisma
- Create a raw SQL migration file at prisma/migrations/add_pgvector.sql with the pgvector setup commands from docs/SCHEMA.md
- Create lib/db.ts with Prisma client singleton:

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### Step 6: Create .env.example

Copy the env vars from CLAUDE.md into .env.example with placeholder values. Create .env.local with the same structure.

### Step 7: Create lib stubs

Create each lib file with the correct imports and exported function signatures but minimal implementation (just enough to compile). We'll implement them in later phases.

- lib/ai.ts — export generateResponse() per docs/AI_SERVICE.md
- lib/embeddings.ts — export generateEmbedding(), generateEmbeddings() per docs/AI_SERVICE.md
- lib/vector-search.ts — export vectorSearch() per docs/SEARCH.md
- lib/r2.ts — export uploadToR2(), getPresignedUploadUrl(), getPresignedDownloadUrl()
- lib/workos.ts — export workos client, getSession(), getUser()
- lib/inngest.ts — export inngest client
- lib/utils.ts — export cn() (clsx + twMerge)

### Step 8: Verify

- Run `pnpm build` — should compile with no errors
- Run `pnpm lint` — should pass
- Verify prisma schema validates: `pnpm prisma validate`

DO NOT implement any features yet. This phase is purely about getting the project skeleton right so subsequent phases can build on a clean foundation.
```

## Success Criteria
- [ ] `pnpm build` succeeds
- [ ] `pnpm prisma validate` succeeds
- [ ] All lib files export correct function signatures
- [ ] Directory structure matches CLAUDE.md
- [ ] Tailwind config has efilo design tokens
- [ ] shadcn/ui components installed
