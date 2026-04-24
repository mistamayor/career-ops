/**
 * Top-level sync for a single (report, cvMarkdown, pdf) triple.
 *
 * Contract: parse all three artefacts. If report parsing fails, abort with
 * no writes. If cv-markdown parsing fails, warn and continue with the
 * application upsert alone. If cv_version upsert fails, warn and still
 * upsert the application with cv_version=null (so the web UI at least
 * shows the evaluation).
 */

import { ClientResponseError } from "pocketbase";

import type {
  ApplicationsResponse,
  CvVersionsResponse,
  TypedPocketBase,
} from "@/lib/pb-types";

function describeError(e: unknown): string {
  if (e instanceof ClientResponseError) {
    const data =
      e.data && Object.keys(e.data).length > 0
        ? ` data=${JSON.stringify(e.data)}`
        : "";
    return `${e.status} ${e.message}${data}`;
  }
  return describeError(e);
}

import { parseReport } from "./parse-report";
import { parseTailoredCv } from "./parse-tailored-cv";
import type { ParseResult } from "./types";
import { upsertApplication, type UpsertResult } from "./upsert-application";
import { upsertCvVersion } from "./upsert-cv-version";

export type SyncOneInput = {
  reportFilename: string;
  reportContent: string;
  cvMarkdownFilename: string | null;
  cvMarkdownContent: string | null;
  pdfPath: string | null;
  /** Id of the `mayor-classic` cv_template (or whatever's current default). */
  defaultTemplateId: string;
};

export type SyncOneResult = {
  reportFilename: string;
  application: UpsertResult<ApplicationsResponse> | null;
  cvVersion: UpsertResult<CvVersionsResponse> | null;
  errors: string[];
};

/**
 * Run one (report, cvMarkdown, pdf) triple end-to-end. Returns a result
 * with the per-artefact upsert outcomes and a `errors` list for anything
 * that went sideways.
 */
export async function syncOne(
  pb: TypedPocketBase,
  input: SyncOneInput,
): Promise<SyncOneResult> {
  const errors: string[] = [];

  const reportResult = parseReport(input.reportFilename, input.reportContent);
  if (!reportResult.ok) {
    errors.push(
      `[${input.reportFilename}] report parse failed: ${reportResult.error.reason}`,
    );
    return {
      reportFilename: input.reportFilename,
      application: null,
      cvVersion: null,
      errors,
    };
  }

  // Parse the CV markdown if provided.
  let cvParsed: ParseResult<ReturnType<typeof parseTailoredCv>["value" & keyof unknown]> | null =
    null;
  let cvVersionUpsert: UpsertResult<CvVersionsResponse> | null = null;
  if (input.cvMarkdownFilename && input.cvMarkdownContent !== null) {
    const parsed = parseTailoredCv(
      input.cvMarkdownFilename,
      input.cvMarkdownContent,
    );
    if (!parsed.ok) {
      errors.push(
        `[${input.cvMarkdownFilename}] cv parse failed: ${parsed.error.reason}`,
      );
    } else {
      try {
        cvVersionUpsert = await upsertCvVersion(
          pb,
          parsed.value,
          input.pdfPath,
          input.defaultTemplateId,
        );
      } catch (e) {
        errors.push(
          `[${input.cvMarkdownFilename}] cv_version upsert failed: ${
            describeError(e)
          }`,
        );
      }
    }
    cvParsed = parsed as unknown as typeof cvParsed;
  }

  // Upsert application regardless of cv_version outcome. If the cv_version
  // succeeded, point the application at it; otherwise leave null.
  let appUpsert: UpsertResult<ApplicationsResponse>;
  try {
    appUpsert = await upsertApplication(
      pb,
      reportResult.value,
      cvVersionUpsert?.record.id ?? null,
      input.reportFilename,
    );
  } catch (e) {
    errors.push(
      `[${input.reportFilename}] application upsert failed: ${
        describeError(e)
      }`,
    );
    return {
      reportFilename: input.reportFilename,
      application: null,
      cvVersion: cvVersionUpsert,
      errors,
    };
  }

  // `cvParsed` is only referenced for type narrowing / future logging hooks.
  void cvParsed;

  return {
    reportFilename: input.reportFilename,
    application: appUpsert,
    cvVersion: cvVersionUpsert,
    errors,
  };
}
