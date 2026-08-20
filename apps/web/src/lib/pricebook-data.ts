export type TradeType = string;

export interface RepairTask {
  id: string;
  trade: TradeType;
  category: string;
  name: string;
  defaultPartsCost: number;
  defaultLaborHours: number;
}

export interface PricebookInputs {
  trade: TradeType;
  laborRate: number;
  partsMarkup: number;
  afterHoursMultiplier: number;
}

export interface PricedTask {
  task: RepairTask;
  standardPrice: number;
  afterHoursPrice: number;
}

export interface PricedPricebook {
  inputs: PricebookInputs;
  tasks: PricedTask[];
  generatedAt: string;
}

// ─── Raw Task Data ────────────────────────────────────────────────────────────

const HVAC_TASKS: RepairTask[] = [
  // Electrical (6)
  {
    id: "hvac-breaker-replacement",
    trade: "hvac",
    category: "Electrical",
    name: "Breaker Replacement",
    defaultPartsCost: 35,
    defaultLaborHours: 1.0,
  },
  {
    id: "hvac-capacitor",
    trade: "hvac",
    category: "Electrical",
    name: "Capacitor Replacement",
    defaultPartsCost: 15,
    defaultLaborHours: 0.75,
  },
  {
    id: "hvac-contactor",
    trade: "hvac",
    category: "Electrical",
    name: "Contactor Replacement",
    defaultPartsCost: 20,
    defaultLaborHours: 0.5,
  },
  {
    id: "hvac-disconnect-box",
    trade: "hvac",
    category: "Electrical",
    name: "Disconnect Box Replacement",
    defaultPartsCost: 55,
    defaultLaborHours: 1.5,
  },
  {
    id: "hvac-fuse-disconnect",
    trade: "hvac",
    category: "Electrical",
    name: "Fuse/Disconnect Replacement",
    defaultPartsCost: 12,
    defaultLaborHours: 0.5,
  },
  {
    id: "hvac-wiring-repair",
    trade: "hvac",
    category: "Electrical",
    name: "Wiring Repair",
    defaultPartsCost: 25,
    defaultLaborHours: 1.0,
  },
  // Motors (5)
  {
    id: "hvac-blower-motor",
    trade: "hvac",
    category: "Motors",
    name: "Blower Motor Replacement",
    defaultPartsCost: 200,
    defaultLaborHours: 1.5,
  },
  {
    id: "hvac-circulator-pump-motor",
    trade: "hvac",
    category: "Motors",
    name: "Circulator Pump Motor",
    defaultPartsCost: 150,
    defaultLaborHours: 1.5,
  },
  {
    id: "hvac-condenser-fan-motor",
    trade: "hvac",
    category: "Motors",
    name: "Condenser Fan Motor Replacement",
    defaultPartsCost: 180,
    defaultLaborHours: 1.0,
  },
  {
    id: "hvac-draft-motor",
    trade: "hvac",
    category: "Motors",
    name: "Draft Motor Replacement",
    defaultPartsCost: 130,
    defaultLaborHours: 1.0,
  },
  {
    id: "hvac-inducer-motor",
    trade: "hvac",
    category: "Motors",
    name: "Inducer Motor Replacement",
    defaultPartsCost: 175,
    defaultLaborHours: 1.5,
  },
  // Controls (6)
  {
    id: "hvac-control-board",
    trade: "hvac",
    category: "Controls",
    name: "Control Board Replacement",
    defaultPartsCost: 220,
    defaultLaborHours: 1.5,
  },
  {
    id: "hvac-flame-sensor",
    trade: "hvac",
    category: "Controls",
    name: "Flame Sensor Replacement",
    defaultPartsCost: 20,
    defaultLaborHours: 0.5,
  },
  {
    id: "hvac-ignitor",
    trade: "hvac",
    category: "Controls",
    name: "Ignitor Replacement",
    defaultPartsCost: 35,
    defaultLaborHours: 0.5,
  },
  {
    id: "hvac-pressure-switch",
    trade: "hvac",
    category: "Controls",
    name: "Pressure Switch Replacement",
    defaultPartsCost: 30,
    defaultLaborHours: 0.75,
  },
  {
    id: "hvac-smart-thermostat",
    trade: "hvac",
    category: "Controls",
    name: "Smart Thermostat Install",
    defaultPartsCost: 120,
    defaultLaborHours: 1.5,
  },
  {
    id: "hvac-thermostat-standard",
    trade: "hvac",
    category: "Controls",
    name: "Thermostat Install/Replacement (Non-Smart)",
    defaultPartsCost: 45,
    defaultLaborHours: 1.0,
  },
  // Refrigerant (5)
  {
    id: "hvac-filter-drier",
    trade: "hvac",
    category: "Refrigerant",
    name: "Filter Drier Replacement",
    defaultPartsCost: 25,
    defaultLaborHours: 1.0,
  },
  {
    id: "hvac-leak-search-repair",
    trade: "hvac",
    category: "Refrigerant",
    name: "Leak Search and Repair",
    defaultPartsCost: 15,
    defaultLaborHours: 1.5,
  },
  {
    id: "hvac-refrigerant-recharge",
    trade: "hvac",
    category: "Refrigerant",
    name: "Refrigerant Recharge (Per Pound - 1 lb)",
    defaultPartsCost: 50,
    defaultLaborHours: 0.5,
  },
  {
    id: "hvac-schrader-valve",
    trade: "hvac",
    category: "Refrigerant",
    name: "Schrader Valve Replacement",
    defaultPartsCost: 8,
    defaultLaborHours: 0.5,
  },
  {
    id: "hvac-txv",
    trade: "hvac",
    category: "Refrigerant",
    name: "TXV/Metering Device Replacement",
    defaultPartsCost: 85,
    defaultLaborHours: 2.0,
  },
  // General (8)
  {
    id: "hvac-coil-cleaning-condenser",
    trade: "hvac",
    category: "General",
    name: "Coil Cleaning (Condenser)",
    defaultPartsCost: 10,
    defaultLaborHours: 1.0,
  },
  {
    id: "hvac-coil-cleaning-evaporator",
    trade: "hvac",
    category: "General",
    name: "Coil Cleaning (Evaporator)",
    defaultPartsCost: 10,
    defaultLaborHours: 1.5,
  },
  {
    id: "hvac-drain-line-clearing",
    trade: "hvac",
    category: "General",
    name: "Drain Line Clearing",
    defaultPartsCost: 5,
    defaultLaborHours: 0.5,
  },
  {
    id: "hvac-filter-replacement",
    trade: "hvac",
    category: "General",
    name: "Filter Replacement",
    defaultPartsCost: 20,
    defaultLaborHours: 0.25,
  },
  {
    id: "hvac-safety-inspection",
    trade: "hvac",
    category: "General",
    name: "Safety Inspection",
    defaultPartsCost: 0,
    defaultLaborHours: 1.0,
  },
  {
    id: "hvac-seasonal-tune-up-cooling",
    trade: "hvac",
    category: "General",
    name: "Seasonal Tune-Up (Cooling)",
    defaultPartsCost: 20,
    defaultLaborHours: 1.0,
  },
  {
    id: "hvac-seasonal-tune-up-heating",
    trade: "hvac",
    category: "General",
    name: "Seasonal Tune-Up (Heating)",
    defaultPartsCost: 20,
    defaultLaborHours: 1.0,
  },
  {
    id: "hvac-zone-damper",
    trade: "hvac",
    category: "General",
    name: "Zone Damper Replacement",
    defaultPartsCost: 75,
    defaultLaborHours: 1.5,
  },
];

