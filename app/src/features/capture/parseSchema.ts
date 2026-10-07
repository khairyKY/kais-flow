import { z } from 'zod'

// Mirrors supabase/functions/parse-capture's ParseResultSchema — keep in sync.
export const ParseResultSchema = z.object({
  kind: z.enum(['task', 'event', 'routine_idea', 'note', 'unknown']),
  cleaned_text: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  domain_id: z.string().nullable().optional(),
  project_id: z.string().nullable().optional(),
  due_at: z.string().nullable().optional(),
  duration_min: z.number().nullable().optional(),
  priority: z.number().nullable().optional(),
  reminder_offset_min: z.number().int().min(0).nullable().optional(),
  confidence: z.number().min(0).max(1),
})

export type ParseResult = z.infer<typeof ParseResultSchema>
