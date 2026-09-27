import { UnrecoverableError } from 'bullmq';
import { callAi } from '../clients/aiClient.js';

/**
 * Luu ket qua sinh noi dung vao DB.
 *
 * BIEN CO Y DE TRONG: schema chua duoc chot (bang luu job / credit ledger van
 * dang thay doi), nen buoc ghi DB chua duoc hien thuc. Day la DUY NHAT mot cho
 * can sua khi schema chot — moi thu khac trong luong (queue, retry, HTTP,
 * phan loai loi, Storage) da hoat dong day du va da test duoc.
 *
 * Khi chot schema, ham nay se: cap nhat trang thai job -> succeeded, luu
 * result.* vao ban ghi tuong ung, va commit credit da reserve theo `usage`.
 */
const persistAiResult = async (job, response) => {
  console.log(
    `[worker] ${job.name} ${job.id} succeeded in ${response.latencyMs}ms ` +
      `(provider=${response.provider} usage=${JSON.stringify(response.usage)})`,
  );
};

/**
 * Processor cho queue `ai`.
 *
 * Chi lam 3 viec: goi ai/, chuyen loi khong retry duoc thanh
 * UnrecoverableError, va giao ket qua cho persistAiResult.
 */
const processAiJob = async (job) => {
  const { idempotencyKey, storagePrefix, input } = job.data;

  try {
    const response = await callAi(job.name, {
      jobId: `${job.queueName}:${job.name}:${job.id}`,
      idempotencyKey,
      storagePrefix,
      input,
    });

    await persistAiResult(job, response);
    return response;
  } catch (error) {
    if (error.retryable === false) {
      // UnrecoverableError dung retry NGAY, bo qua so `attempts` con lai.
      // Day la cho bang loi trong docs/contracts/ai-service.md duoc THUC THI
      // bang code, chu khong phai bang loi nhac trong tai lieu.
      throw new UnrecoverableError(`[${error.errorKind}] ${error.message}`);
    }
    throw error;
  }
};

export default processAiJob;