const PLUMBING_TASKS: RepairTask[] = [
  // Fixtures (5)
  {
    id: "plumbing-faucet-repair",
    trade: "plumbing",
    category: "Fixtures",
    name: "Faucet Repair",
    defaultPartsCost: 15,
    defaultLaborHours: 1.0,
  },
  {
    id: "plumbing-faucet-replacement",
    trade: "plumbing",
    category: "Fixtures",
    name: "Faucet Replacement",
    defaultPartsCost: 80,
    defaultLaborHours: 1.5,
  },
  {
    id: "plumbing-shower-valve",
    trade: "plumbing",
    category: "Fixtures",
    name: "Shower Valve Replacement/Cartridge",
    defaultPartsCost: 55,
    defaultLaborHours: 1.5,
  },
  {
    id: "plumbing-toilet-repair",
    trade: "plumbing",
    category: "Fixtures",
    name: "Toilet Repair (Flapper/Fill Valve)",
    defaultPartsCost: 20,
    defaultLaborHours: 0.75,
  },
  {
    id: "plumbing-toilet-replacement",
    trade: "plumbing",
    category: "Fixtures",
    name: "Toilet Replacement",
    defaultPartsCost: 150,
    defaultLaborHours: 2.0,
  },
  // Water Heater (4)
  {
    id: "plumbing-anode-rod",
    trade: "plumbing",
    category: "Water Heater",
    name: "Anode Rod Replacement",
    defaultPartsCost: 30,
    defaultLaborHours: 0.75,
  },
  {
    id: "plumbing-thermocouple",
    trade: "plumbing",
    category: "Water Heater",
    name: "Thermocouple/Thermopile Replacement",
    defaultPartsCost: 25,
    defaultLaborHours: 0.75,
  },
  {
    id: "plumbing-water-heater-flush",
    trade: "plumbing",
    category: "Water Heater",
    name: "Water Heater Flush/Maintenance",
    defaultPartsCost: 5,
    defaultLaborHours: 1.0,
  },
  {
    id: "plumbing-water-heater-replacement",
    trade: "plumbing",
    category: "Water Heater",
    name: "Water Heater Replacement (Labor Only - 40 Gal)",
    defaultPartsCost: 0,
    defaultLaborHours: 3.0,
  },
  // Drain (4)
  {
    id: "plumbing-clean-out-installation",
    trade: "plumbing",
    category: "Drain",
    name: "Clean-Out Installation",
    defaultPartsCost: 40,
    defaultLaborHours: 2.0,
  },
  {
    id: "plumbing-drain-snaking",
    trade: "plumbing",
    category: "Drain",
    name: "Drain Snaking (Single)",
    defaultPartsCost: 0,
    defaultLaborHours: 1.0,
  },
  {
    id: "plumbing-hydro-jetting",
    trade: "plumbing",
    category: "Drain",
    name: "Hydro-Jetting (Per Hour)",
    defaultPartsCost: 0,
    defaultLaborHours: 1.0,
  },
  {
    id: "plumbing-p-trap",
    trade: "plumbing",
    category: "Drain",
    name: "P-Trap Replacement",
    defaultPartsCost: 15,
    defaultLaborHours: 0.5,
  },
  // Pipes (4)
  {
    id: "plumbing-pipe-insulation",
    trade: "plumbing",
    category: "Pipes",
    name: "Pipe Insulation (Per Linear Foot)",
    defaultPartsCost: 2,
    defaultLaborHours: 0.25,
  },
  {
    id: "plumbing-shutoff-valve",
    trade: "plumbing",
    category: "Pipes",
    name: "Shutoff Valve Replacement",
    defaultPartsCost: 20,
    defaultLaborHours: 0.75,
  },
  {
    id: "plumbing-small-leak-repair",
    trade: "plumbing",
    category: "Pipes",
    name: "Small Leak Repair/Joint",
    defaultPartsCost: 10,
    defaultLaborHours: 0.75,
  },
  {
    id: "plumbing-supply-line",
    trade: "plumbing",
    category: "Pipes",
    name: "Supply Line Replacement",
    defaultPartsCost: 12,
    defaultLaborHours: 0.5,
  },
  // General (3)
  {
    id: "plumbing-garbage-disposal",
    trade: "plumbing",
    category: "General",
    name: "Garbage Disposal Replacement",
    defaultPartsCost: 120,
    defaultLaborHours: 1.5,
  },
  {
    id: "plumbing-sump-pump",
    trade: "plumbing",
    category: "General",
    name: "Sump Pump Replacement",
    defaultPartsCost: 180,
    defaultLaborHours: 2.0,
  },
  {
    id: "plumbing-whole-house-inspection",
    trade: "plumbing",
    category: "General",
    name: "Whole-House Inspection",
    defaultPartsCost: 0,
    defaultLaborHours: 1.5,
  },
];

