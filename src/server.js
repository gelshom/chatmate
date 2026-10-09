import { buildApp } from './app.js';
import { config } from './config.js';

// config loads server/.env before the API begins listening.

const { app, server, io } = buildApp();

const PORT = config.port;
server.listen(PORT, () => {
  console.log(`[chatmate-server] listening on http://localhost:${PORT}`);
  console.log(`[chatmate-server] API root:   http://localhost:${PORT}/api`);
  console.log(`[chatmate-server] Health:     http://localhost:${PORT}/health`);
  console.log(`[chatmate-server] Socket.IO:  ws://localhost:${PORT}`);
});

const stop = () => {
  console.log('[chatmate-server] shutting down...');
  io.close();
  server.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

export { app, server, io };
