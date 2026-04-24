import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeFakePb } from "./fake-pb";
import type { FakePbHandle } from "./fake-pb";
import { syncOne } from "./sync-one";

const REPORT_FIXTURE = readFileSync(
  join(__dirname, "__fixtures__", "report-001-globaldata.md"),
  "utf8",
);
const CV_FIXTURE = readFileSync(
  join(__dirname, "__fixtures__", "cv-mayowa-adeogun-globaldata.md"),
  "utf8",
);

const TEMPLATE_ID = "tpl_mayor_classic";

let fake: FakePbHandle;

beforeEach(() => {
  fake = makeFakePb();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("syncOne: happy path (report + cv + pdf)", () => {
  it("creates application + cv_version on first run, SKIPs on second", async () => {
    const input = {
      reportFilename: "001-globaldata-2026-04-23.md",
      reportContent: REPORT_FIXTURE,
      cvMarkdownFilename: "cv-mayowa-adeogun-globaldata-2026-04-24.md",
      cvMarkdownContent: CV_FIXTURE,
      pdfPath: null, // binary upload is covered by upsert-cv-version tests
      defaultTemplateId: TEMPLATE_ID,
    };

    const first = await syncOne(fake.pb, input);
    expect(first.errors).toEqual([]);
    expect(first.cvVersion?.action).toBe("created");
    expect(first.application?.action).toBe("created");
    expect(fake.state.applications).toHaveLength(1);
    expect(fake.state.cv_versions).toHaveLength(1);
    expect(fake.state.events).toHaveLength(1);

    const app = fake.state.applications[0];
    const cv = fake.state.cv_versions[0];
    expect(app.cv_version).toBe(cv.id);

    const second = await syncOne(fake.pb, input);
    expect(second.errors).toEqual([]);
    expect(second.cvVersion?.action).toBe("skipped");
    expect(second.application?.action).toBe("skipped");
    expect(fake.state.events).toHaveLength(1); // no second event
  });
});

describe("syncOne: partial inputs", () => {
  it("processes application-only when cvMarkdown is absent", async () => {
    const result = await syncOne(fake.pb, {
      reportFilename: "001-globaldata-2026-04-23.md",
      reportContent: REPORT_FIXTURE,
      cvMarkdownFilename: null,
      cvMarkdownContent: null,
      pdfPath: null,
      defaultTemplateId: TEMPLATE_ID,
    });
    expect(result.errors).toEqual([]);
    expect(result.cvVersion).toBeNull();
    expect(result.application?.action).toBe("created");
    expect(fake.state.applications[0].cv_version).toBe("");
  });

  it("logs cv parse error but still upserts the application", async () => {
    const result = await syncOne(fake.pb, {
      reportFilename: "001-globaldata-2026-04-23.md",
      reportContent: REPORT_FIXTURE,
      cvMarkdownFilename: "cv-busted.md",
      cvMarkdownContent: "no frontmatter here\n",
      pdfPath: null,
      defaultTemplateId: TEMPLATE_ID,
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/cv parse failed/);
    expect(result.cvVersion).toBeNull();
    expect(result.application?.action).toBe("created");
    expect(fake.state.applications).toHaveLength(1);
  });
});

describe("syncOne: abort paths", () => {
  it("aborts cleanly with no writes when the report fails to parse", async () => {
    const result = await syncOne(fake.pb, {
      reportFilename: "001-bad.md",
      reportContent: "not an evaluation report\n",
      cvMarkdownFilename: "cv-mayowa-adeogun-globaldata-2026-04-24.md",
      cvMarkdownContent: CV_FIXTURE,
      pdfPath: null,
      defaultTemplateId: TEMPLATE_ID,
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/report parse failed/);
    expect(result.application).toBeNull();
    expect(result.cvVersion).toBeNull();
    expect(fake.state.applications).toHaveLength(0);
    expect(fake.state.cv_versions).toHaveLength(0);
  });
});
