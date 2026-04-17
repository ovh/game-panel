import { getConfig } from './config.js';
import cors, { type CorsOptions } from 'cors';
import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { reconcileDockerHealthToDb, startDockerHealthEventListener } from './services/dockerEvents.js';
import { closeDatabase, initializeDatabase } from './database/init.js';
import { ensureRootUserExists } from './database/bootstrap.js';
import { authMiddleware, errorHandler } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import serverMembersRoutes from './routes/serverMembers.js';
import serverRoutes from './routes/servers.js';
import systemRoutes from './routes/system.js';
import { setupWebSocket } from './websocket/handler.js';
import { getAppVersion } from './utils/appInfo.js';
import { logError } from './utils/logger.js';

const { port, frontendUrl, trustProxy } = getConfig();
const API_BODY_LIMIT = '2mb';

const app: Application = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

function toOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const configuredOrigin = toOrigin(frontendUrl);
if (!configuredOrigin) {
  throw new Error('FRONTEND_URL must be a valid absolute URL');
}
const allowedOrigins = new Set<string>([configuredOrigin]);

let dockerHealthListener: { stop: () => void } | null = null;

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Requests like curl/Postman may not send an Origin header.
    if (!origin) return callback(null, true);

    const requestOrigin = toOrigin(origin);
    const isAllowed = !!requestOrigin && allowedOrigins.has(requestOrigin);

    if (isAllowed) return callback(null, true);
    return callback(new Error('CORS not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// In production the backend sits behind Traefik, so req.ip must honor the proxy chain.
app.set('trust proxy', trustProxy);

// CORS + preflight
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Body parsers
app.use(express.json({ limit: API_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: API_BODY_LIMIT }));

/**
 * Basic request logging.
 * If this becomes noisy later, we can replace it with a real logger (pino/winston/morgan).
 */
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/servers', authMiddleware, serverMembersRoutes);
app.use('/api/servers', authMiddleware, serverRoutes);
app.use('/api/system', authMiddleware, systemRoutes);

// Health check (no auth required)
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/version', (_req: Request, res: Response) => {
  const { instanceId } = getConfig();
  res.json({
    version: getAppVersion(),
    instanceId,
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler
app.use(errorHandler);

// WebSocket server
setupWebSocket(wss);

/**
 * Bootstraps the app: database init + HTTP server start.
 */
async function startServer(): Promise<void> {
  try {
    console.log('Initializing database...');
    await initializeDatabase();
    await ensureRootUserExists();
    console.log('Database initialized');

    // Sync current Docker health -> DB once at boot
    await reconcileDockerHealthToDb();

    // Then listen to live Docker health changes
    dockerHealthListener = startDockerHealthEventListener();

    httpServer.listen(port, () => {
      console.log('Game Panel backend listening on port ' + port);
    });
  } catch (error) {
    logError('APP:STARTUP', error);
    process.exit(1);
  }
}

/**
 * Gracefully closes the HTTP server and exits the process.
 * We handle both SIGINT and SIGTERM with the same logic.
 */
let shuttingDown = false;

function setupGracefulShutdown(): void {
  const shutdown = async (signal: 'SIGINT' | 'SIGTERM') => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n${signal} received, shutting down gracefully...`);

    try {
      // 1) Stop docker listener
      dockerHealthListener?.stop();

      // 2) Close WebSocket clients then server
      wss.clients.forEach((ws) => {
        try {
          ws.close(1001, 'Server shutting down');
        } catch {
          // Ignore close errors from already-closed sockets.
        }
      });

      await new Promise<void>((resolve) => wss.close(() => resolve()));

      // 3) Stop accepting new HTTP connections
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));

      // 4) Close DB connection (if you keep a singleton)
      await closeDatabase();

      console.log('Server closed');
      process.exit(0);
    } catch (err) {
      logError('APP:SHUTDOWN', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

setupGracefulShutdown();
function registerGlobalErrorHandlers(): void {
  process.on('unhandledRejection', (reason) => {
    logError('APP:UNHANDLED_REJECTION', reason);
  });

  process.on('uncaughtException', (error) => {
    logError('APP:UNCAUGHT_EXCEPTION', error);
  });
}

registerGlobalErrorHandlers();
startServer();
