import app from './app.js';
import { env, prisma } from './config/index.js';

const startServer = async () => {
  try {
    // Verify database connection
    await prisma.$connect();
    console.log('Database connected successfully');

    app.listen(env.port, () => {
      console.log(`Server is running on port ${env.port} [${env.nodeEnv}]`);
      console.log(`Health check:  http://localhost:${env.port}/api/v1/health`);
      console.log(`Swagger Docs:  http://localhost:${env.port}/api-docs`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
