// Audit logging service
// Implemented in later phases

export async function logAuditEvent(_params: {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  projectId?: string;
  details?: Record<string, unknown>;
  aiGenerated?: boolean;
  aiModel?: string;
  tokensUsed?: number;
}) {
  // TODO: Write to AuditLog table + Axiom
  throw new Error("Not implemented");
}
