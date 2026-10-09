import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { config, SERVER_ROOT } from './config.js';
import { errorHandler, notFound } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { setIO } from './services/realtime.js';
import { initSockets } from './socket/index.js';
import path from 'node:path';
import fs from 'node:fs';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import friendRoutes from './routes/friend.routes.js';
import messageRoutes from './routes/message.routes.js';
import chatRoutes from './routes/chat.routes.js';
import storyRoutes from './routes/story.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import adminRoutes from './routes/admin.routes.js';

fs.mkdirSync(config.uploadDir, { recursive: true });

export function buildApp() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: config.corsOrigin,
      credentials: true,
    },
  });

  setIO(io);
  initSockets(io);

  // Security + middleware.
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    })
  );
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));
  app.use(apiLimiter);

  // Public health check + static uploads.
  app.get('/health', (req, res) => res.json({ ok: true, service: 'chatmate-server', uptime: process.uptime() }));
  app.use('/uploads', express.static(path.join(SERVER_ROOT, 'uploads'), {
    dotfiles: 'deny',
    index: false,
    redirect: false,
  }));

  // Versioned API.
  const api = express.Router();
  api.get('/', (req, res) =>
    res.json({ ok: true, service: 'chatmate-api', version: '1.0.0', health: '/health' })
  );
  api.use('/auth', authRoutes);
  api.use('/users', userRoutes);
  api.use('/friends', friendRoutes);
  api.use('/chats', chatRoutes);
  api.use('/messages', messageRoutes);
  api.use('/stories', storyRoutes);
  api.use('/notifications', notificationRoutes);
  api.use('/uploads', uploadRoutes);
  api.use('/admin', adminRoutes);
  app.use('/api', api);

  // Serve built frontend in production.
  const distDir = path.join(SERVER_ROOT, '..', 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir, { index: false }));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ ok: false, message: 'Route not found.' });
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return { app, server, io };
}
