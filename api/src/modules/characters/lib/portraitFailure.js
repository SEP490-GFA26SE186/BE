// Chan dung `failed`: do bo loc noi dung chan (ai_requests.status = blocked -> phu huynh sua mo ta)
// hay loi ky thuat (bam ve lai la duoc). Lay tu lenh ve chan dung gan nhat, khong them cot.

/** Gan vao `include` cua prisma.character. */
export const LAST_PORTRAIT_REQUEST = {
  where: { requestType: 'character_portrait' },
  orderBy: { createdAt: 'desc' },
  take: 1,
  select: { status: true },
};

/** 'blocked' | 'error' | null */
export const portraitFailureOf = (character) => {
  if (character.portraitStatus !== 'failed') return null;
  return character.aiRequests?.[0]?.status === 'blocked' ? 'blocked' : 'error';
};
