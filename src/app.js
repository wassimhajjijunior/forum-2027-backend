import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import registrationsRouter from './routes/registrations.js';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(requestLogger);
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, config.corsOrigins.includes(origin));
    },
    optionsSuccessStatus: 204,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Admin-Api-Key', 'X-Request-Id'],
    maxAge: 600,
  }),
);
app.use(express.json({ limit: config.bodyLimit, strict: true }));

app.use('/api/health', healthRouter);
app.use('/api', registrationsRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