function sortTasks(tasks: RepairTask[]): RepairTask[] {
  return [...tasks].sort((a, b) => {
    const catCmp = a.category.localeCompare(b.category);
    if (catCmp !== 0) return catCmp;
    return a.name.localeCompare(b.name);
  });
}

const SORTED_HVAC_TASKS = sortTasks(HVAC_TASKS);
const SORTED_PLUMBING_TASKS = sortTasks(PLUMBING_TASKS);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns all repair tasks for the given trade, sorted by category then name.
 */
export function getTasksForTrade(trade: TradeType): RepairTask[] {
  if (trade === "hvac") return [...SORTED_HVAC_TASKS];
  if (trade === "plumbing") return [...SORTED_PLUMBING_TASKS];
  return [];
}

/**
 * Calculate flat rate for a single task.
 * standard = round(partsTotal + laborTotal)
 *   partsTotal = task.defaultPartsCost * partsMarkup
 *   laborTotal = task.defaultLaborHours * laborRate
 * afterHours = round(standard * afterHoursMultiplier)
 */
export function calculateTaskPrice(
  task: RepairTask,
  inputs: Omit<PricebookInputs, "trade">,
): PricedTask {
  const { laborRate, partsMarkup, afterHoursMultiplier } = inputs;
  const partsTotal = task.defaultPartsCost * partsMarkup;
  const laborTotal = task.defaultLaborHours * laborRate;
  const standardPrice = Math.round(partsTotal + laborTotal);
  const afterHoursPrice = Math.round(standardPrice * afterHoursMultiplier);
  return { task, standardPrice, afterHoursPrice };
}

/**
 * Generates a full pricebook from user inputs: filters tasks by trade, prices each one.
 */
export function generatePricebook(inputs: PricebookInputs): PricedPricebook {
  const tasks = getTasksForTrade(inputs.trade);
  const pricedTasks = tasks.map((task) => calculateTaskPrice(task, inputs));
  return {
    inputs,
    tasks: pricedTasks,
    generatedAt: new Date().toISOString(),
  };
}
