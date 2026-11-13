import { invoke, isTauri } from '@tauri-apps/api/core';

export interface TauriSaveResult {
  saved: boolean;
  canceled: boolean;
  path?: string;
}

export type TauriErrorEvent =
  | 'upstream_unavailable'
  | 'structure_validation_failed'
  | 'structure_generation_failed'
  | 'frontend_runtime_error'
  | 'update_check_failed'
  | 'update_install_failed'
  | 'external_link_failed';

export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      isTauri() ||
      '__TAURI_INTERNALS__' in window ||
      window.location.protocol === 'tauri:' ||
      window.location.hostname === 'tauri.localhost'
    );
  } catch {
    return false;
  }
}

export async function saveExportFileInTauri(
  bytes: Uint8Array,
  defaultFilename: string,
  extension: 'svg' | 'png' | 'jpg'
): Promise<TauriSaveResult> {
  return invoke<TauriSaveResult>('save_export_file', {
    data: Array.from(bytes),
    defaultFilename,
    extension,
  });
}

export async function logAppErrorInTauri(
  event: TauriErrorEvent,
  message: string
): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('log_app_error', { event, message });
}

export async function openExternalUrlInTauri(url: string): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  await invoke('open_external_url', { url });
  return true;
}
