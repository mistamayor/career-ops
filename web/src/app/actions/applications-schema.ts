/**
 * Shared zod schema for the New-Application form.
 *
 * Lives in its own file (NOT `applications.ts`, which carries
 * `"use server"`) because Next.js requires every export of a server-action
 * module to be an async function. The same schema is used by the client
 * form (via zodResolver) and the server action (for defensive re-validation).
 */

import { z } from "zod";

export const applicationCreateSchema = z.object({
  company: z.string().min(1, "Required").max(200),
  role: z.string().min(1, "Required").max(200),
  jd_url: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  jd_text: z.string().optional(),
  jd_source: z
    .enum(["manual", "career-ops-scan", "paste"])
    .default("manual"),
  status: z
    .enum([
      "discovered",
      "evaluated",
      "applied",
      "interview",
      "offer",
      "rejected",
      "withdrawn",
    ])
    .default("discovered"),
});

export type ApplicationCreateInput = z.infer<typeof applicationCreateSchema>;
