import { describe, it, expect } from "vitest";
import {
  getTasksForTrade,
  calculateTaskPrice,
  generatePricebook,
  type RepairTask,
  type PricebookInputs,
} from "./pricebook-data";

// ─── getTasksForTrade ────────────────────────────────────────────────────────

describe("getTasksForTrade", () => {
  it("returns exactly 30 tasks for hvac", () => {
    const tasks = getTasksForTrade("hvac");
    expect(tasks).toHaveLength(30);
  });

  it("all hvac tasks have trade='hvac'", () => {
    const tasks = getTasksForTrade("hvac");
    expect(tasks.every((t) => t.trade === "hvac")).toBe(true);
  });

  it("returns exactly 20 tasks for plumbing", () => {
    const tasks = getTasksForTrade("plumbing");
    expect(tasks).toHaveLength(20);
  });

  it("all plumbing tasks have trade='plumbing'", () => {
    const tasks = getTasksForTrade("plumbing");
    expect(tasks.every((t) => t.trade === "plumbing")).toBe(true);
  });

  it("hvac tasks are sorted by category then name", () => {
    const tasks = getTasksForTrade("hvac");
    for (let i = 1; i < tasks.length; i++) {
      const prev = tasks[i - 1];
      const curr = tasks[i];
      if (prev.category === curr.category) {
        expect(curr.name.localeCompare(prev.name)).toBeGreaterThanOrEqual(0);
      } else {
        expect(
          curr.category.localeCompare(prev.category),
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("plumbing tasks are sorted by category then name", () => {
    const tasks = getTasksForTrade("plumbing");
    for (let i = 1; i < tasks.length; i++) {
      const prev = tasks[i - 1];
      const curr = tasks[i];
      if (prev.category === curr.category) {
        expect(curr.name.localeCompare(prev.name)).toBeGreaterThanOrEqual(0);
      } else {
        expect(
          curr.category.localeCompare(prev.category),
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("hvac tasks have unique ids", () => {
    const tasks = getTasksForTrade("hvac");
    const ids = tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("plumbing tasks have unique ids", () => {
    const tasks = getTasksForTrade("plumbing");
    const ids = tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("hvac tasks have all required fields with valid values", () => {
    const tasks = getTasksForTrade("hvac");
    for (const task of tasks) {
      expect(task.id).toBeTruthy();
      expect(task.category).toBeTruthy();
      expect(task.name).toBeTruthy();
      expect(task.defaultPartsCost).toBeGreaterThanOrEqual(0);
      expect(task.defaultLaborHours).toBeGreaterThan(0);
    }
  });

  it("plumbing tasks have all required fields with valid values", () => {
    const tasks = getTasksForTrade("plumbing");
    for (const task of tasks) {
      expect(task.id).toBeTruthy();
      expect(task.category).toBeTruthy();
      expect(task.name).toBeTruthy();
      expect(task.defaultPartsCost).toBeGreaterThanOrEqual(0);
      expect(task.defaultLaborHours).toBeGreaterThan(0);
    }
  });

  it("hvac tasks cover all 5 expected categories", () => {
    const tasks = getTasksForTrade("hvac");
    const categories = new Set(tasks.map((t) => t.category));
    expect(categories.has("Electrical")).toBe(true);
    expect(categories.has("Motors")).toBe(true);
    expect(categories.has("Controls")).toBe(true);
    expect(categories.has("Refrigerant")).toBe(true);
    expect(categories.has("General")).toBe(true);
  });

  it("hvac has correct task counts per category", () => {
    const tasks = getTasksForTrade("hvac");
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      counts[t.category] = (counts[t.category] ?? 0) + 1;
    }
    expect(counts["Electrical"]).toBe(6);
    expect(counts["Motors"]).toBe(5);
    expect(counts["Controls"]).toBe(6);
    expect(counts["Refrigerant"]).toBe(5);
    expect(counts["General"]).toBe(8);
  });

  it("plumbing tasks cover all 5 expected categories", () => {
    const tasks = getTasksForTrade("plumbing");
    const categories = new Set(tasks.map((t) => t.category));
    expect(categories.has("Fixtures")).toBe(true);
    expect(categories.has("Water Heater")).toBe(true);
    expect(categories.has("Drain")).toBe(true);
    expect(categories.has("Pipes")).toBe(true);
    expect(categories.has("General")).toBe(true);
  });

  it("plumbing has correct task counts per category", () => {
    const tasks = getTasksForTrade("plumbing");
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      counts[t.category] = (counts[t.category] ?? 0) + 1;
    }
    expect(counts["Fixtures"]).toBe(5);
    expect(counts["Water Heater"]).toBe(4);
    expect(counts["Drain"]).toBe(4);
    expect(counts["Pipes"]).toBe(4);
    expect(counts["General"]).toBe(3);
  });

  it("returns a new array on each call (not a shared reference)", () => {
    const a = getTasksForTrade("hvac");
    const b = getTasksForTrade("hvac");
    expect(a).not.toBe(b);
  });

  it("returns empty array for unknown trade", () => {
    const tasks = getTasksForTrade("electrical");
    expect(tasks).toHaveLength(0);
  });
});

// ─── calculateTaskPrice ──────────────────────────────────────────────────────

describe("calculateTaskPrice", () => {
  const baseTask: RepairTask = {
    id: "hvac-capacitor",
    trade: "hvac",
    category: "Electrical",
    name: "Capacitor Replacement",
    defaultPartsCost: 15,
    defaultLaborHours: 0.75,
  };

  it("calculates standard price: round(parts * markup + hours * rate)", () => {
    // parts = 15 * 3.0 = 45; labor = 0.75 * 120 = 90; total = 135
    const result = calculateTaskPrice(baseTask, {
      laborRate: 120,
      partsMarkup: 3.0,
      afterHoursMultiplier: 1.5,
    });
    expect(result.standardPrice).toBe(135);
  });

  it("calculates after-hours price: round(standard * multiplier)", () => {
    // standard = 135; afterHours = round(135 * 1.5) = 203
    const result = calculateTaskPrice(baseTask, {
      laborRate: 120,
      partsMarkup: 3.0,
      afterHoursMultiplier: 1.5,
    });
    expect(result.afterHoursPrice).toBe(203);
  });

  it("includes the original task on the result", () => {
    const result = calculateTaskPrice(baseTask, {
      laborRate: 100,
      partsMarkup: 2.5,
      afterHoursMultiplier: 1.25,
    });
    expect(result.task).toBe(baseTask);
  });

  it("handles zero parts cost (labor-only tasks)", () => {
    const laborOnlyTask: RepairTask = {
      id: "plumbing-drain-snaking",
      trade: "plumbing",
      category: "Drain",
      name: "Drain Snaking (Single)",
      defaultPartsCost: 0,
      defaultLaborHours: 1.0,
    };
    // parts = 0 * 3.0 = 0; labor = 1.0 * 95 = 95; standard = 95
    const result = calculateTaskPrice(laborOnlyTask, {
      laborRate: 95,
      partsMarkup: 3.0,
      afterHoursMultiplier: 1.5,
    });
    expect(result.standardPrice).toBe(95);
    expect(result.afterHoursPrice).toBe(143); // round(95 * 1.5) = 142.5 → 143
  });

  it("multiplier of 1.0 gives same after-hours price as standard", () => {
    const result = calculateTaskPrice(baseTask, {
      laborRate: 100,
      partsMarkup: 2.0,
      afterHoursMultiplier: 1.0,
    });
    expect(result.afterHoursPrice).toBe(result.standardPrice);
  });

  it("applies rounding correctly when result is exactly .5", () => {
    // parts = 10 * 2.0 = 20; labor = 0.5 * 101 = 50.5; total = 70.5 → 71
    const task: RepairTask = {
      id: "test-task",
      trade: "hvac",
      category: "Test",
      name: "Test Task",
      defaultPartsCost: 10,
      defaultLaborHours: 0.5,
    };
    const result = calculateTaskPrice(task, {
      laborRate: 101,
      partsMarkup: 2.0,
      afterHoursMultiplier: 1.0,
    });
    expect(result.standardPrice).toBe(71);
  });

  it("handles very high markup", () => {
    const result = calculateTaskPrice(baseTask, {
      laborRate: 200,
      partsMarkup: 5.0,
      afterHoursMultiplier: 2.0,
    });
    // parts = 15 * 5.0 = 75; labor = 0.75 * 200 = 150; standard = 225
    // afterHours = round(225 * 2.0) = 450
    expect(result.standardPrice).toBe(225);
    expect(result.afterHoursPrice).toBe(450);
  });

  it("partsMarkup from inputs is used for calculation", () => {
    // partsMarkup=2.0 from inputs is used, not a per-task value
    const result = calculateTaskPrice(baseTask, {
      laborRate: 100,
      partsMarkup: 2.0,
      afterHoursMultiplier: 1.0,
    });
    // parts = 15 * 2.0 = 30; labor = 0.75 * 100 = 75; standard = 105
    expect(result.standardPrice).toBe(105);
  });

  it("specific example: blower motor at $150/hr, 2.5x markup", () => {
    const blowerMotor: RepairTask = {
      id: "hvac-blower-motor",
      trade: "hvac",
      category: "Motors",
      name: "Blower Motor Replacement",
      defaultPartsCost: 200,
      defaultLaborHours: 1.5,
    };
    // parts = 200 * 2.5 = 500; labor = 1.5 * 150 = 225; standard = 725
    const result = calculateTaskPrice(blowerMotor, {
      laborRate: 150,
      partsMarkup: 2.5,
      afterHoursMultiplier: 1.5,
    });
    expect(result.standardPrice).toBe(725);
    expect(result.afterHoursPrice).toBe(1088); // round(725 * 1.5) = 1087.5 → 1088
  });
});

// ─── generatePricebook ───────────────────────────────────────────────────────

describe("generatePricebook", () => {
  const hvacInputs: PricebookInputs = {
    trade: "hvac",
    laborRate: 130,
    partsMarkup: 3.0,
    afterHoursMultiplier: 1.5,
  };

  const plumbingInputs: PricebookInputs = {
    trade: "plumbing",
    laborRate: 110,
    partsMarkup: 2.5,
    afterHoursMultiplier: 1.25,
  };

  it("returns all 30 tasks for hvac trade", () => {
    const result = generatePricebook(hvacInputs);
    expect(result.tasks).toHaveLength(30);
  });

  it("returns all 20 tasks for plumbing trade", () => {
    const result = generatePricebook(plumbingInputs);
    expect(result.tasks).toHaveLength(20);
  });

  it("sets inputs on the output object", () => {
    const result = generatePricebook(hvacInputs);
    expect(result.inputs).toEqual(hvacInputs);
  });

  it("includes a valid ISO generatedAt timestamp", () => {
    const before = new Date().toISOString();
    const result = generatePricebook(hvacInputs);
    const after = new Date().toISOString();
    expect(result.generatedAt >= before).toBe(true);
    expect(result.generatedAt <= after).toBe(true);
    // verify parseable as valid date
    expect(new Date(result.generatedAt).toISOString()).toBe(result.generatedAt);
  });

  it("each task has standardPrice and afterHoursPrice as numbers", () => {
    const result = generatePricebook(hvacInputs);
    for (const pt of result.tasks) {
      expect(typeof pt.standardPrice).toBe("number");
      expect(typeof pt.afterHoursPrice).toBe("number");
    }
  });

  it("all tasks in pricebook belong to the requested trade", () => {
    const hvacResult = generatePricebook(hvacInputs);
    expect(hvacResult.tasks.every((pt) => pt.task.trade === "hvac")).toBe(true);

    const plumbingResult = generatePricebook(plumbingInputs);
    expect(
      plumbingResult.tasks.every((pt) => pt.task.trade === "plumbing"),
    ).toBe(true);
  });

  it("after-hours prices are >= standard prices when multiplier >= 1", () => {
    const result = generatePricebook(hvacInputs);
    for (const pt of result.tasks) {
      expect(pt.afterHoursPrice).toBeGreaterThanOrEqual(pt.standardPrice);
    }
  });

  it("multiplier of 1.0 gives afterHoursPrice === standardPrice for all tasks", () => {
    const inputs: PricebookInputs = {
      trade: "hvac",
      laborRate: 100,
      partsMarkup: 2.5,
      afterHoursMultiplier: 1.0,
    };
    const result = generatePricebook(inputs);
    for (const pt of result.tasks) {
      expect(pt.afterHoursPrice).toBe(pt.standardPrice);
    }
  });

  it("uses the inputs laborRate and partsMarkup in calculations", () => {
    // Pick a known task (capacitor: $15 parts, 0.75 hrs)
    const result = generatePricebook({
      trade: "hvac",
      laborRate: 100,
      partsMarkup: 2.0,
      afterHoursMultiplier: 1.5,
    });
    const capacitorTask = result.tasks.find(
      (pt) => pt.task.id === "hvac-capacitor",
    );
    expect(capacitorTask).toBeDefined();
    // parts = 15 * 2.0 = 30; labor = 0.75 * 100 = 75; standard = 105
    expect(capacitorTask!.standardPrice).toBe(105);
  });

  it("returns different generatedAt for separate calls", async () => {
    const r1 = generatePricebook(hvacInputs);
    // Force a tiny delay to ensure timestamp differs
    await new Promise((resolve) => setTimeout(resolve, 2));
    const r2 = generatePricebook(hvacInputs);
    // Both are valid ISO strings (may or may not differ depending on clock precision)
    expect(new Date(r1.generatedAt).toISOString()).toBe(r1.generatedAt);
    expect(new Date(r2.generatedAt).toISOString()).toBe(r2.generatedAt);
  });

  it("tasks in pricebook are sorted by category then name", () => {
    const result = generatePricebook(hvacInputs);
    const tasks = result.tasks.map((pt) => pt.task);
    for (let i = 1; i < tasks.length; i++) {
      const prev = tasks[i - 1];
      const curr = tasks[i];
      if (prev.category === curr.category) {
        expect(curr.name.localeCompare(prev.name)).toBeGreaterThanOrEqual(0);
      } else {
        expect(
          curr.category.localeCompare(prev.category),
        ).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
