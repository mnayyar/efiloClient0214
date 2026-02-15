# Phase 6: Search & Chat UI

## Goal
Build the complete frontend for Universal Search & Chat. After this phase, users can upload documents, search with natural language, see cited answers, click sources, and have multi-turn conversations — all with the efilo Construction Orange brand.

## Prompt for Claude Code

```
Build the Universal Search & Chat frontend for efilo.ai. Read CLAUDE.md for design tokens and component conventions. Use shadcn/ui components, Tailwind CSS, DM Sans + JetBrains Mono typography, and the Construction Orange (#C67F17) brand color.

### Step 1: Dashboard Shell (`src/app/(dashboard)/layout.tsx`)

Build the authenticated app shell with:

**Sidebar (280px, collapsible to 80px):**
- efilo.ai logo at top
- Navigation items with Lucide icons:
  - Projects (FolderOpen)
  - Search (Search) — links to active project search
  - Enterprise (BarChart3) — portfolio dashboard
  - Settings (Settings)
- Active item has orange left border indicator (#C67F17)
- User avatar + name at bottom with logout dropdown
- Collapse button

**Header:**
- Breadcrumbs: Organization > Project Name > Current Page
- Project selector dropdown (if multiple projects)
- Notification bell with unread count badge

Use shadcn Sheet for mobile sidebar, standard div for desktop.

### Step 2: Project Dashboard (`src/app/(dashboard)/projects/[projectId]/page.tsx`)

Simple project overview page with:
- Project name, code, type, contract value
- Quick stats: Documents count, RFIs count, Health score
- Quick action cards: "Search Documents", "Create RFI", "Upload Document"
- Recent activity feed (last 5 actions from AuditLog)

### Step 3: Document Upload UI (`src/components/documents/upload-dialog.tsx`)

Create a document upload dialog:
- Drag-and-drop zone (react-dropzone or native drag events)
- File type selector (dropdown: Spec, Drawing, Addendum, RFI, Contract, etc.)
- File validation: check MIME type, max size per type
- Upload progress bar
- Flow:
  1. User drops file + selects type
  2. Client calls POST /api/projects/{id}/documents to get presigned URL
  3. Client uploads directly to R2 via presigned URL (show progress)
  4. Client calls POST /api/projects/{id}/documents/{docId}/confirm
  5. Show "Processing..." status with spinner
  6. Poll document status until READY

### Step 4: Document List (`src/components/documents/document-list.tsx`)

List view of project documents:
- Table with columns: Name, Type (badge), Status (badge), Pages, Size, Uploaded, Actions
- Type badges with colors per Cap1 spec section 7.3:
  - SPEC → Blue, DRAWING → Purple, ADDENDUM → Orange, CONTRACT → Navy, etc.
- Status badges: UPLOADING (gray), PROCESSING (amber spinner), READY (green), ERROR (red)
- Actions: Download, Delete
- Filter bar: by document type
- Sort: by name, date, type

### Step 5: Chat Interface (`src/app/(dashboard)/projects/[projectId]/search/page.tsx`)

This is the core UI. Build it as a full-page chat interface:

**Layout:**
- Left panel (optional, 300px): Session history list
- Main panel: Chat messages + input

**Chat Messages Area (`src/components/search/chat-messages.tsx`):**
- Scrollable message list
- User messages: right-aligned, simple text bubble, timestamp
- Assistant messages: left-aligned, light background, containing:
  - Markdown-rendered answer (use react-markdown or similar)
  - Source citation badges (clickable)
  - Confidence score (subtle text)
  - Alert badges (conflicts, version mismatches) — amber/red cards with action buttons
  - Suggested prompt pills at bottom

**Message Input (`src/components/search/chat-input.tsx`):**
- Textarea (auto-resize) with send button
- Send on Enter (Shift+Enter for newline)
- Scope toggle: "This Project" / "All Projects" (badge toggle)
- Document type filter chips (optional, collapsible)
- Disabled state while response is streaming

### Step 6: Source Citation Badges (`src/components/search/source-badge.tsx`)

```typescript
interface SourceBadgeProps {
  label: string;        // "Project Manual, p. 47, §07 84 00.2"
  type: DocumentType;   // SPEC, DRAWING, etc.
  documentId: string;
  pageNumber?: number;
  onClick: () => void;  // Navigate to document
}
```

Color mapping per document type:
- SPEC: bg-blue-100 text-blue-800 border-blue-200
- DRAWING: bg-purple-100 text-purple-800 border-purple-200
- ADDENDUM: bg-orange-100 text-orange-800 border-orange-200
- RFI: bg-amber-100 text-amber-800 border-amber-200
- CONTRACT: bg-indigo-100 text-indigo-800 border-indigo-200
- CHANGE: bg-red-100 text-red-800 border-red-200
- COMPLIANCE: bg-green-100 text-green-800 border-green-200
- MEETING: bg-slate-100 text-slate-800 border-slate-200
- FINANCIAL: bg-emerald-100 text-emerald-800 border-emerald-200

Each badge shows: [Icon] Type: Label
Clicking opens document (future: highlights relevant section)

### Step 7: Alert Cards (`src/components/search/alert-card.tsx`)

For conflicts, version mismatches, and missing info:

**Conflict Alert:**
- Red/amber border, warning icon
- "CONFLICT DETECTED" header
- Description of contradiction
- Action buttons: [Create RFI] [View Drawing] [View Spec] [Dismiss]

**Version Mismatch:**
- Amber border, refresh icon
- "DOCUMENT UPDATED" header
- Change summary
- Action buttons: [View Comparison] [Re-search] [Dismiss]

### Step 8: Suggested Prompt Pills (`src/components/search/prompt-pill.tsx`)

Horizontal scroll row of clickable prompt suggestions:
- Each pill: icon + short question text
- Category-based icon (financial → DollarSign, conflict → AlertTriangle, etc.)
- Click fills the chat input and auto-sends
- Appears after each assistant message AND in empty state

### Step 9: Empty State (`src/components/search/empty-state.tsx`)

When no messages in session:
- Centered layout
- "Explore your project documents" heading
- 6 suggested prompt cards (from GET /api/projects/{id}/search/suggestions)
- Each card: icon, question text, "Searches: Type1, Type2" subtitle
- Click triggers search

### Step 10: Session History Sidebar (`src/components/search/session-list.tsx`)

Left panel showing past chat sessions:
- List of sessions with: title, project name, message count, last updated
- Click to load session
- "New Chat" button at top
- Archive button on each session

### Step 11: Streaming Integration

Use EventSource or fetch with ReadableStream to handle SSE responses:

```typescript
// hooks/use-chat.ts
export function useChat(projectId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  async function sendMessage(query: string, sessionId?: string) {
    setIsLoading(true);
    
    // Add user message immediately (optimistic)
    setMessages(prev => [...prev, { role: "user", content: query }]);
    
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ query, sessionId, projectId }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const text = decoder.decode(value);
      const events = text.split("\n\n").filter(Boolean);
      
      for (const event of events) {
        const data = JSON.parse(event.replace("data: ", ""));
        
        switch (data.type) {
          case "status":
            setStatus(data.message);
            break;
          case "sources":
            // Show sources as they're found
            break;
          case "answer":
            setMessages(prev => [...prev, {
              role: "assistant",
              content: data.data.response,
              sources: data.data.sources,
              confidence: data.data.confidence,
              alerts: data.data.alerts,
              suggestedPrompts: data.data.suggestedPrompts,
            }]);
            break;
          case "done":
            setIsLoading(false);
            setStatus("");
            break;
        }
      }
    }
  }

  return { messages, sendMessage, isLoading, status };
}
```

### Step 12: React Query Setup

Configure TanStack React Query for server state:

```typescript
// providers/query-provider.tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
});

