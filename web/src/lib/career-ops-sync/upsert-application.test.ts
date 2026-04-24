import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeApplication, makeFakePb } from "./fake-pb";
import type { FakePbHandle } from "./fake-pb";
import type { ParsedReport } from "./types";
import { upsertApplication } from "./upsert-application";

let fake: FakePbHandle;

beforeEach(() => {
  fake = makeFakePb();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

function makeReport(overrides: Partial<ParsedReport> = {}): ParsedReport {
  return {
    sequenceNumber: 1,
    date: "2026-04-23",
    company: "GlobalData Plc",
    role: "Head of IT",
    archetype: "Head of IT / IT Leadership",
    score: 4.2,
    jdUrl: "https://careers.globaldata.com/job/868284",
    legitimacy: "High Confidence",
    rawMarkdown: "# Evaluation: GlobalData Plc — Head of IT\n(full report)\n",
    tldr: "TL;DR",
    roleSummary: {
      Company: "GlobalData",
      Role: "Head of IT",
      Contract: "Permanent, full-time",
      Location: "London, EC4Y 0AN (UK)",
    },
    ...overrides,
  };
}

describe("upsertApplication: create path", () => {
  it("creates a new application and emits an evaluated event", async () => {
    const report = makeReport();
    const result = await upsertApplication(
      fake.pb,
      report,
      "cv_v1",
      "001-globaldata-2026-04-23.md",
    );

    expect(result.action).toBe("created");
    expect(result.fieldsChanged).toEqual([]);
    expect(fake.state.applications).toHaveLength(1);

    const app = fake.state.applications[0];
    expect(app.company).toBe("GlobalData Plc");
    expect(app.role).toBe("Head of IT");
    expect(app.fit_score).toBe(4.2);
    expect(app.archetype).toBe("Head of IT / IT Leadership");
    expect(app.status).toBe("evaluated");
    expect(app.jd_source).toBe("career-ops-scan");
    expect(app.jd_url).toBe("https://careers.globaldata.com/job/868284");
    expect(app.cv_version).toBe("cv_v1");
    expect(app.comp_range).toBe("Permanent, full-time");
    expect(app.location).toBe("London, EC4Y 0AN (UK)");
    expect(app.evaluation_report_md).toContain("# Evaluation: GlobalData Plc");
    expect(app.evaluation_report_path).toBe("001-globaldata-2026-04-23.md");
    expect(app.pinned).toBe(false);
    expect(app.notes).toBe("");
    expect(app.applied_at).toBe("");

    expect(fake.state.events).toHaveLength(1);
    const evt = fake.state.events[0];
    expect(evt.application).toBe(app.id);
    expect(evt.type).toBe("evaluated");
    expect(evt.occurred_at).toBe("2026-04-23T00:00:00.000Z");
    expect(evt.payload).toEqual({ sequence: 1, score: 4.2 });
  });
});

describe("upsertApplication: idempotency", () => {
  it("running twice with identical input yields CREATE then SKIP, no second event", async () => {
    const report = makeReport();
    await upsertApplication(fake.pb, report, "cv_v1", "001-x.md");
    const second = await upsertApplication(fake.pb, report, "cv_v1", "001-x.md");

    expect(second.action).toBe("skipped");
    expect(second.fieldsChanged).toEqual([]);
    expect(fake.state.applications).toHaveLength(1);
    expect(fake.state.events).toHaveLength(1);
  });
});

describe("upsertApplication: diff path", () => {
  it("UPDATEs when fit_score changes and emits a re_evaluation event", async () => {
    const report1 = makeReport({ score: 4.2 });
    await upsertApplication(fake.pb, report1, "cv_v1", "001-x.md");

    const report2 = makeReport({ score: 4.5 });
    const result = await upsertApplication(fake.pb, report2, "cv_v1", "001-x.md");

    expect(result.action).toBe("updated");
    expect(result.fieldsChanged).toEqual(["fit_score"]);
    expect(fake.state.applications[0].fit_score).toBe(4.5);
    expect(fake.state.events).toHaveLength(2);
    expect(fake.state.events[1].payload).toMatchObject({
      sequence: 1,
      score: 4.5,
      re_evaluation: true,
    });
  });

  it("UPDATEs multiple allowlisted fields and lists them all in fieldsChanged", async () => {
    await upsertApplication(fake.pb, makeReport(), "cv_v1", "001-x.md");

    const r2 = makeReport({
      score: 4.8,
      archetype: "IT Leadership (revised)",
      jdUrl: "https://example.com/x",
    });
    const result = await upsertApplication(fake.pb, r2, "cv_v2", "001-x.md");

    expect(result.action).toBe("updated");
    expect(new Set(result.fieldsChanged)).toEqual(
      new Set(["fit_score", "archetype", "cv_version", "jd_url"]),
    );
  });

  it("never mutates user-owned fields (status, notes, pinned, applied_at)", async () => {
    await upsertApplication(fake.pb, makeReport(), "cv_v1", "001-x.md");

    // Simulate the user editing the application manually via PB admin /
    // the web Kanban: status → applied, pinned → true, notes filled in,
    // applied_at set.
    fake.state.applications[0] = {
      ...fake.state.applications[0],
      status: "applied",
      pinned: true,
      notes: "Followed up with Paula on Tuesday",
      applied_at: "2026-04-28T00:00:00.000Z",
    };

    // Career-ops re-evaluates with a slightly different score.
    const r2 = makeReport({ score: 4.6 });
    await upsertApplication(fake.pb, r2, "cv_v1", "001-x.md");

    const app = fake.state.applications[0];
    expect(app.status).toBe("applied");
    expect(app.pinned).toBe(true);
    expect(app.notes).toBe("Followed up with Paula on Tuesday");
    expect(app.applied_at).toBe("2026-04-28T00:00:00.000Z");
    // But the allowlisted score did get through.
    expect(app.fit_score).toBe(4.6);
  });
});

describe("upsertApplication: matching", () => {
  it("matches existing records by natural key across casing/punctuation drift", async () => {
    // Seed PB with an existing record using slightly different casing —
    // natural key should still match.
    fake.state.applications.push(
      fakeApplication({
        id: "prior",
        company: "globaldata plc",
        role: "HEAD OF IT",
      }),
    );
    const result = await upsertApplication(
      fake.pb,
      makeReport(),
      null,
      "001-x.md",
    );
    // Either skip (if no allowlisted field drifted) or update, but never create.
    expect(result.action).not.toBe("created");
    expect(fake.state.applications).toHaveLength(1);
  });
});
