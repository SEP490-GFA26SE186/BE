import { env } from '../config/index.js';

const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'StoryWeaver AI - API Documentation',
    version: '1.0.0',
    description: `
**StoryWeaver AI** - Nền tảng sáng tác truyện tương tác cá nhân hóa và giáo dục trí tuệ cảm xúc (EQ) cho trẻ em.
API Backend cung cấp đầy đủ các chức năng quản lý tài khoản phụ huynh, bảo mật chế độ trẻ em (Kid Mode PIN & Session), xác thực email, và tích hợp cơ sở dữ liệu Supabase.
    `,
    contact: {
      name: 'StoryWeaver AI Team (GFA26SE186)',
    },
  },
  servers: [
    {
      url: `http://localhost:${env.port}/api/v1`,
      description: 'Local Development Server',
    },
  ],
  tags: [
    { name: 'Health', description: 'Kiểm tra trạng thái hoạt động của hệ thống' },
    { name: 'Auth', description: 'Đăng ký, Đăng nhập, Quản lý Token và Thông tin cá nhân' },
    { name: 'Kid Mode', description: 'Quản lý mã PIN và phiên đọc Chế độ Trẻ em' },
    { name: 'Email Verification', description: 'Gửi và xác thực địa chỉ email qua Brevo' },
    { name: 'Children', description: 'Quản lý hồ sơ bé và kiểm soát thời gian sử dụng màn hình' },
    { name: 'Characters', description: 'Quản lý nhân vật gia đình đưa vào truyện và chân dung AI' },
    { name: 'EQ Skills', description: 'Danh mục 5 nhóm năng lực trí tuệ cảm xúc chuẩn CASEL' },
    { name: 'Templates', description: 'Thư viện kịch bản truyện mẫu sư phạm và cây quyết định cảm xúc' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Nhập access token nhận được từ API đăng nhập hoặc đăng ký (không cần gõ từ khóa "Bearer").',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: 'd3b07384-d113-49d6-a246-24b5d2757279' },
          role: { type: 'string', enum: ['parent', 'moderator', 'admin'], example: 'parent' },
          username: { type: 'string', example: 'hoangnam' },
          email: { type: 'string', format: 'email', example: 'hoangnam@example.com' },
          fullName: { type: 'string', example: 'Nguyễn Hoàng Nam' },
          phone: { type: 'string', nullable: true, example: '0901234567' },
          hasKidPin: { type: 'boolean', example: false, description: 'Phụ huynh đã thiết lập mã PIN thoát chưa' },
          emailVerifiedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
          createdAt: { type: 'string', format: 'date-time', example: '2026-09-24T10:00:00.000Z' },
        },
      },
      Tokens: {
        type: 'object',
        properties: {
          accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          refreshToken: { type: 'string', example: '4a7b9c1d2e3f4a5b6c7d8e9f0a1b2c3d...' },
          expiresIn: { type: 'string', example: '15m' },
        },
      },
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Operation completed successfully' },
          data: { type: 'object' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Validation failed' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', example: 'body.email' },
                message: { type: 'string', example: 'Invalid email address' },
              },
            },
          },
        },
      },
      Child: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '76693be8-831c-41a7-bdaa-6e07fc5c6457' },
          parentId: { type: 'string', format: 'uuid', example: 'd3b07384-d113-49d6-a246-24b5d2757279' },
          name: { type: 'string', example: 'Bé Bo' },
          birthDate: { type: 'string', format: 'date', nullable: true, example: '2019-05-10' },
          dailyScreenTimeMinutes: { type: 'integer', example: 30 },
          bedtimeStart: { type: 'string', nullable: true, example: '21:00' },
          bedtimeEnd: { type: 'string', nullable: true, example: '06:00' },
          preferredVoice: { type: 'string', nullable: true, example: 'northern_female' },
          createdAt: { type: 'string', format: 'date-time', example: '2026-09-24T10:00:00.000Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2026-09-24T10:00:00.000Z' },
        },
      },
      Character: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: 'e3b07384-d113-49d6-a246-24b5d2757279' },
          parentId: { type: 'string', format: 'uuid', example: 'd3b07384-d113-49d6-a246-24b5d2757279' },
          childId: { type: 'string', format: 'uuid', nullable: true, example: '76693be8-831c-41a7-bdaa-6e07fc5c6457' },
          name: { type: 'string', example: 'Bé Miu' },
          role: { type: 'string', enum: ['self', 'sibling', 'parent', 'relative', 'pet', 'toy'], example: 'self' },
          appearance: { type: 'string', example: 'Bé gái 5 tuổi tóc búi hai bên, đeo nơ hồng, mắt to tròn tinh nghịch' },
          portraitImageKey: { type: 'string', nullable: true, example: 'https://storage.supabase.co/.../miu_portrait.png' },
          genPrompt: { type: 'string', nullable: true, example: 'Portrait of Bé Miu...' },
          genSeed: { type: 'string', nullable: true, example: '123456789' },
          portraitStatus: { type: 'string', enum: ['none', 'queued', 'generating', 'ready', 'failed'], example: 'none' },
          createdAt: { type: 'string', format: 'date-time', example: '2026-09-24T10:00:00.000Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2026-09-24T10:00:00.000Z' },
          child: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              birthDate: { type: 'string', format: 'date' },
            },
          },
        },
      },
      ChildUsage: {
        type: 'object',
        properties: {
          childId: { type: 'string', format: 'uuid', example: '76693be8-831c-41a7-bdaa-6e07fc5c6457' },
          childName: { type: 'string', example: 'Bé Bo' },
          date: { type: 'string', format: 'date', example: '2026-09-24' },
          dailyLimitMinutes: { type: 'integer', example: 30 },
          usedMinutes: { type: 'integer', example: 15 },
          usedSeconds: { type: 'integer', example: 900 },
          remainingMinutes: { type: 'integer', example: 15 },
          isLimitReached: { type: 'boolean', example: false },
          sessionsCount: { type: 'integer', example: 1 },
          sessions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                startedAt: { type: 'string', format: 'date-time' },
                endedAt: { type: 'string', format: 'date-time' },
                durationSeconds: { type: 'integer', example: 900 },
              },
            },
          },
        },
      },
      EqSkill: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '841c1656-9de0-404d-ac91-4202335bf08f' },
          caselCode: {
            type: 'string',
            enum: ['self_awareness', 'self_management', 'social_awareness', 'relationship_skills', 'responsible_decision_making'],
            example: 'self_awareness',
          },
          nameVi: { type: 'string', example: 'Tự nhận thức' },
          nameEn: { type: 'string', example: 'Self-Awareness' },
          description: { type: 'string', example: 'Khả năng hiểu rõ cảm xúc, suy nghĩ và giá trị của bản thân...' },
          displayOrder: { type: 'integer', example: 1 },
          activeTemplatesCount: { type: 'integer', example: 3 },
        },
      },
      TemplateSlot: {
        type: 'object',
        properties: {
          slotKey: { type: 'string', example: '{CON}' },
          characterRole: { type: 'string', enum: ['self', 'sibling', 'parent', 'relative', 'pet', 'toy'], example: 'self' },
          defaultName: { type: 'string', example: 'Bé' },
        },
      },
      TemplateChoiceSignal: {
        type: 'object',
        properties: {
          skillId: { type: 'string', format: 'uuid' },
          delta: { type: 'integer', example: 2 },
          skill: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              caselCode: { type: 'string', example: 'relationship_skills' },
              nameVi: { type: 'string', example: 'Kỹ năng quan hệ' },
            },
          },
        },
      },
      TemplateChoiceType: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          choiceOrder: { type: 'integer', example: 1 },
          typeCode: { type: 'string', example: 'CHIA_SE_DOI_LUOT' },
          description: { type: 'string', example: 'Nhường bạn chơi trước 5 phút rồi đổi lượt cho nhau' },
          isProsocial: { type: 'boolean', example: true },
          choiceSignals: {
            type: 'array',
            items: { $ref: '#/components/schemas/TemplateChoiceSignal' },
          },
        },
      },
      TemplateStage: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          stageOrder: { type: 'integer', example: 1 },
          learningObjective: { type: 'string', example: 'Nhận diện niềm vui khi có món đồ chơi mới...' },
          emotionToName: { type: 'string', nullable: true, example: 'bực bội' },
          leadInPages: { type: 'integer', example: 2 },
          isClimax: { type: 'boolean', example: true },
          choiceTypes: {
            type: 'array',
            items: { $ref: '#/components/schemas/TemplateChoiceType' },
          },
        },
      },
      Template: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '3c7766ca-55cf-4c9d-aef1-5aaf1ee79772' },
          title: { type: 'string', example: 'Tập chia sẻ đồ chơi cùng bạn' },
          description: { type: 'string', example: 'Giúp bé nhận diện niềm vui khi chơi chung...' },
          primarySkill: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              caselCode: { type: 'string', example: 'relationship_skills' },
              nameVi: { type: 'string', example: 'Kỹ năng quan hệ' },
            },
          },
          ageMin: { type: 'integer', example: 4 },
          ageMax: { type: 'integer', example: 7 },
          status: { type: 'string', enum: ['draft', 'active', 'retired'], example: 'active' },
          slots: {
            type: 'array',
            items: { $ref: '#/components/schemas/TemplateSlot' },
          },
          stagesCount: { type: 'integer', example: 3 },
          storiesCount: { type: 'integer', example: 0 },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Kiểm tra trạng thái server',
        responses: {
          200: {
            description: 'Server hoạt động bình thường',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ---- AUTH ----
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Đăng ký tài khoản phụ huynh mới',
        description: 'Tạo tài khoản mới, khởi tạo ví tiền và tự động gửi email xác thực.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'email', 'password'],
                properties: {
                  username: { type: 'string', example: 'hoangnam', minLength: 3, maxLength: 50 },
                  email: { type: 'string', format: 'email', example: 'hoangnam@example.com' },
                  password: { type: 'string', minLength: 8, example: 'mypassword123' },
                  fullName: { type: 'string', example: 'Nguyễn Hoàng Nam' },
                  phone: { type: 'string', example: '0901234567' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Đăng ký thành công, trả về user và tokens',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            user: { $ref: '#/components/schemas/User' },
                            tokens: { $ref: '#/components/schemas/Tokens' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: { description: 'Dữ liệu không hợp lệ', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          409: { description: 'Email hoặc Username đã tồn tại', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },

    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Đăng nhập vào hệ thống',
        description: 'Cho phép đăng nhập bằng email hoặc username kèm theo mật khẩu.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['password'],
                properties: {
                  emailOrUsername: { type: 'string', example: 'hoangnam', description: 'Có thể điền email hoặc username' },
                  email: { type: 'string', format: 'email', example: 'hoangnam@example.com' },
                  username: { type: 'string', example: 'hoangnam' },
                  password: { type: 'string', example: 'mypassword123' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Đăng nhập thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            user: { $ref: '#/components/schemas/User' },
                            tokens: { $ref: '#/components/schemas/Tokens' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { description: 'Sai tài khoản hoặc mật khẩu', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },

    '/auth/refresh-tokens': {
      post: {
        tags: ['Auth'],
        summary: 'Làm mới token (Token Rotation)',
        description: 'Gửi refresh token cũ để nhận về cặp access token và refresh token mới.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string', example: '4a7b9c1d2e3f4a5b6c7d8e9f0a1b2c3d...' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Làm mới token thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            tokens: { $ref: '#/components/schemas/Tokens' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { description: 'Token không hợp lệ hoặc đã bị xoay vòng', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },

    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Đăng xuất khỏi hệ thống',
        description: 'Thu hồi refresh token.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string', example: '4a7b9c1d2e3f4a5b6c7d8e9f0a1b2c3d...' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Đăng xuất thành công', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
        },
      },
    },

    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Lấy thông tin tài khoản hiện tại',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Thông tin tài khoản và số dư ví',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            user: {
                              allOf: [
                                { $ref: '#/components/schemas/User' },
                                {
                                  properties: {
                                    wallet: {
                                      type: 'object',
                                      properties: {
                                        creditBalance: { type: 'integer', example: 0 },
                                        earningAvailableVnd: { type: 'string', example: '0' },
                                      },
                                    },
                                  },
                                },
                              ],
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { description: 'Chưa đăng nhập hoặc token hết hạn', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },

    // ---- KID MODE ----
    '/auth/kid-pin/set': {
      post: {
        tags: ['Kid Mode'],
        summary: 'Thiết lập mã PIN thoát Kid Mode lần đầu',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['pin'],
                properties: {
                  pin: { type: 'string', example: '1234', pattern: '^\\d{4,6}$', description: 'Mã PIN gồm 4 đến 6 chữ số' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cài đặt mã PIN thành công' },
          400: { description: 'Mã PIN đã được đặt trước đó (hãy dùng endpoint đổi PIN)' },
          401: { description: 'Chưa đăng nhập' },
        },
      },
    },

    '/auth/kid-pin/change': {
      put: {
        tags: ['Kid Mode'],
        summary: 'Thay đổi mã PIN thoát Kid Mode',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['newPin'],
                properties: {
                  currentPin: { type: 'string', example: '1234', description: 'Mã PIN hiện tại' },
                  password: { type: 'string', example: 'mypassword123', description: 'Hoặc nhập mật khẩu tài khoản nếu quên PIN' },
                  newPin: { type: 'string', example: '9876', pattern: '^\\d{4,6}$', description: 'Mã PIN mới gồm 4 đến 6 chữ số' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Đổi mã PIN thành công' },
          400: { description: 'Mã PIN cũ hoặc mật khẩu không chính xác' },
        },
      },
    },

    '/auth/kid-mode/enter': {
      post: {
        tags: ['Kid Mode'],
        summary: 'Chuyển sang Chế độ Trẻ em (Kid Mode)',
        security: [{ BearerAuth: [] }],
        description: 'Bắt buộc phụ huynh phải có mã PIN. Cấp token phiên `kid_session` có phạm vi đọc truyện của riêng bé.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['childId'],
                properties: {
                  childId: { type: 'string', format: 'uuid', example: '76693be8-831c-41a7-bdaa-6e07fc5c6457' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Vào Kid Mode thành công, trả về token phiên',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            child: { type: 'object' },
                            session: {
                              type: 'object',
                              properties: {
                                kidSessionToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
                                expiresIn: { type: 'string', example: '24h' },
                              },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          403: { description: 'Chưa cài đặt mã PIN bảo vệ' },
          404: { description: 'Không tìm thấy hồ sơ bé' },
        },
      },
    },

    '/auth/kid-mode/exit': {
      post: {
        tags: ['Kid Mode'],
        summary: 'Thoát Chế độ Trẻ em về Chế độ Phụ huynh',
        description: 'Nhập đúng mã PIN để đóng phiên đọc của bé và khôi phục quyền phụ huynh.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['pin'],
                properties: {
                  pin: { type: 'string', example: '9876', description: 'Mã PIN bảo vệ của phụ huynh' },
                  kidSessionToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...', description: 'Token phiên của bé (nếu không truyền qua Header)' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Thoát thành công, trả về bộ access token phụ huynh mới',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            tokens: { $ref: '#/components/schemas/Tokens' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { description: 'Sai mã PIN hoặc phiên của bé không hợp lệ' },
        },
      },
    },

    // ---- EMAIL VERIFICATION ----
    '/auth/send-verification-email': {
      post: {
        tags: ['Email Verification'],
        summary: 'Yêu cầu gửi lại email xác thực',
        description: 'Gửi link xác minh email qua Brevo. Có thể truyền email hoặc dùng Bearer token.',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email', example: 'hoangnam@example.com' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Email xác thực đã được gửi đi' },
          400: { description: 'Email đã được xác thực trước đó' },
        },
      },
    },

    '/auth/verify-email': {
      get: {
        tags: ['Email Verification'],
        summary: 'Xác thực Email qua link (dành cho trình duyệt)',
        parameters: [
          {
            name: 'token',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Token xác thực gửi trong email',
            example: 'a1b2c3d4e5f67890123456789abcdef0',
          },
        ],
        responses: {
          200: { description: 'Xác thực email thành công' },
          400: { description: 'Token không hợp lệ hoặc đã hết hạn' },
        },
      },
      post: {
        tags: ['Email Verification'],
        summary: 'Xác thực Email qua API (dành cho Mobile App / Frontend)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token'],
                properties: {
                  token: { type: 'string', example: 'a1b2c3d4e5f67890123456789abcdef0' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Xác thực email thành công' },
          400: { description: 'Token không hợp lệ hoặc đã hết hạn' },
        },
      },
    },

    // ---- CHILDREN PROFILES ----
    '/children': {
      get: {
        tags: ['Children'],
        summary: 'Lấy danh sách hồ sơ các bé của phụ huynh',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Danh sách hồ sơ bé',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            children: {
                              type: 'array',
                              items: { $ref: '#/components/schemas/Child' },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          401: { description: 'Chưa đăng nhập' },
        },
      },
      post: {
        tags: ['Children'],
        summary: 'Tạo hồ sơ bé mới',
        security: [{ BearerAuth: [] }],
        description: 'Tạo hồ sơ cho bé. Kiểm tra giới hạn số lượng bé theo gói cước (mặc định miễn phí 2 bé).',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'Bé Bo', description: 'Tên hoặc biệt danh của bé' },
                  birthDate: { type: 'string', format: 'date', example: '2019-05-10', description: 'Ngày sinh (YYYY-MM-DD)' },
                  dailyScreenTimeMinutes: { type: 'integer', example: 30, description: 'Thời gian màn hình tối đa trong ngày (phút)' },
                  bedtimeStart: { type: 'string', example: '21:00', description: 'Giờ bắt đầu đi ngủ (HH:mm)' },
                  bedtimeEnd: { type: 'string', example: '06:00', description: 'Giờ kết thúc đi ngủ (HH:mm)' },
                  preferredVoice: { type: 'string', example: 'northern_female', description: 'Giọng đọc AI ưa thích' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Tạo hồ sơ bé thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            child: { $ref: '#/components/schemas/Child' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: { description: 'Dữ liệu không hợp lệ' },
          403: { description: 'Đã đạt giới hạn số lượng bé theo gói dịch vụ' },
        },
      },
    },

    '/children/{id}': {
      get: {
        tags: ['Children'],
        summary: 'Lấy chi tiết hồ sơ một bé',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID hồ sơ bé',
            example: '76693be8-831c-41a7-bdaa-6e07fc5c6457',
          },
        ],
        responses: {
          200: {
            description: 'Chi tiết hồ sơ bé',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            child: { $ref: '#/components/schemas/Child' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          404: { description: 'Không tìm thấy hồ sơ bé' },
        },
      },
      put: {
        tags: ['Children'],
        summary: 'Cập nhật hồ sơ bé',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID hồ sơ bé',
            example: '76693be8-831c-41a7-bdaa-6e07fc5c6457',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Bé Bo Đẹp Trai' },
                  birthDate: { type: 'string', format: 'date', example: '2019-05-10' },
                  dailyScreenTimeMinutes: { type: 'integer', example: 45 },
                  bedtimeStart: { type: 'string', example: '21:30' },
                  bedtimeEnd: { type: 'string', example: '06:30' },
                  preferredVoice: { type: 'string', example: 'southern_female' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Cập nhật thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            child: { $ref: '#/components/schemas/Child' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          404: { description: 'Không tìm thấy hồ sơ bé' },
        },
      },
      delete: {
        tags: ['Children'],
        summary: 'Xóa hồ sơ bé (Soft delete)',
        security: [{ BearerAuth: [] }],
        description: 'Xóa mềm hồ sơ bé và đồng thời thu hồi mọi token phiên Kid Session đang hoạt động của bé.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID hồ sơ bé',
            example: '76693be8-831c-41a7-bdaa-6e07fc5c6457',
          },
        ],
        responses: {
          200: { description: 'Xóa hồ sơ bé thành công' },
          404: { description: 'Không tìm thấy hồ sơ bé' },
        },
      },
    },

    '/children/{id}/usage': {
      get: {
        tags: ['Children'],
        summary: 'Xem thống kê thời lượng sử dụng màn hình của bé',
        security: [{ BearerAuth: [] }],
        description: 'Truy vấn tổng thời lượng bé đã dùng trong ngày, so sánh với giới hạn quy định, tính toán thời gian còn lại.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID hồ sơ bé',
          },
          {
            name: 'date',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'date', example: '2026-09-24' },
            description: 'Ngày cần tra cứu (YYYY-MM-DD), mặc định là ngày hôm nay',
          },
        ],
        responses: {
          200: {
            description: 'Thống kê thời lượng sử dụng',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: { $ref: '#/components/schemas/ChildUsage' },
                      },
                    },
                  ],
                },
              },
            },
          },
          404: { description: 'Không tìm thấy hồ sơ bé' },
        },
      },
      post: {
        tags: ['Children'],
        summary: 'Ghi nhận thời lượng phiên sử dụng (khi bé đọc truyện/học)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID hồ sơ bé',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['durationSeconds'],
                properties: {
                  durationSeconds: { type: 'integer', example: 600, description: 'Thời lượng sử dụng tính bằng giây' },
                  startedAt: { type: 'string', format: 'date-time', description: 'Thời điểm bắt đầu phiên' },
                  endedAt: { type: 'string', format: 'date-time', description: 'Thời điểm kết thúc phiên' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Ghi nhận phiên sử dụng thành công' },
          404: { description: 'Không tìm thấy hồ sơ bé' },
        },
      },
    },
    '/characters': {
      post: {
        tags: ['Characters'],
        summary: 'Tạo nhân vật gia đình mới (áp dụng hạn ngạch gói, thuần mô tả chữ an toàn)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'role', 'appearance'],
                properties: {
                  name: { type: 'string', example: 'Bé Miu', description: 'Tên nhân vật' },
                  role: {
                    type: 'string',
                    enum: ['self', 'sibling', 'parent', 'relative', 'pet', 'toy'],
                    example: 'self',
                    description: 'Vai trò trong truyện',
                  },
                  appearance: {
                    type: 'string',
                    example: 'Bé gái 5 tuổi, tóc ngắn ngang vai màu đen cài nơ đỏ, mắt to tròn hay cười, mặc váy hoa',
                    description: 'Mô tả ngoại hình thuần văn bản (không tải ảnh thật của trẻ)',
                  },
                  childId: { type: 'string', format: 'uuid', description: 'Liên kết tới hồ sơ bé (nếu role là self/sibling)' },
                  portraitImageKey: { type: 'string', description: 'URL hoặc key ảnh chân dung (nếu có sẵn)' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Tạo nhân vật thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: {
                          properties: {
                            character: { $ref: '#/components/schemas/Character' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: { description: 'Dữ liệu không hợp lệ hoặc hồ sơ bé liên kết không đúng' },
          403: { description: 'Đã đạt giới hạn tối đa số nhân vật theo gói cước hiện tại' },
        },
      },
      get: {
        tags: ['Characters'],
        summary: 'Lấy danh sách nhân vật của phụ huynh (hỗ trợ lọc theo role hoặc childId)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'role',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['self', 'sibling', 'parent', 'relative', 'pet', 'toy'] },
            description: 'Lọc theo vai trò nhân vật',
          },
          {
            name: 'childId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
            description: 'Lọc theo ID hồ sơ bé liên kết',
          },
        ],
        responses: {
          200: {
            description: 'Lấy danh sách nhân vật thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: {
                          properties: {
                            characters: {
                              type: 'array',
                              items: { $ref: '#/components/schemas/Character' },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/characters/{id}': {
      get: {
        tags: ['Characters'],
        summary: 'Lấy thông tin chi tiết một nhân vật',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID nhân vật',
          },
        ],
        responses: {
          200: {
            description: 'Lấy chi tiết nhân vật thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: {
                          properties: {
                            character: { $ref: '#/components/schemas/Character' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          404: { description: 'Không tìm thấy nhân vật' },
        },
      },
      put: {
        tags: ['Characters'],
        summary: 'Cập nhật thông tin nhân vật',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID nhân vật',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Bé Miu Siêu Quậy' },
                  role: { type: 'string', enum: ['self', 'sibling', 'parent', 'relative', 'pet', 'toy'] },
                  appearance: { type: 'string', example: 'Tóc ngắn ngang vai cài nơ xanh, áo len sọc vàng' },
                  childId: { type: 'string', format: 'uuid', nullable: true },
                  portraitImageKey: { type: 'string', nullable: true },
                  portraitStatus: { type: 'string', enum: ['none', 'queued', 'generating', 'ready', 'failed'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật nhân vật thành công' },
          404: { description: 'Không tìm thấy nhân vật' },
        },
      },
      delete: {
        tags: ['Characters'],
        summary: 'Xóa mềm nhân vật',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID nhân vật',
          },
        ],
        responses: {
          200: { description: 'Xóa nhân vật thành công' },
          404: { description: 'Không tìm thấy nhân vật' },
        },
      },
    },
    '/characters/{id}/portrait': {
      post: {
        tags: ['Characters'],
        summary: 'Đưa yêu cầu sinh ảnh chân dung AI cho nhân vật vào hàng đợi',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID nhân vật',
          },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  style: {
                    type: 'string',
                    enum: ['pixar_3d', 'watercolor', 'anime', 'storybook_illustration', 'claymation'],
                    default: 'pixar_3d',
                    description: 'Phong cách nghệ thuật sinh ảnh',
                  },
                  customPrompt: {
                    type: 'string',
                    example: 'wearing a superhero cape, holding a small teddy bear',
                    description: 'Chi tiết bổ sung cho ảnh',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Đã đưa yêu cầu tạo chân dung vào hàng đợi',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: {
                          properties: {
                            character: { $ref: '#/components/schemas/Character' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          404: { description: 'Không tìm thấy nhân vật' },
        },
      },
    },
    '/eq-skills': {
      get: {
        tags: ['EQ Skills'],
        summary: 'Lấy danh mục 5 nhóm năng lực trí tuệ cảm xúc chuẩn quốc tế CASEL',
        parameters: [
          {
            name: 'search',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Tìm kiếm theo tên hoặc mô tả kỹ năng',
          },
        ],
        responses: {
          200: {
            description: 'Danh sách kỹ năng EQ thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: {
                          properties: {
                            skills: {
                              type: 'array',
                              items: { $ref: '#/components/schemas/EqSkill' },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/eq-skills/{id}': {
      get: {
        tags: ['EQ Skills'],
        summary: 'Xem chi tiết một kỹ năng EQ (chấp nhận UUID hoặc mã CASEL như self_awareness)',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'relationship_skills',
            description: 'UUID hoặc caselCode của kỹ năng',
          },
        ],
        responses: {
          200: {
            description: 'Lấy chi tiết kỹ năng EQ thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: {
                          properties: {
                            skill: { $ref: '#/components/schemas/EqSkill' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          404: { description: 'Không tìm thấy kỹ năng EQ' },
        },
      },
    },
    '/templates': {
      get: {
        tags: ['Templates'],
        summary: 'Kho kịch bản truyện mẫu sư phạm (hỗ trợ lọc theo kỹ năng EQ, độ tuổi, từ khóa)',
        parameters: [
          {
            name: 'primarySkillId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
            description: 'Lọc theo ID kỹ năng EQ chính',
          },
          {
            name: 'age',
            in: 'query',
            required: false,
            schema: { type: 'integer' },
            example: 5,
            description: 'Lọc kịch bản phù hợp với độ tuổi của bé (ageMin <= age <= ageMax)',
          },
          {
            name: 'search',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Tìm kiếm theo tiêu đề hoặc mô tả',
          },
          {
            name: 'status',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['draft', 'active', 'retired'], default: 'active' },
            description: 'Trạng thái kịch bản (mặc định active)',
          },
          {
            name: 'page',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 10 },
          },
        ],
        responses: {
          200: {
            description: 'Lấy danh sách kịch bản mẫu thành công',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string' },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Template' },
                    },
                    pagination: {
                      type: 'object',
                      properties: {
                        page: { type: 'integer' },
                        limit: { type: 'integer' },
                        total: { type: 'integer' },
                        totalPages: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Templates'],
        summary: 'Tạo kịch bản mẫu mới (với các vị trí nhân vật, các giai đoạn và các nhánh rẽ lựa chọn)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'primarySkillId', 'slots'],
                properties: {
                  title: { type: 'string', example: 'Học cách kiểm soát cơn giận' },
                  description: { type: 'string', example: 'Giúp bé nhận diện cơn giận và các cách hạ hỏa an toàn' },
                  primarySkillId: { type: 'string', format: 'uuid' },
                  ageMin: { type: 'integer', example: 4 },
                  ageMax: { type: 'integer', example: 7 },
                  status: { type: 'string', enum: ['draft', 'active', 'retired'], default: 'draft' },
                  slots: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/TemplateSlot' },
                  },
                  stages: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['stageOrder', 'learningObjective'],
                      properties: {
                        stageOrder: { type: 'integer', example: 1 },
                        learningObjective: { type: 'string', example: 'Nhận diện nhịp tim đập nhanh khi bực mình' },
                        emotionToName: { type: 'string', example: 'tức giận' },
                        leadInPages: { type: 'integer', example: 1 },
                        isClimax: { type: 'boolean', example: false },
                        choices: {
                          type: 'array',
                          items: {
                            type: 'object',
                            required: ['choiceOrder', 'typeCode', 'description'],
                            properties: {
                              choiceOrder: { type: 'integer', example: 1 },
                              typeCode: { type: 'string', example: 'DEM_TU_1_DEN_10' },
                              description: { type: 'string', example: 'Dừng lại và đếm thầm từ 1 đến 10' },
                              isProsocial: { type: 'boolean', example: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Tạo kịch bản mẫu thành công' },
          400: { description: 'Dữ liệu không hợp lệ' },
        },
      },
    },
    '/templates/{id}': {
      get: {
        tags: ['Templates'],
        summary: 'Xem chi tiết bộ kịch bản mẫu (bao gồm đầy đủ slots nhân vật, các giai đoạn và cây quyết định)',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID kịch bản mẫu',
          },
        ],
        responses: {
          200: {
            description: 'Lấy chi tiết kịch bản mẫu thành công',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/SuccessResponse' },
                    {
                      properties: {
                        data: {
                          properties: {
                            template: { $ref: '#/components/schemas/Template' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          404: { description: 'Không tìm thấy kịch bản mẫu' },
        },
      },
      put: {
        tags: ['Templates'],
        summary: 'Cập nhật thông tin hoặc trạng thái kịch bản mẫu (active/draft/retired)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID kịch bản mẫu',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  primarySkillId: { type: 'string', format: 'uuid' },
                  ageMin: { type: 'integer' },
                  ageMax: { type: 'integer' },
                  status: { type: 'string', enum: ['draft', 'active', 'retired'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật kịch bản mẫu thành công' },
          404: { description: 'Không tìm thấy kịch bản mẫu' },
        },
      },
      delete: {
        tags: ['Templates'],
        summary: 'Xóa hoặc chuyển kịch bản sang trạng thái ngưng dùng (retired nếu đã có truyện sử dụng)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID kịch bản mẫu',
          },
        ],
        responses: {
          200: { description: 'Xóa hoặc lưu trữ kịch bản mẫu thành công' },
          404: { description: 'Không tìm thấy kịch bản mẫu' },
        },
      },
    },
  },
};

export default swaggerSpec;
