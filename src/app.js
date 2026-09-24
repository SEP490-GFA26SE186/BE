import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { StatusCodes } from 'http-status-codes';

import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './docs/swagger.js';

import { env } from './config/index.js';
import { errorConverter, errorHandler } from './middlewares/index.js';
import ApiError from './utils/ApiError.js';
import v1Routes from './routes/v1/index.js';

const app = express();

// ---------------------------------------------------------------------------
// Global middlewares
// ---------------------------------------------------------------------------

// Security headers (disable CSP so Swagger UI loads static CSS/JS scripts)
app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

// CORS
app.use(
  cors({
    origin: env.cors.origin,
    credentials: true,
  }),
);

// Request logging
if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));
}

// Body parsers
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ---------------------------------------------------------------------------
// Swagger Documentation
// ---------------------------------------------------------------------------
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'StoryWeaver AI - API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
  }),
);
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
app.use('/api/v1', v1Routes);

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
app.use((_req, _res, next) => {
  next(new ApiError(StatusCodes.NOT_FOUND, 'Route not found'));
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
app.use(errorConverter);
app.use(errorHandler);

export default app;
