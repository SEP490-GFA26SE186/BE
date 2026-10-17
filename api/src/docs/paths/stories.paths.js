// Swagger cho module stories (spec Node §4). Body/response dung camelCase.
// Chu truyen luon o dang token {NVn}; `characters` la bang token -> ten de frontend thay khi hien thi.

const bearer = [{ BearerAuth: [] }];
const uuid = { type: 'string', format: 'uuid' };
const idParam = { name: 'id', in: 'path', required: true, description: 'ID truyện', schema: uuid };
const pageIdParam = { name: 'pageId', in: 'path', required: true, description: 'ID trang', schema: uuid };
const cpIdParam = { name: 'cpId', in: 'path', required: true, description: 'ID điểm dừng', schema: uuid };

const OWNER = '**Quyền truy cập:** phụ huynh sở hữu truyện.';
const CUSTOM_ONLY = 'Chỉ truyện `length = custom`; truyện khác trả `422`.';
const LOCKED = 'Truyện đang `generating` trả `409` (mọi thao tác sửa đều bị khoá).';

const resp = (description, example) => ({
  description,
  ...(example && { content: { 'application/json': { example } } }),
});
const err = (description) => ({ description });

const storyCharacterInput = {
  type: 'object',
  required: ['characterId', 'isMain'],
  properties: {
    characterId: { ...uuid, description: 'ID nhân vật của phụ huynh (hoặc hồ sơ bé)' },
    isMain: { type: 'boolean', description: 'Đúng một nhân vật chính' },
  },
};

const charactersInput = {
  type: 'array',
  minItems: 1,
  description:
    'Đúng một `isMain = true`, không trùng `characterId`. **Thứ tự gửi lên quyết định token**: nhân vật chính là `{NV1}`, các nhân vật phụ là `{NV2}`, `{NV3}`… theo thứ tự.',
  items: storyCharacterInput,
};

