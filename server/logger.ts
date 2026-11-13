import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export interface ServerLogEntry {
  event: string;
  requestId?: string;
  provider?: string;
  operation?: string;
  failure?: string;
  statusCode?: number;
  durationMs?: number;
  structureCount?: number;
  errorName?: string;
  errorMessage?: string;
}

export async function logServerEvent(entry: ServerLogEntry): Promise<void> {
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry,
  });
  const logDirectory = path.resolve(
    process.env.PANDAMOL_LOG_DIR || path.join(process.cwd(), 'logs')
  );

  try {
    await mkdir(logDirectory, { recursive: true });
    await appendFile(path.join(logDirectory, 'pandamol.log'), `${record}\n`, 'utf8');
  } catch (error) {
    console.error('PandaMol konnte nicht in die Log-Datei schreiben:', error);
    console.error(record);
  }
}
