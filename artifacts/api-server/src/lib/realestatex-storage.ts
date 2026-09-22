import fs from "node:fs";
import path from "node:path";

export type PropertyRecord = {
  propertyId: string;
  adres: string;
  type: string;
  bouwjaar: number;
  woonoppervlak: number;
  perceel?: number;
  energielabel: string;
  kenmerken?: Record<string, string>;
};

const storagePath = path.join(process.cwd(), "storage", "realestateX");

const initialProperties: Record<string, PropertyRecord> = {
  "ams-001": {
    propertyId: "ams-001",
    adres: "Keizersgracht 148, Amsterdam",
    type: "Appartement",
    bouwjaar: 1904,
    woonoppervlak: 86,
    perceel: 0,
    energielabel: "B",
    kenmerken: {
      kamers: "3",
      huurprijs: "2450",
      kosten: "4800",
      investering: "680000",
    },
  },
  "utr-002": {
    propertyId: "utr-002",
    adres: "Maliebaan 42, Utrecht",
    type: "Herenhuis",
    bouwjaar: 1932,
    woonoppervlak: 142,
    perceel: 118,
    energielabel: "A",
    kenmerken: {
      kamers: "5",
      huurprijs: "3200",
      kosten: "7200",
      investering: "815000",
    },
  },
  "rtd-003": {
    propertyId: "rtd-003",
    adres: "Witte de Withstraat 61, Rotterdam",
    type: "Bovenwoning",
    bouwjaar: 1911,
    woonoppervlak: 74,
    perceel: 0,
    energielabel: "C",
    kenmerken: {
      kamers: "2",
      huurprijs: "1850",
      kosten: "3600",
      investering: "420000",
    },
  },
};

function ensureStorage(): void {
  fs.mkdirSync(storagePath, { recursive: true });
}

function filePath(filename: string): string {
  ensureStorage();
  return path.join(storagePath, filename);
}

export function readJson<T>(filename: string, fallback: T): T {
  const target = filePath(filename);
  if (!fs.existsSync(target)) {
    writeJson(filename, fallback);
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(target, "utf8")) as T;
  } catch (error) {
    throw new Error(
      `Storage file "${filename}" is unreadable or contains invalid JSON`,
      { cause: error },
    );
  }
}

export function writeJson<T>(filename: string, data: T): void {
  const target = filePath(filename);
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(temporary, target);
}

export function loadProperties(): Record<string, PropertyRecord> {
  return readJson("properties.json", initialProperties);
}

export function saveProperties(
  properties: Record<string, PropertyRecord>,
): void {
  writeJson("properties.json", properties);
}

export function initialiseRealEstateStorage(): void {
  ensureStorage();
  loadProperties();
  readJson("valuations.json", {});
  readJson("rentals.json", {});
  readJson("mortgages.json", {});
  readJson("market.json", {
    status: "ok",
    trend: "Stijgende markt in stedelijke gebieden",
    change: 3.7,
    period: "Q3 2026",
  });
}