import { z } from 'zod';

export const MATCH_STATUS = {
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  FINISHED: 'finished',
};

export const listMatchesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const matchIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const isIsoDate = (val) => !Number.isNaN(Date.parse(val));

export const createMatchSchema = z
  .object({
    sport: z.string().min(1),
    homeTeam: z.string().min(1),
    awayTeam: z.string().min(1),
    startTime: z.string().refine(isIsoDate, { message: 'Must be a valid ISO date string' }),
    endTime: z.string().refine(isIsoDate, { message: 'Must be a valid ISO date string' }),
    homeScore: z.coerce.number().int().nonnegative().optional(),
    awayScore: z.coerce.number().int().nonnegative().optional(),
  })
  .check((ctx) => {
    const { startTime, endTime } = ctx.value;
    if (isIsoDate(startTime) && isIsoDate(endTime) && Date.parse(endTime) <= Date.parse(startTime)) {
      ctx.issues.push({
        code: 'custom',
        path: ['endTime'],
        message: 'endTime must be after startTime',
        input: endTime,
      });
    }
  });

export const updateScoreSchema = z.object({
  homeScore: z.coerce.number().int().nonnegative(),
  awayScore: z.coerce.number().int().nonnegative(),
});