// Use React Query for: sessions list, document list, project data, suggestions
// Use the useChat hook (Step 11) for chat messages (SSE streaming)
```

### Step 13: Verify

Full E2E flow:
1. Login → Dashboard → Select Project
2. Upload a PDF document → see it processing → see READY status
3. Navigate to Search page → see empty state with suggestions
4. Click a suggestion OR type a query
5. See streaming status ("Classifying...", "Searching...", "Generating...")
6. See answer with source badges, scope indicator, confidence
7. Click a source badge → navigates to document
8. See suggested follow-up prompts → click one → new response
9. Navigate away and back → session persists in sidebar
10. Start new chat → fresh session

Visual verification:
- Construction Orange (#C67F17) primary buttons and active states
- Warm Off-White (#FAFAF8) background
- DM Sans body text, proper heading hierarchy
- Document type badges have correct colors
- Responsive: works on desktop (1024px+) and tablet (768px)
```

## Success Criteria
- [ ] Dashboard shell with sidebar, header, breadcrumbs
- [ ] Document upload with drag-and-drop and progress
- [ ] Document list with type/status badges
- [ ] Chat interface with streaming responses
- [ ] Source citation badges with correct colors per type
- [ ] Alert cards for conflicts and version mismatches
- [ ] Suggested prompt pills after each response
- [ ] Empty state with contextual suggestions
- [ ] Session history sidebar
- [ ] Responsive layout (desktop + tablet)
- [ ] efilo brand applied throughout (orange, DM Sans, warm palette)
