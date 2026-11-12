import { z } from 'zod';

export const listCommentaryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const optionalNonnegativeIntegerSchema = z.union([
  z.number(),
  z.string().trim().min(1).refine(
    (value) => Number.isFinite(Number(value)),
    { message: 'Must be a numeric string' },
  ),
]).pipe(z.coerce.number().int().nonnegative()).optional();

export const createCommentarySchema = z.object({
  minute: optionalNonnegativeIntegerSchema,
  sequence: optionalNonnegativeIntegerSchema,
  period: z.string().min(1).optional(),
  eventType: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  team: z.string().min(1).optional(),
  message: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});
