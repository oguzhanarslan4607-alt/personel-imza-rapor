import type { AppSettings } from "../types";

const SETTINGS_KEY = "personel-imza.settings.v1";

export const defaultSettings: AppSettings = {
  companyName: "Firma Adı",
  formTitle: "Günlük Personel Giriş İmza Föyü",
  shiftStart: "08:30",
  lateAfterMinutes: 0,
  rowsPerPrintSide: 43,
  theme: "light",
};

export function loadSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return defaultSettings;

  try {
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
