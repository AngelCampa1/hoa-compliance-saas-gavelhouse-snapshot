import { describe, it, expect } from "vitest";
import {
  parseReserveStudyCsv,
  parseReserveStudyJson,
} from "../../src/domain/accounting/reserveStudyImport.js";

describe("parseReserveStudyCsv", () => {
  it("returns an error for an empty CSV string", () => {
    const result = parseReserveStudyCsv("");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      field: "csv",
      message: "CSV is empty",
    });
    expect(result.rows).toHaveLength(0);
  });

  it("returns an error for a whitespace-only CSV string", () => {
    const result = parseReserveStudyCsv("");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      field: "csv",
      message: "CSV is empty",
    });
    expect(result.rows).toHaveLength(0);
  });

  it("parses a valid 3-component study", () => {
    const csv = [
      "component,useful life,remaining life,replacement cost,current reserve",
      "Roof,20,10,50000,25000",
      "Pool Deck,15,5,30000,10000",
      "HVAC,12,3,20000,5000",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toEqual({
      name: "Roof",
      usefulLifeYears: 20,
      remainingLifeYears: 10,
      replacementCostCents: 5000000,
      currentReserveCents: 2500000,
    });
    expect(result.rows[1]).toEqual({
      name: "Pool Deck",
      usefulLifeYears: 15,
      remainingLifeYears: 5,
      replacementCostCents: 3000000,
      currentReserveCents: 1000000,
    });
    expect(result.rows[2]).toEqual({
      name: "HVAC",
      usefulLifeYears: 12,
      remainingLifeYears: 3,
      replacementCostCents: 2000000,
      currentReserveCents: 500000,
    });
  });

  it("collects error on missing name", () => {
    const csv = [
      "component,useful life,remaining life,replacement cost,current reserve",",20,10,50000,25000",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      row: 1,
      field: "name",
    });
    expect(result.rows).toHaveLength(0);
  });

  it("collects error on negative replacement cost", () => {
    const csv = [
      "component,useful life,remaining life,replacement cost,current reserve",
      "Roof,20,10,-500,25000",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      row: 1,
      field: "replacementCostCents",
    });
  });

  it("handles case-insensitive headers", () => {
    const csv = [
      "Component,Useful Life,Remaining Life,Replacement Cost,Current Reserve",
      "Roof,20,10,50000,25000",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.name).toBe("Roof");
  });

  it("handles underscore-separated header variants", () => {
    const csv = [
      "name,useful_life,remaining_life,replacement_cost,current_reserve",
      "Elevator,30,15,100000,50000",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.name).toBe("Elevator");
    expect(result.rows[0]?.usefulLifeYears).toBe(30);
  });

  it("handles camelCase header variant usefullife", () => {
    const csv = [
      "name,usefullife,remaining_life,replacementcost,current_reserve",
      "Gate,10,5,20000,10000",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.usefulLifeYears).toBe(10);
  });

  it("collects error on usefulLifeYears < 1", () => {
    const csv = [
      "component,useful life,remaining life,replacement cost,current reserve",
      "Roof,0,10,50000,25000",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      row: 1,
      field: "usefulLifeYears",
    });
  });

  it("collects error on negative remainingLifeYears", () => {
    const csv = [
      "component,useful life,remaining life,replacement cost,current reserve",
      "Roof,20,-1,50000,25000",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      row: 1,
      field: "remainingLifeYears",
    });
  });

  it("collects error on negative current reserve", () => {
    const csv = [
      "component,useful life,remaining life,replacement cost,current reserve",
      "Roof,20,10,50000,-100",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      row: 1,
      field: "currentReserveCents",
    });
  });

  it("returns partial valid rows and collects errors on mixed data", () => {
    const csv = [
      "component,useful life,remaining life,replacement cost,current reserve",
      "Roof,20,10,50000,25000",",15,5,30000,10000",
      "HVAC,12,3,20000,5000",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(1);
    expect(result.rows).toHaveLength(2);
  });

  it("returns empty rows and errors for all-invalid CSV", () => {
    const csv = [
      "component,useful life,remaining life,replacement cost,current reserve",",0,-1,-100,-200",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.rows).toHaveLength(0);
  });

  it("handles zero replacement cost", () => {
    const csv = [
      "component,useful life,remaining life,replacement cost,current reserve",
      "Parking,5,2,0,0",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]?.replacementCostCents).toBe(0);
  });

  it("skips empty lines", () => {
    const csv = [
      "component,useful life,remaining life,replacement cost,current reserve",
      "Roof,20,10,50000,25000",
      "",
      "Pool,15,5,30000,10000",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
  });

  it("collects error on non-numeric useful life", () => {
    const csv = [
      "component,useful life,remaining life,replacement cost,current reserve",
      "Roof,abc,10,50000,25000",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("ignores unrecognized CSV header columns (return null from mapHeaderToField)", () => {
    const csv = [
      "component,useful life,remaining life,replacement cost,current reserve,extra_column",
      "Roof,20,10,50000,25000,ignored_value",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.name).toBe("Roof");
  });

  it("handles 'usefullifeyears' header variant (camelCase without space)", () => {
    const csv = [
      "name,usefullifeyears,remaining_life,replacementcost,current_reserve",
      "Pool,10,5,20000,10000",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.usefulLifeYears).toBe(10);
  });

  it("handles 'remaininglifeyears' header variant", () => {
    const csv = [
      "name,useful life,remaininglifeyears,replacement_cost,current_reserve",
      "Deck,15,7,30000,15000",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.remainingLifeYears).toBe(7);
  });

  it("handles 'replacementcostcents' header variant", () => {
    const csv = [
      "name,useful life,remaining life,replacementcostcents,currentreservecents",
      "Gate,8,4,1500000,750000",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.replacementCostCents).toBe(1500000);
    expect(result.rows[0]?.currentReserveCents).toBe(750000);
  });

  it("handles CRLF line endings", () => {
    const csv =
      "component,useful life,remaining life,replacement cost,current reserve\r\nRoof,20,10,50000,25000\r\n";

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
  });

  // MINOR-3: RFC 4180 quoted fields — component names containing commas must parse correctly
  it("handles quoted component name containing a comma", () => {
    const csv = [
      "component,useful life,remaining life,replacement cost,current reserve",
      '"Roof, Primary Building",20,10,50000,25000',
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.name).toBe("Roof, Primary Building");
  });

  it("handles multiple quoted fields with commas", () => {
    const csv = [
      "component,useful life,remaining life,replacement cost,current reserve",
      '"Roof, Main",20,10,50000,25000',
      '"Pool, East Wing",15,5,30000,10000',
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.name).toBe("Roof, Main");
    expect(result.rows[1]?.name).toBe("Pool, East Wing");
  });

  it("handles mix of quoted and unquoted fields on the same row", () => {
    const csv = [
      "component,useful life,remaining life,replacement cost,current reserve",
      '"Elevator, Building A",30,15,100000,50000',
      "HVAC,12,3,20000,5000",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.name).toBe("Elevator, Building A");
    expect(result.rows[1]?.name).toBe("HVAC");
  });

  it("handles escaped quotes inside quoted component names", () => {
    const csv = [
      "component,useful life,remaining life,replacement cost,current reserve",
      '"Pool ""A"" Deck",15,5,30000,10000',
    ].join("\n");

    const result = parseReserveStudyCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.name).toBe('Pool "A" Deck');
  });

  it("rejects malformed raw cents values instead of truncating them", () => {
    const csv = [
      "component,useful life,remaining life,replacementcostcents,currentreservecents",
      "Pool Deck,15,5,1500.50,10abc",
    ].join("\n");

    const result = parseReserveStudyCsv(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "replacementCostCents" }),
        expect.objectContaining({ field: "currentReserveCents" }),
      ]),
    );
  });
});

