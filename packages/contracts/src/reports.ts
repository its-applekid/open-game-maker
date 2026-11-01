import { z } from 'zod';

import { Id } from './api.js';

export const ReportFrame = z.object({
  file: z.string().max(300),
  line: z.number().int(),
  col: z.number().int().optional(),
  fn: z.string().max(120).optional(),
});
export const ReportError = z.object({
  type: z.string().max(80),
  message: z.string().max(1000),
  frames: z.array(ReportFrame).max(50),
});
export const CreateReport = z.object({
  gameId: Id,
  releaseId: Id.optional(),
  buildHash: z.string().regex(/^[0-9a-f]{64}$/),
  text: z.string().max(2000).optional(),
  error: ReportError.optional(),
  bundleKey: z.string().max(200).optional(),
});
export const ReportRoute = z.enum(['game_repair', 'platform', 'editor_hint', 'stored']);
export const CreateReportResponse = z.object({
  reportId: Id,
  signature: z.string().length(64),
  route: ReportRoute,
  jobId: Id.optional(),
});
export interface IssueWriter {
  file(input: { title: string; body: string; labels: string[] }): Promise<{ ref: string }>;
} // never carries agent:todo

export type ReportFrame = z.infer<typeof ReportFrame>;
export type ReportError = z.infer<typeof ReportError>;
export type CreateReport = z.infer<typeof CreateReport>;
export type ReportRoute = z.infer<typeof ReportRoute>;
export type CreateReportResponse = z.infer<typeof CreateReportResponse>;

export const reportsSchemas = {
  'reports.create.request.v1': CreateReport,
  'reports.create.response.v1': CreateReportResponse,
} satisfies Record<string, z.ZodType>;