const storyDetailExample = {
  id: '7b1e4c1a-0d5e-4c55-9a53-1f1c2d3e4f50',
  kind: 'private',
  topicId: '11111111-2222-3333-4444-555555555555',
  topic: { id: '11111111-2222-3333-4444-555555555555', title: 'Chia sẻ đồ chơi' },
  length: 'short',
  title: 'Bo và chiếc xe cứu hỏa',
  situation: 'Bo không muốn cho bạn mượn xe cứu hỏa.',
  useAiImage: false,
  useTts: true,
  status: 'ready',
  reviewedAt: null,
  createdAt: '2026-09-30T08:00:00.000Z',
  updatedAt: '2026-09-30T08:05:00.000Z',
  characters: [
    { token: '{NV1}', characterId: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Bo', isMain: true },
    { token: '{NV2}', characterId: 'aaaaaaaa-0000-4000-8000-000000000002', name: 'Mẹ Lan', isMain: false },
  ],
  scenes: [
    {
      id: 'bbbbbbbb-0000-4000-8000-000000000001',
      sceneOrder: 1,
      description: 'Sân chơi trước nhà',
      imageKey: null,
      imageUrl: null, // link Cloudinary co chu ky khi da co anh
      backgroundId: null,
      imageStatus: 'none',
    },
  ],
  pages: [
    {
      id: 'cccccccc-0000-4000-8000-000000000001',
      pageOrder: 1,
      sceneId: 'bbbbbbbb-0000-4000-8000-000000000001',
      contentText: '{NV1} đang chơi xe cứu hỏa thì {NV2} gọi vào ăn cơm.',
      origin: 'ai',
      audioKey: null,
      audioUrl: null,
      audioStatus: 'none',
    },
  ],
  checkpoints: [
    {
      id: 'dddddddd-0000-4000-8000-000000000001',
      afterPageId: 'cccccccc-0000-4000-8000-000000000001',
      afterPageOrder: 1,
      type: 'emotion_self',
      targetToken: '{NV1}',
      question: '{NV1} đang cảm thấy thế nào?',
      answerEmotion: 'sad',
      hint: 'Nhìn vào khuôn mặt của {NV1} nhé.',
      origin: 'ai',
      options: [
        {
          id: 'eeeeeeee-0000-4000-8000-000000000001',
          optionOrder: 1,
          text: 'Buồn',
          role: null,
          isCorrect: true,
          feedback: 'Đúng rồi, {NV1} đang buồn.',
        },
      ],
    },
  ],
};

const detailResponse = (description) => resp(description, { success: true, data: { story: storyDetailExample } });

const editorErrors = {
  401: err('Chưa đăng nhập'),
  403: err('Không phải chủ truyện'),
  404: err('Không tìm thấy truyện / trang / điểm dừng'),
  409: err('Truyện đang được AI viết (`generating`)'),
};

const storiesPaths = {
  '/stories': {
    post: {
      tags: ['Stories'],
      summary: '[Parent] Tạo truyện nháp',
      description:
        `${OWNER}\nTạo truyện \`kind = private\`, \`status = draft\` cùng khung trang/cảnh/điểm dừng trống, dựng theo \`length\` ` +
        '(cấu hình `story_layout.*` trong `platform_settings`). Chưa có chữ và chưa tốn credit; gọi `POST /stories/{id}/generate` để AI viết chữ. ' +
        'Nếu `situation` chứa tên bé chưa có trong truyện, trả `422`. Truyện `custom` chỉ có khung tối thiểu, phụ huynh tự viết.',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['topicId', 'length', 'title', 'characters'],
              properties: {
                topicId: { ...uuid, description: 'ID chủ đề (topic) sư phạm' },
                length: { type: 'string', enum: ['short', 'medium', 'long', 'custom'] },
                title: { type: 'string', maxLength: 200, example: 'Bo và chiếc xe cứu hỏa' },
                situation: { type: 'string', maxLength: 2000, example: 'Bo không muốn cho bạn mượn xe cứu hỏa.' },
                characters: charactersInput,
                useAiImage: { type: 'boolean', default: false },
                useTts: { type: 'boolean', default: true },
              },
            },
          },
        },
      },
      responses: {
        201: detailResponse('Tạo truyện thành công, trả chi tiết truyện (chưa có chữ)'),
        400: err('Dữ liệu không hợp lệ (thiếu nhân vật chính, trùng nhân vật…)'),
        422: err('Tình huống chứa tên bé chưa có trong truyện, hoặc thiếu nhân vật phụ cho độ dài này'),
      },
    },
    get: {
      tags: ['Stories'],
      summary: '[Parent] Danh sách truyện của tôi',
      description: '**Quyền truy cập:** người dùng đã đăng nhập. Trả truyện của chính mình, có phân trang, lọc theo `status`.',
      security: bearer,
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'generating', 'ready'] } },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } },
      ],
      responses: {
        200: resp('Danh sách truyện (phân trang); mỗi phần tử là tóm tắt kèm `characters` và `pageCount`'),
        401: err('Chưa đăng nhập'),
      },
    },
  },

  '/stories/{id}': {
    get: {
      tags: ['Stories'],
      summary: '[Parent | Moderator | Admin] Chi tiết truyện',
      description:
        '**Quyền truy cập:** phụ huynh sở hữu truyện; `moderator`, `admin` được đọc.\n' +
        'Trả trang, cảnh, điểm dừng, phương án và nhân vật. Chữ truyện **giữ dạng token** `{NV1}`, `{NV2}`…; ' +
        'frontend thay token bằng tên khi hiển thị, dùng bảng `characters` (`token → name`).',
      security: bearer,
      parameters: [idParam],
      responses: {
        200: detailResponse('Chi tiết truyện'),
        401: err('Chưa đăng nhập'),
        403: err('Không có quyền xem truyện này'),
        404: err('Không tìm thấy truyện'),
      },
    },
    put: {
      tags: ['Stories'],
      summary: '[Parent] Sửa thông tin truyện',
      description: `${OWNER}\nSửa \`title\`, \`situation\`, \`useAiImage\`, \`useTts\`. Cần gửi ít nhất một trường. ${LOCKED}`,
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                title: { type: 'string', maxLength: 200 },
                situation: { type: 'string', nullable: true, maxLength: 2000 },
                useAiImage: { type: 'boolean' },
                useTts: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        200: detailResponse('Cập nhật thành công'),
        ...editorErrors,
        422: err('Tình huống chứa tên bé chưa có trong truyện'),
      },
    },
    delete: {
      tags: ['Stories'],
      summary: '[Parent] Xoá mềm truyện',
      description:
        `${OWNER}\nĐặt \`deleted_at\`. **Được phép xoá cả khi đang \`generating\`**: worker sẽ không ghi nội dung vào truyện đã xoá, ` +
        'credit vẫn bị trừ (AI đã chạy), không có lỗi.',
      security: bearer,
      parameters: [idParam],
      responses: {
        200: resp('Đã xoá truyện'),
        401: err('Chưa đăng nhập'),
        403: err('Không phải chủ truyện'),
        404: err('Không tìm thấy truyện'),
      },
    },
  },

  '/stories/{id}/characters': {
    put: {
      tags: ['Stories'],
      summary: '[Parent] Đổi nhân vật của truyện',
      description:
        `${OWNER}\nChỉ đổi được khi **chưa trang nào có chữ** (đổi sau khi có chữ làm token trỏ sai người). ` +
        'Token của điểm dừng được đưa về nhân vật phụ đầu tiên mới. ' +
        LOCKED,
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['characters'], properties: { characters: charactersInput } },
          },
        },
      },
      responses: {
        200: detailResponse('Đổi nhân vật thành công'),
        ...editorErrors,
        409: err('Truyện đang `generating`, hoặc đã có trang có chữ'),
        422: err('Thiếu nhân vật phụ cho câu hỏi về nhân vật khác, hoặc tình huống còn nhắc nhân vật bị bỏ'),
      },
    },
  },

  '/stories/{id}/pages': {
    post: {
      tags: ['Stories'],
      summary: '[Parent] Thêm trang (chỉ truyện custom)',
      description: `${OWNER}\n${CUSTOM_ONLY} Luật \`custom\` (\`custom_limits.*\`): 4–20 trang. ${LOCKED}`,
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { contentText: { type: 'string', nullable: true, maxLength: 2000 } },
            },
          },
        },
      },
      responses: {
        201: detailResponse('Đã thêm trang; trả chi tiết truyện với trang đã đánh số lại'),
        ...editorErrors,
        422: err('Không phải truyện `custom`, hoặc vượt số trang tối đa'),
      },
    },
  },

  '/stories/{id}/pages/{pageId}': {
    put: {
      tags: ['Stories'],
      summary: '[Parent] Sửa chữ của trang',
      description:
        `${OWNER}\nChữ đi qua \`tokenizeNames\` (tên thật thành token) trước khi lưu. \`origin = ai\` chuyển thành \`ai_edited\`; xoá \`audioKey\`. ` +
        '`contentText` rỗng hoặc `null` là xoá chữ trang. Sau khi sửa: mọi trang có chữ thì truyện thành `ready`, còn trang trống thì `draft`; ' +
        `**không** xoá \`reviewedAt\`. ${LOCKED}`,
      security: bearer,
      parameters: [idParam, pageIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['contentText'],
              properties: {
                contentText: { type: 'string', nullable: true, maxLength: 2000, example: 'Bo đưa xe cứu hỏa cho bạn chơi cùng.' },
              },
            },
          },
        },
      },
      responses: {
        200: detailResponse('Đã lưu trang'),
        ...editorErrors,
        422: err('Chữ chứa tên bé chưa có trong truyện'),
      },
    },
    delete: {
      tags: ['Stories'],
      summary: '[Parent] Xoá trang (chỉ truyện custom)',
      description: `${OWNER}\n${CUSTOM_ONLY} Không xoá được trang đang có điểm dừng đặt sau nó (\`409\`); tối thiểu 4 trang. ${LOCKED}`,
      security: bearer,
      parameters: [idParam, pageIdParam],
      responses: {
        200: detailResponse('Đã xoá trang'),
        ...editorErrors,
        422: err('Không phải truyện `custom`, hoặc dưới số trang tối thiểu'),
      },
    },
  },

  '/stories/{id}/checkpoints': {
    post: {
      tags: ['Stories'],
      summary: '[Parent] Thêm điểm dừng (chỉ truyện custom)',
      description:
        `${OWNER}\n${CUSTOM_ONLY} Luật \`custom\`: 0–6 điểm dừng có chấm, tối đa 1 điểm dừng mỗi trang, không đặt sau trang 1, ` +
        `\`reflection\` chỉ ở trang cuối. \`targetToken\` chỉ dùng cho \`emotion_other\` và \`perspective\`. ${LOCKED}`,
      security: bearer,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['type', 'afterPageId'],
              properties: {
                type: {
                  type: 'string',
                  enum: ['emotion_self', 'emotion_other', 'perspective', 'problem_solving', 'reflection'],
                },
                afterPageId: uuid,
                targetToken: { type: 'string', pattern: '^\\{NV\\d+\\}$', example: '{NV2}' },
              },
            },
          },
        },
      },
      responses: {
        201: detailResponse('Đã thêm điểm dừng'),
        ...editorErrors,
        422: err('Không phải truyện `custom`, hoặc vi phạm luật đặt điểm dừng'),
      },
    },
  },

  '/stories/{id}/checkpoints/{cpId}': {
    put: {
      tags: ['Stories'],
      summary: '[Parent] Sửa điểm dừng',
      description:
        `${OWNER}\nSửa \`question\`, \`hint\`, \`answerEmotion\`, \`options\`. Kiểm đủ trường theo kiểu điểm dừng. ` +
        `\`origin = ai\` chuyển thành \`ai_edited\`. ${LOCKED}`,
      security: bearer,
      parameters: [idParam, cpIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                question: { type: 'string', nullable: true, maxLength: 500 },
                hint: { type: 'string', nullable: true, maxLength: 500 },
                answerEmotion: { type: 'string', enum: ['happy', 'sad', 'angry', 'scared', 'neutral'] },
                options: {
                  type: 'array',
                  maxItems: 10,
                  items: {
                    type: 'object',
                    properties: {
                      text: { type: 'string', nullable: true, maxLength: 300 },
                      role: { type: 'string', enum: ['constructive', 'avoidant', 'impulsive'] },
                      isCorrect: { type: 'boolean' },
                      feedback: { type: 'string', nullable: true, maxLength: 500 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        200: detailResponse('Đã lưu điểm dừng'),
        400: err('Nội dung điểm dừng không hợp lệ theo kiểu'),
        ...editorErrors,
      },
    },
    delete: {
      tags: ['Stories'],
      summary: '[Parent] Xoá điểm dừng (chỉ truyện custom)',
      description: `${OWNER}\n${CUSTOM_ONLY} ${LOCKED}`,
      security: bearer,
      parameters: [idParam, cpIdParam],
      responses: {
        200: detailResponse('Đã xoá điểm dừng'),
        ...editorErrors,
        422: err('Không phải truyện `custom`'),
      },
    },
  },

  '/stories/{id}/review': {
    post: {
      tags: ['Stories'],
      summary: '[Parent] Đánh dấu đã xem xong',
      description:
        `${OWNER}\nĐặt \`reviewedAt\`. Chỉ nhận khi mọi trang có chữ và mọi điểm dừng đủ trường theo kiểu. ${LOCKED}`,
      security: bearer,
      parameters: [idParam],
      responses: {
        200: detailResponse('Đã đánh dấu truyện là đã xem xong'),
        ...editorErrors,
        422: err('Truyện còn chỗ chưa viết xong'),
      },
    },
  },

  '/stories/{id}/publish-version': {
    post: {
      tags: ['Stories'],
      summary: '[Parent] Đăng bán (chưa hỗ trợ)',
      description: 'Luôn trả `501` cho tới khi có spec chợ truyện.',
      security: bearer,
      parameters: [idParam],
      responses: {
        501: err('Chức năng đăng bán sẽ có ở bản sau'),
      },
    },
  },

  '/stories/{id}/generate': {
    post: {
      tags: ['Stories'],
      summary: '[Parent] Nhờ AI viết chữ cho truyện',
      description:
        `${OWNER}\nGiữ credit (\`ai_cost.story_text\`), đặt truyện \`generating\`, đẩy job vào queue và trả ngay \`202\`. ` +
        'Frontend gọi `GET /stories/{id}/generation` mỗi 2–3 giây tới khi `succeeded` / `failed` / `blocked`. ' +
        'Thành công: credit được tính, truyện `ready`, chữ, điểm dừng và phương án được ghi vào DB. Thất bại: credit được hoàn, truyện về trạng thái tính lại từ các trang.\n\n' +
        'Mã lỗi: `402` không đủ credit · `409` truyện đang sinh, hoặc đã có bé đọc (không viết lại được) · `422` truyện `custom` · ' +
        '`503` không đẩy được job vào queue (timeout 5 giây, credit đã hoàn).',
      security: bearer,
      parameters: [idParam],
      responses: {
        202: resp('AI đang viết truyện', {
          success: true,
          message: 'AI đang viết truyện',
          data: { aiRequestId: 'f0e1d2c3-0000-4000-8000-000000000abc' },
        }),
        401: err('Chưa đăng nhập'),
        402: err('Không đủ credit'),
        403: err('Không phải chủ truyện'),
        404: err('Không tìm thấy truyện'),
        409: err('Truyện đang được AI viết, hoặc đã được bé đọc nên không thể viết lại'),
        422: err('Truyện tự viết (`custom`) không dùng được AI viết chữ'),
        503: err('Hệ thống AI tạm gián đoạn (không đẩy được job vào queue trong 5 giây); credit đã được hoàn lại'),
      },
    },
  },

  '/stories/{id}/generation': {
    get: {
      tags: ['Stories'],
      summary: '[Parent] Trạng thái lần sinh chữ mới nhất',
      description:
        `${OWNER}\nTrả \`{ generation }\`: yêu cầu AI sinh chữ mới nhất của truyện, hoặc \`null\` nếu chưa sinh lần nào. ` +
        '`errorCode` và `errorMessage` được tách từ chuỗi lưu dạng `<CODE>: <message>` (`null` khi không lỗi). ' +
        'Job `queued`/`processing` quá 10 phút được coi là kẹt và được dọn ngay khi gọi endpoint này (hoàn credit, `failed`).\n\n' +
        '`status`: `queued` · `processing` · `succeeded` · `failed` · `blocked` (`SAFETY_BLOCKED`, `FORBIDDEN_TERM_DETECTED`).',
      security: bearer,
      parameters: [idParam],
      responses: {
        200: resp('Trạng thái sinh chữ', {
          success: true,
          data: {
            generation: {
              aiRequestId: 'f0e1d2c3-0000-4000-8000-000000000abc',
              status: 'failed',
              errorCode: 'TIMEOUT',
              errorMessage: 'AI không phản hồi kịp',
              createdAt: '2026-09-30T08:00:00.000Z',
              finishedAt: '2026-09-30T08:02:10.000Z',
            },
          },
        }),
        401: err('Chưa đăng nhập'),
        403: err('Không phải chủ truyện'),
        404: err('Không tìm thấy truyện'),
      },
    },
  },
};

export default storiesPaths;
