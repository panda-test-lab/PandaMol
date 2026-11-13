import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { disambiguateWithGemini } from './server/chemicalResolver.ts';
import { logServerEvent } from './server/logger.ts';
import { generateStructures } from './src/chemistry/generateLocal.ts';
import type { GenerateStructuresRequest, GenerateStructuresResponse } from './src/types/chemistry.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/structures/generate', async (req, res) => {
  const requestId = randomUUID();
  const startedAt = Date.now();

  try {
    const body = (req.body || {}) as Partial<GenerateStructuresRequest>;
    const result = await generateStructures(
      body,
      disambiguateWithGemini,
      (diagnostic) =>
        logServerEvent({
          event: 'chemical_provider_request_failed',
          requestId,
          ...diagnostic,
        })
    );
    await logServerEvent({
      event: result.body.error ? 'structure_generation_rejected' : 'structure_generation_completed',
      requestId,
      statusCode: result.status,
      durationMs: Date.now() - startedAt,
      structureCount: result.body.structures.length,
    });
    res.status(result.status).json({ ...result.body, debugId: requestId });
  } catch (err) {
    await logServerEvent({
      event: 'structure_generation_failed',
      requestId,
      statusCode: 500,
      durationMs: Date.now() - startedAt,
      errorName: err instanceof Error ? err.name : 'UnknownError',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({
      query: '',
      specifications: '',
      interpretedNote: '',
      structures: [],
      notices: [],
      error:
        'Fehler bei der Datenbankabfrage oder Strukturvalidierung. Bitte erneut versuchen.',
      debugId: requestId,
    } satisfies GenerateStructuresResponse);
  }
});

async function startServer() {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  const isProd = process.env.NODE_ENV === 'production';
  const httpServer = http.createServer(app);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(port, host, () => {
    console.log(`PandaMol Server läuft auf http://${host}:${port}`);
    void logServerEvent({ event: 'server_started' });
  });
}

startServer();
