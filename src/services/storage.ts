import AsyncStorage from '@react-native-async-storage/async-storage';
import { Report, ReportImage } from '../types';
import { CONFIG, DEFAULT_API_URL } from '../constants/config';

/**
 * Storage Service
 * Persists report records and drafts using AsyncStorage
 */

export async function loadReportsFromStorage(): Promise<Report[]> {
  try {
    const raw = await AsyncStorage.getItem(CONFIG.STORAGE_REPORTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Report[];
  } catch (err) {
    console.error('[Storage] Error loading reports:', err);
    return [];
  }
}

export async function saveReportsToStorage(reports: Report[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CONFIG.STORAGE_REPORTS_KEY, JSON.stringify(reports));
  } catch (err) {
    console.error('[Storage] Error saving reports:', err);
  }
}

export async function upsertReportInStorage(report: Report): Promise<Report[]> {
  const all = await loadReportsFromStorage();
  const index = all.findIndex(r => r.id === report.id);
  if (index >= 0) {
    all[index] = report;
  } else {
    all.unshift(report);
  }
  await saveReportsToStorage(all);
  return all;
}

export async function deleteReportFromStorage(id: string): Promise<void> {
  const all = await loadReportsFromStorage();
  const filtered = all.filter(r => r.id !== id);
  await saveReportsToStorage(filtered);
}

export async function clearAllReportsFromStorage(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CONFIG.STORAGE_REPORTS_KEY);
    await AsyncStorage.removeItem(CONFIG.STORAGE_DRAFT_KEY);
  } catch (err) {
    console.error('[Storage] Error clearing storage:', err);
  }
}

export async function getServerUrl(): Promise<string> {
  try {
    const url = await AsyncStorage.getItem(CONFIG.STORAGE_SERVER_URL_KEY);
    return url || (DEFAULT_API_URL as string);
  } catch (e) {
    return (DEFAULT_API_URL as string);
  }
}

export async function setServerUrl(url: string): Promise<void> {
  try {
    await AsyncStorage.setItem(CONFIG.STORAGE_SERVER_URL_KEY, url.trim());
  } catch (err) {
    console.error('[Storage] Error setting server URL:', err);
  }
}

export async function saveDraft(draft: { description: string; images: ReportImage[] } | null): Promise<void> {
  try {
    if (!draft) {
      await AsyncStorage.removeItem(CONFIG.STORAGE_DRAFT_KEY);
    } else {
      await AsyncStorage.setItem(CONFIG.STORAGE_DRAFT_KEY, JSON.stringify(draft));
    }
  } catch (e) {
    console.error('[Storage] Failed to save draft:', e);
  }
}

export async function loadDraft(): Promise<{ description: string; images: ReportImage[] } | null> {
  try {
    const raw = await AsyncStorage.getItem(CONFIG.STORAGE_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
