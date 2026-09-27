// Healthcheck cho container `worker`.
//
// Container worker dung CHUNG image voi api, nen no thua huong HEALTHCHECK
// trong Dockerfile (curl vao :3000). Worker khong chay HTTP server nen check do
// khong bao gio pass. docker-compose.yml ghi de bang file nay.
//
// Worker song = noi duoc voi Redis. Neu mat Redis thi no khong nhan job duoc,
// va do dung la trang thai "unhealthy" can bao.
import connection from './queues/connection.js';

try {
  await connection.ping();
  await connection.quit();
  process.exit(0);
} catch (error) {
  console.error(`[healthcheck] khong ping duoc Redis: ${error.message}`);
  process.exit(1);
}