describe("parseReserveStudyJson", () => {
  it("parses a valid array of components (camelCase)", () => {
    const json = JSON.stringify([
      {
        name: "Roof",
        usefulLifeYears: 20,
        remainingLifeYears: 10,
        replacementCostCents: 5000000,
        currentReserveCents: 2500000,
      },
    ]);

    const result = parseReserveStudyJson(json);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      name: "Roof",
      usefulLifeYears: 20,
      remainingLifeYears: 10,
      replacementCostCents: 5000000,
      currentReserveCents: 2500000,
    });
  });

  it("accepts snake_case field names", () => {
    const json = JSON.stringify([
      {
        name: "Pool",
        useful_life_years: 15,
        remaining_life_years: 5,
        replacement_cost_cents: 3000000,
        current_reserve_cents: 1000000,
      },
    ]);

    const result = parseReserveStudyJson(json);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.usefulLifeYears).toBe(15);
    expect(result.rows[0]?.remainingLifeYears).toBe(5);
    expect(result.rows[0]?.replacementCostCents).toBe(3000000);
    expect(result.rows[0]?.currentReserveCents).toBe(1000000);
  });

  it("collects error on usefulLifeYears < 1", () => {
    const json = JSON.stringify([
      {
        name: "Roof",
        usefulLifeYears: 0,
        remainingLifeYears: 10,
        replacementCostCents: 5000000,
        currentReserveCents: 2500000,
      },
    ]);

    const result = parseReserveStudyJson(json);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      row: 0,
      field: "usefulLifeYears",
    });
  });

  it("collects error on missing name", () => {
    const json = JSON.stringify([
      {
        name: "",
        usefulLifeYears: 10,
        remainingLifeYears: 5,
        replacementCostCents: 1000000,
        currentReserveCents: 500000,
      },
    ]);

    const result = parseReserveStudyJson(json);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ field: "name" });
  });

  it("collects error on negative replacement cost", () => {
    const json = JSON.stringify([
      {
        name: "Roof",
        usefulLifeYears: 10,
        remainingLifeYears: 5,
        replacementCostCents: -1,
        currentReserveCents: 0,
      },
    ]);

    const result = parseReserveStudyJson(json);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ field: "replacementCostCents" });
  });

  it("collects error on invalid JSON (not array)", () => {
    const result = parseReserveStudyJson('{"name": "Roof"}');
    expect(result.errors).toHaveLength(1);
    expect(result.rows).toHaveLength(0);
  });

  it("collects error on completely invalid JSON", () => {
    const result = parseReserveStudyJson("{{{not valid");
    expect(result.errors).toHaveLength(1);
    expect(result.rows).toHaveLength(0);
  });

  it("returns partial valid rows on mixed data", () => {
    const json = JSON.stringify([
      {
        name: "Roof",
        usefulLifeYears: 20,
        remainingLifeYears: 10,
        replacementCostCents: 5000000,
        currentReserveCents: 2500000,
      },
      {
        name: "",
        usefulLifeYears: 0,
        remainingLifeYears: -1,
        replacementCostCents: -100,
        currentReserveCents: -200,
      },
    ]);

    const result = parseReserveStudyJson(json);
    expect(result.rows).toHaveLength(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("accepts both camelCase and snake_case in same input", () => {
    const json = JSON.stringify([
      {
        name: "Roof",
        usefulLifeYears: 20,
        remaining_life_years: 10,
        replacementCostCents: 5000000,
        current_reserve_cents: 2500000,
      },
    ]);

    const result = parseReserveStudyJson(json);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
  });

  it("collects error when a JSON item is null (not an object)", () => {
    const json = JSON.stringify([null]);
    const result = parseReserveStudyJson(json);
    expect(result.errors).toHaveLength(1);
    expect(result.rows).toHaveLength(0);
  });

  it("collects error when a JSON item is an array (not a plain object)", () => {
    const json = JSON.stringify([["Roof", 20, 10, 5000000, 2500000]]);
    const result = parseReserveStudyJson(json);
    expect(result.errors).toHaveLength(1);
    expect(result.rows).toHaveLength(0);
  });

  it("handles object with unrecognized keys (extractField returns undefined)", () => {
    // Fields with completely unrecognized key names - all fields will be undefined
    const json = JSON.stringify([
      {
        component_name: "Roof",
        life: 20,
        rem: 10,
        cost: 5000000,
        reserve: 2500000,
      },
    ]);
    const result = parseReserveStudyJson(json);
    // All fields missing → errors
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.rows).toHaveLength(0);
  });

  it("handles object where name key exists with normalizeJsonKey match", () => {
    // Uses snake_case key that needs normalizeJsonKey to find it
    const json = JSON.stringify([
      {
        name: "Elevator",
        useful_life_years: 30,
        remaining_life_years: 15,
        replacement_cost_cents: 10000000,
        current_reserve_cents: 5000000,
      },
    ]);
    const result = parseReserveStudyJson(json);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.name).toBe("Elevator");
  });

  // INT32_MAX overflow and cross-field validation for CSV
  describe("CSV: INT32_MAX bounds and cross-field validation", () => {
    const INT32_MAX = 2147483647;

    it("collects error on usefulLifeYears > INT32_MAX", () => {
      const csv = [
        "component,useful life,remaining life,replacement cost,current reserve",
        `Roof,${INT32_MAX + 1},10,50000,25000`,
      ].join("\n");

      const result = parseReserveStudyCsv(csv);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatchObject({
        row: 1,
        field: "usefulLifeYears",
      });
      expect(result.rows).toHaveLength(0);
    });

    it("collects error on remainingLifeYears > INT32_MAX", () => {
      const csv = [
        "component,useful life,remaining life,replacement cost,current reserve",
        `Roof,20,${INT32_MAX + 1},50000,25000`,
      ].join("\n");

      const result = parseReserveStudyCsv(csv);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatchObject({
        row: 1,
        field: "remainingLifeYears",
      });
      expect(result.rows).toHaveLength(0);
    });

    it("collects error on replacementCostCents > INT32_MAX", () => {
      const csv = [
        "component,useful life,remaining life,replacement cost,current reserve",
        `Roof,20,10,${INT32_MAX + 1},25000`,
      ].join("\n");

      const result = parseReserveStudyCsv(csv);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatchObject({
        row: 1,
        field: "replacementCostCents",
      });
      expect(result.rows).toHaveLength(0);
    });

    it("collects error on currentReserveCents > INT32_MAX", () => {
      const csv = [
        "component,useful life,remaining life,replacement cost,current reserve",
        `Roof,20,10,50000,${INT32_MAX + 1}`,
      ].join("\n");

      const result = parseReserveStudyCsv(csv);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatchObject({
        row: 1,
        field: "currentReserveCents",
      });
      expect(result.rows).toHaveLength(0);
    });

    it("collects error on remainingLifeYears > usefulLifeYears", () => {
      const csv = [
        "component,useful life,remaining life,replacement cost,current reserve",
        "Roof,5,10,50000,25000",
      ].join("\n");

      const result = parseReserveStudyCsv(csv);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatchObject({
        row: 1,
        field: "remainingLifeYears",
        message: expect.stringContaining("remainingLifeYears"),
      });
      expect(result.rows).toHaveLength(0);
    });

    it("accepts valid row with usefulLifeYears at INT32_MAX", () => {
      const csv = [
        "component,useful life,remaining life,replacement cost,current reserve",
        `Roof,${INT32_MAX},${INT32_MAX},50000,25000`,
      ].join("\n");

      const result = parseReserveStudyCsv(csv);
      expect(result.errors).toHaveLength(0);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.usefulLifeYears).toBe(INT32_MAX);
    });

    it("accepts valid row with remainingLifeYears == usefulLifeYears", () => {
      const csv = [
        "component,useful life,remaining life,replacement cost,current reserve",
        "Roof,20,20,50000,25000",
      ].join("\n");

      const result = parseReserveStudyCsv(csv);
      expect(result.errors).toHaveLength(0);
      expect(result.rows).toHaveLength(1);
    });
  });

  // INT32_MAX overflow and cross-field validation for JSON
  describe("JSON: INT32_MAX bounds and cross-field validation", () => {
    const INT32_MAX = 2147483647;

    it("collects error on usefulLifeYears > INT32_MAX", () => {
      const json = JSON.stringify([
        {
          name: "Roof",
          usefulLifeYears: INT32_MAX + 1,
          remainingLifeYears: 10,
          replacementCostCents: 5000000,
          currentReserveCents: 2500000,
        },
      ]);

      const result = parseReserveStudyJson(json);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatchObject({
        row: 0,
        field: "usefulLifeYears",
      });
      expect(result.rows).toHaveLength(0);
    });

    it("collects error on remainingLifeYears > INT32_MAX", () => {
      const json = JSON.stringify([
        {
          name: "Roof",
          usefulLifeYears: 20,
          remainingLifeYears: INT32_MAX + 1,
          replacementCostCents: 5000000,
          currentReserveCents: 2500000,
        },
      ]);

      const result = parseReserveStudyJson(json);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatchObject({
        row: 0,
        field: "remainingLifeYears",
      });
      expect(result.rows).toHaveLength(0);
    });

    it("collects error on replacementCostCents > INT32_MAX", () => {
      const json = JSON.stringify([
        {
          name: "Roof",
          usefulLifeYears: 20,
          remainingLifeYears: 10,
          replacementCostCents: INT32_MAX + 1,
          currentReserveCents: 2500000,
        },
      ]);

      const result = parseReserveStudyJson(json);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatchObject({
        row: 0,
        field: "replacementCostCents",
      });
      expect(result.rows).toHaveLength(0);
    });

    it("collects error on currentReserveCents > INT32_MAX", () => {
      const json = JSON.stringify([
        {
          name: "Roof",
          usefulLifeYears: 20,
          remainingLifeYears: 10,
          replacementCostCents: 5000000,
          currentReserveCents: INT32_MAX + 1,
        },
      ]);

      const result = parseReserveStudyJson(json);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatchObject({
        row: 0,
        field: "currentReserveCents",
      });
      expect(result.rows).toHaveLength(0);
    });

    it("collects error on remainingLifeYears > usefulLifeYears", () => {
      const json = JSON.stringify([
        {
          name: "Roof",
          usefulLifeYears: 5,
          remainingLifeYears: 10,
          replacementCostCents: 5000000,
          currentReserveCents: 2500000,
        },
      ]);

      const result = parseReserveStudyJson(json);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatchObject({
        row: 0,
        field: "remainingLifeYears",
        message: expect.stringContaining("remainingLifeYears"),
      });
      expect(result.rows).toHaveLength(0);
    });

    it("accepts valid row with usefulLifeYears at INT32_MAX", () => {
      const json = JSON.stringify([
        {
          name: "Roof",
          usefulLifeYears: INT32_MAX,
          remainingLifeYears: INT32_MAX,
          replacementCostCents: 5000000,
          currentReserveCents: 2500000,
        },
      ]);

      const result = parseReserveStudyJson(json);
      expect(result.errors).toHaveLength(0);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.usefulLifeYears).toBe(INT32_MAX);
    });

    it("accepts valid row with remainingLifeYears == usefulLifeYears", () => {
      const json = JSON.stringify([
        {
          name: "Roof",
          usefulLifeYears: 20,
          remainingLifeYears: 20,
          replacementCostCents: 5000000,
          currentReserveCents: 2500000,
        },
      ]);

      const result = parseReserveStudyJson(json);
      expect(result.errors).toHaveLength(0);
      expect(result.rows).toHaveLength(1);
    });
  });
});
