export const CLAUSE_EXTRACTION_SYSTEM_PROMPT = `You are a construction contract specialist analyzing notice and claim provisions for MEP subcontractors.

Extract ALL notice/claim requirements from contracts, including:
- Notice of claims (general)
- Notice of delays
- Notice of differing/concealed conditions
- Notice of change order disputes
- Notice of defects
- Payment notice requirements
- Warranty notice requirements
- Termination notice requirements
- Any other formal notice requirements with deadlines

For EACH notice provision found, extract:
1. Clause reference (e.g., "Section 4.3.1", "Article 8.1.2")
2. Notice type classification
3. Deadline days and type (calendar or business days)
4. Method of notice (certified mail, email, written, etc.)
5. What triggers the deadline
6. Cure period if any
7. Flow-down provisions if referenced
8. Any ambiguities that need human review

CRITICAL RULES:
- ONLY extract actual contract language, never infer or assume provisions
- If deadline is "prompt", "promptly", or "immediately", set deadlineDays to 2
- If deadline is "reasonable" without a number, set deadlineDays to 7 and mark requiresReview: true
- If notice method is unspecified, set noticeMethod to "WRITTEN_NOTICE" and mark requiresReview: true
- If any provision is ambiguous, mark requiresReview: true and include a reviewReason explaining EXACTLY what the PM needs to verify (e.g., "Clause says 'immediately' but deadline set to 2 days — confirm if 2 days is acceptable" or "Notice method not specified — verify if email is sufficient")
- Extract the FULL relevant clause text into the content field`;

export function buildExtractionPrompt(
  contractText: string,
  contractType: string
): string {
  return `CONTRACT TYPE: ${contractType}

CONTRACT TEXT:
${contractText}

Extract all notice/claim provisions and return ONLY valid JSON (no markdown fences, no commentary):
{
  "clauses": [
    {
      "sectionRef": "Section 4.3.1",
      "title": "Notice of Claim",
      "content": "The full extracted clause text...",
      "kind": "CLAIMS_PROCEDURE",
      "deadlineDays": 21,
      "deadlineType": "CALENDAR_DAYS",
      "noticeMethod": "CERTIFIED_MAIL",
      "trigger": "Upon discovery of event giving rise to claim",
      "curePeriodDays": null,
      "curePeriodType": null,
      "flowDownProvisions": null,
      "parentClauseRef": null,
      "requiresReview": false,
      "reviewReason": null,
      "notes": "Standard AIA claim notice language"
    }
  ],
  "ambiguities": [
    {
      "sectionRef": "Section 7.2",
      "issue": "Deadline says 'reasonable time' without specifying days",
      "recommendation": "Clarify with GC - suggest 7 calendar days"
    }
  ],
  "contractTypeSummary": "Brief summary of the contract type and key notice patterns"
}

Valid "kind" values: NOTICE_REQUIREMENTS, CLAIMS_PROCEDURE, CHANGE_ORDER_PROCESS, DISPUTE_RESOLUTION, TERMINATION, WARRANTY, INDEMNIFICATION, PAYMENT_TERMS, RETENTION, FORCE_MAJEURE, SCHEDULE, SAFETY
Valid "deadlineType" values: CALENDAR_DAYS, BUSINESS_DAYS, HOURS
Valid "noticeMethod" values: WRITTEN_NOTICE, CERTIFIED_MAIL, EMAIL, HAND_DELIVERY, REGISTERED_MAIL`;
}

// ── Notice Letter Generation ──────────────────────────────────────────────

export const NOTICE_LETTER_SYSTEM_PROMPT = `You are a construction contract compliance specialist drafting formal notice letters for MEP subcontractors.

Generate professional, legally precise notice letters that:
- Reference specific contract clause sections
- State the triggering event clearly and factually
- Preserve the sender's rights under the contract
- Use formal business letter tone (not overly aggressive)
- Include all required elements per the contract's notice provisions
- End with a reservation of rights statement

Format the letter as plain text with clear sections. Use [BRACKETS] for any information the user needs to fill in. Do NOT use markdown formatting — output clean letter text only.`;

export interface NoticeLetterContext {
  sectionRef: string | null;
  clauseKind: string;
  clauseTitle: string;
  deadlineDays: number;
  deadlineType: string;
  trigger: string | null;
  noticeMethod: string | null;
  triggerEventType: string;
  triggerDescription: string;
  eventDate: string;
  projectName: string;
  orgName: string;
  recipientName: string;
  recipientEmail?: string;
}

export function buildNoticeLetterPrompt(ctx: NoticeLetterContext): string {
  return `Generate a formal compliance notice letter with these details:

CONTRACT CLAUSE: ${ctx.sectionRef || "N/A"} — ${ctx.clauseTitle}
CLAUSE TYPE: ${ctx.clauseKind}
DEADLINE: ${ctx.deadlineDays} ${ctx.deadlineType.replace("_", " ").toLowerCase()}
TRIGGER: ${ctx.trigger || "As specified in the contract"}
REQUIRED METHOD: ${ctx.noticeMethod?.replace("_", " ") || "Written notice"}

TRIGGERING EVENT:
- Type: ${ctx.triggerEventType.replace("_", " ")}
- Description: ${ctx.triggerDescription}
- Date of event: ${ctx.eventDate}

PROJECT: ${ctx.projectName}
FROM (Subcontractor): ${ctx.orgName}
TO (Recipient): ${ctx.recipientName}

Generate a complete formal notice letter. Include:
1. Date and recipient address block (use [BRACKETS] for unknown addresses)
2. RE: line referencing the project and contract
3. Statement identifying the notice provision (cite the section)
4. Description of the triggering event
5. Statement of intent / claim preservation
6. Request for response or acknowledgment if applicable
7. Reservation of rights paragraph
8. Professional closing with signature block using [BRACKETS] for name/title`;
}
