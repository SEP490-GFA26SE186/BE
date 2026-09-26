import { env } from '../config/index.js';

const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'StoryWeaver AI - API Documentation',
    version: '1.0.0',
    description: `
**StoryWeaver AI** - Nền tảng sáng tác truyện tương tác cá nhân hóa và giáo dục trí tuệ cảm xúc (EQ) cho trẻ em.
API Backend cung cấp đầy đủ các chức năng quản lý tài khoản phụ huynh, bảo mật chế độ trẻ em (Kid Mode PIN & Session), xác thực email, và tích hợp cơ sở dữ liệu Supabase.

### Bảng Phân Quyền Truy Cập (Role-Based Access Control - RBAC)
Mỗi API endpoint đều được chú thích rõ vai trò và điều kiện truy cập:
- **[Public]**: Không yêu cầu đăng nhập. Bất kỳ ai cũng có thể truy cập (Health check, Login, Register, Xem danh mục EQ, Duyệt kịch bản mẫu...).
- **[Parent]**: Yêu cầu xác thực tài khoản Phụ huynh (\`parent\`, \`moderator\`, \`admin\`) qua Bearer Access Token.
- **[Kid Session | Parent]**: Dành cho phiên đọc Chế độ Trẻ em (\`kid_session\` token) hoặc tài khoản Phụ huynh.
- **[Moderator | Admin]**: Dành cho Kiểm duyệt viên và Quản trị viên (\`moderator\`, \`admin\`) quản lý nội dung sư phạm, duyệt chợ truyện.
- **[Admin]**: Dành riêng cho Quản trị viên cấp cao (\`admin\`) quản trị cấu hình hệ thống và xóa dữ liệu nhạy cảm.
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
    { name: 'Stories', description: 'Sáng tác truyện, quản lý trang, lựa chọn rẽ nhánh và chế độ kiểm duyệt phụ huynh' },
    { name: 'Content Library', description: 'Thư viện tài nguyên sư phạm: ảnh nền mặc định, âm thanh UI, tiêu chuẩn kiểm duyệt và cấu hình kịch bản' },
    { name: 'Bookshelf', description: 'Quản lý kệ sách cá nhân của bé và theo dõi tiến độ đọc truyện' },
    { name: 'Reading Sessions', description: 'Phiên đọc truyện tương tác, lựa chọn nhánh rẽ cảm xúc và đánh giá chỉ số EQ' },
    { name: 'Marketplace', description: 'Chợ truyện cộng đồng: hồ sơ tác giả, đăng bán, nhận miễn phí và đánh giá sản phẩm' },
    { name: 'Moderation', description: 'Kiểm duyệt an toàn nội dung, từ khóa cấm, duyệt tác phẩm và báo cáo vi phạm' },
    { name: 'Plans & Subscriptions', description: 'Gói thành viên, định mức tạo truyện/chân dung AI và quyền lợi tài khoản' },
    { name: 'Credit Packs', description: 'Gói nạp xu (Credit Packs) bổ sung lượt tạo AI linh hoạt' },
    { name: 'Wallets & Financials', description: 'Ví xu phụ huynh, số dư thu nhập tác giả (Seller Wallet), sổ cái giao dịch và yêu cầu rút tiền' },
    { name: 'Notifications', description: 'Hệ thống thông báo đẩy cho người dùng (kết quả duyệt, mua hàng, gậy cảnh cáo, biến động số dư)' },
    { name: 'Reports & Supervision', description: 'Báo cáo EQ biểu đồ radar, tiến trình học tập và giám sát nền tảng' },
    { name: 'Platform & Audit Logs', description: 'Cài đặt tham số hệ thống và nhật ký kiểm toán quản trị' },
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
        summary: '[Public] Kiểm tra trạng thái server',
        description: '**Quyền truy cập:** `Public` (Không yêu cầu đăng nhập).\nKiểm tra trạng thái hoạt động của server và database connectivity.',
        security: [],
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
        summary: '[Public] Đăng ký tài khoản phụ huynh mới',
        description: '**Quyền truy cập:** `Public` (Không yêu cầu đăng nhập).\nTạo tài khoản mới, khởi tạo ví tiền và tự động gửi email xác thực qua Brevo.',
        security: [],
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
        summary: '[Public] Đăng nhập vào hệ thống',
        description: '**Quyền truy cập:** `Public` (Không yêu cầu đăng nhập).\nCho phép đăng nhập bằng email hoặc username kèm theo mật khẩu.',
        security: [],
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
        summary: '[Public] Làm mới token (Token Rotation)',
        description: '**Quyền truy cập:** `Public` (Cần refreshToken trong body).\nGửi refresh token cũ để nhận về cặp access token và refresh token mới.',
        security: [],
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
        summary: '[Public] Đăng xuất khỏi hệ thống',
        description: '**Quyền truy cập:** `Public` (Cần refreshToken trong body).\nVô hiệu hóa và thu hồi refresh token hiện tại.',
        security: [],
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
        summary: '[Parent | Moderator | Admin] Lấy thông tin tài khoản hiện tại',
        description: '**Quyền truy cập:** Đã đăng nhập (`parent`, `moderator`, `admin`).\nLấy thông tin tài khoản đang đăng nhập kèm số dư ví credit/earning.',
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
        summary: '[Parent] Thiết lập mã PIN thoát Kid Mode lần đầu',
        description: '**Quyền truy cập:** `parent` | `admin`.\nThiết lập mã PIN (4-6 chữ số) lần đầu dùng để khóa và thoát khỏi Chế độ Trẻ em.',
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
        summary: '[Parent] Thay đổi mã PIN thoát Kid Mode',
        description: '**Quyền truy cập:** `parent` | `admin`.\nThay đổi mã PIN thoát Kid Mode (yêu cầu mã PIN hiện tại hoặc mật khẩu phụ huynh).',
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
        summary: '[Parent] Chuyển sang Chế độ Trẻ em (Kid Mode)',
        description: '**Quyền truy cập:** `parent` | `admin`.\nKích hoạt Chế độ Trẻ em cho một bé cụ thể, sinh ra token phiên làm việc `kid_session` giới hạn quyền.',
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
        summary: '[Kid Session | Parent] Thoát Chế độ Trẻ em về Chế độ Phụ huynh',
        description: '**Quyền truy cập:** Phiên đọc bé (`kid_session`) hoặc Phụ huynh.\nThoát khỏi Chế độ Trẻ em về Chế độ Phụ huynh bằng cách xác thực mã PIN thoát (4-6 chữ số).',
        security: [],
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
        summary: '[Public] Yêu cầu gửi lại email xác thực',
        description: '**Quyền truy cập:** `Public` (Không yêu cầu đăng nhập).\nYêu cầu gửi lại liên kết kích hoạt tài khoản qua dịch vụ Brevo transactional email.',
        security: [],
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
        summary: '[Public] Xác thực Email qua link (dành cho trình duyệt)',
        description: '**Quyền truy cập:** `Public` (Không yêu cầu đăng nhập).\nNhấp link trong email để kích hoạt tài khoản, hiển thị giao diện HTML thân thiện.',
        security: [],
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
        summary: '[Public] Xác thực Email qua API (dành cho Mobile App / Frontend)',
        description: '**Quyền truy cập:** `Public` (Không yêu cầu đăng nhập).\nGửi token xác thực email qua JSON body để nhận kết quả dạng REST API chuẩn.',
        security: [],
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
        summary: '[Parent] Lấy danh sách hồ sơ các bé của phụ huynh',
        description: '**Quyền truy cập:** `parent` | `admin`.\nLấy danh sách toàn bộ hồ sơ các bé thuộc tài khoản phụ huynh hiện tại.',
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
        summary: '[Parent] Tạo hồ sơ bé mới',
        description: '**Quyền truy cập:** `parent` | `admin`.\nTạo hồ sơ bé mới (tự động kiểm tra hạn ngạch gói cước, miễn phí tối đa 2 bé).',
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
        summary: '[Parent] Lấy chi tiết hồ sơ một bé',
        description: '**Quyền truy cập:** `parent` | `admin` (Chính chủ sở hữu hồ sơ bé).\nXem chi tiết hồ sơ bé kèm cấu hình giờ đi ngủ và hạn mức màn hình.',
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
        summary: '[Parent] Cập nhật hồ sơ bé',
        description: '**Quyền truy cập:** `parent` | `admin` (Chính chủ sở hữu hồ sơ bé).\nCập nhật thông tin bé, giờ đi ngủ, giọng đọc ưa thích hoặc giới hạn màn hình.',
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
        summary: '[Parent] Xóa hồ sơ bé (Soft delete)',
        description: '**Quyền truy cập:** `parent` | `admin` (Chính chủ sở hữu hồ sơ bé).\nXóa mềm hồ sơ bé và tự động thu hồi mọi phiên đọc truyện đang hoạt động.',
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
        summary: '[Kid Session | Parent] Xem thống kê thời lượng sử dụng màn hình của bé',
        description: '**Quyền truy cập:** `parent` hoặc phiên `kid_session`.\nXem thống kê thời lượng sử dụng màn hình trong ngày của bé, số phút còn lại và cảnh báo giờ đi ngủ.',
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
        summary: '[Kid Session | Parent] Ghi nhận thời lượng phiên sử dụng',
        description: '**Quyền truy cập:** `parent` hoặc phiên `kid_session`.\nGhi nhận thêm số phút đọc truyện của bé vào hệ thống kiểm soát thời gian sử dụng.',
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

    '/children/{id}/overview': {
      get: {
        tags: ['Children'],
        summary: '[Parent] Xem tổng quan bảng điều khiển của bé (Dashboard Overview)',
        description: 'Tổng hợp toàn diện thông tin bé: hồ sơ, tuổi tính theo ngày sinh, nhân vật đại diện (self character), thời lượng màn hình hôm nay, trạng thái giờ đi ngủ, thống kê kệ sách, truyện đang đọc dở và biểu đồ radar 5 năng lực EQ.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'ID hồ sơ bé' },
        ],
        responses: {
          200: { description: 'Tổng quan hồ sơ và tiến độ học tập của bé' },
          404: { description: 'Không tìm thấy hồ sơ bé' },
        },
      },
    },

    '/children/{id}/avatar': {
      put: {
        tags: ['Children'],
        summary: '[Parent] Cập nhật chân dung / ngoại hình đại diện của bé',
        description: 'Cập nhật ảnh đại diện và mô tả ngoại hình nhân vật `self` của bé dùng làm ảnh tham chiếu khi vẽ truyện.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'ID hồ sơ bé' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  appearance: { type: 'string', example: 'Bé trai 6 tuổi, tóc cắt ngắn, mắt to tròn, mặc áo thun xanh' },
                  portraitImageKey: { type: 'string', example: 'characters/portraits/be-bo-avatar.webp' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật avatar thành công' },
          404: { description: 'Không tìm thấy hồ sơ bé' },
        },
      },
    },

    '/children/{id}/eq-report': {
      get: {
        tags: ['Children'],
        summary: '[Parent] Báo cáo 5 nhóm năng lực cảm xúc EQ của bé (Radar Chart)',
        description: 'Tổng hợp điểm số tích lũy từ các lựa chọn rẽ nhánh trong các câu chuyện bé đã đọc, phân bổ theo 5 năng lực CASEL: Tự nhận thức, Tự quản lý, Nhận thức xã hội, Kỹ năng quan hệ, Ra quyết định có trách nhiệm.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'ID hồ sơ bé' },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Ngày bắt đầu (YYYY-MM-DD)' },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Ngày kết thúc (YYYY-MM-DD)' },
        ],
        responses: {
          200: { description: 'Báo cáo điểm số EQ và tỷ lệ phần trăm theo năng lực' },
          404: { description: 'Không tìm thấy hồ sơ bé' },
        },
      },
    },

    '/children/{id}/bookshelf': {
      get: {
        tags: ['Children'],
        summary: '[Parent] Lấy danh sách truyện trên kệ sách của riêng bé',
        description: 'Truy vấn nhanh kệ sách của bé mà không cần truyền query childId qua `/bookshelf`.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'ID hồ sơ bé' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Danh sách truyện trên kệ sách' },
          404: { description: 'Không tìm thấy hồ sơ bé' },
        },
      },
    },

    '/characters': {
      post: {
        tags: ['Characters'],
        summary: '[Parent] Tạo nhân vật gia đình mới',
        description: '**Quyền truy cập:** `parent` | `admin`.\nTạo nhân vật gia đình mới từ mô tả chữ an toàn, liên kết với bé (tối đa 5 nhân vật với gói miễn phí).',
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
        summary: '[Parent] Lấy danh sách nhân vật của phụ huynh',
        description: '**Quyền truy cập:** `parent` | `admin`.\nLấy danh sách nhân vật gia đình của phụ huynh (hỗ trợ lọc theo vai trò role hoặc theo bé childId).',
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
        summary: '[Parent] Lấy thông tin chi tiết một nhân vật',
        description: '**Quyền truy cập:** `parent` | `admin` (Chính chủ sở hữu nhân vật).\nXem chi tiết nhân vật gia đình, mô tả ngoại hình và trạng thái ảnh đại diện AI.',
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
        summary: '[Parent] Cập nhật thông tin nhân vật',
        description: '**Quyền truy cập:** `parent` | `admin` (Chính chủ sở hữu nhân vật).\nCập nhật tên gọi, vai trò hoặc đặc điểm nhận dạng của nhân vật.',
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
        summary: '[Parent] Xóa mềm nhân vật',
        description: '**Quyền truy cập:** `parent` | `admin` (Chính chủ sở hữu nhân vật).\nXóa mềm nhân vật khỏi danh sách gia đình.',
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
        summary: '[Parent] Đưa yêu cầu sinh ảnh chân dung AI cho nhân vật vào hàng đợi',
        description: '**Quyền truy cập:** `parent` | `admin`.\nGửi yêu cầu sinh ảnh chân dung AI cho nhân vật vào hàng đợi AI Request Queue (`character_portrait`).',
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
        summary: '[Public] Lấy danh mục 5 nhóm năng lực trí tuệ cảm xúc chuẩn quốc tế CASEL',
        description: '**Quyền truy cập:** `Public` (Không yêu cầu đăng nhập).\nLấy danh mục 5 nhóm năng lực trí tuệ cảm xúc chuẩn quốc tế CASEL kèm số lượng kịch bản truyện mẫu liên quan.',
        security: [],
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
        summary: '[Public] Xem chi tiết một kỹ năng EQ',
        description: '**Quyền truy cập:** `Public` (Không yêu cầu đăng nhập).\nXem chi tiết một nhóm kỹ năng EQ chuẩn CASEL (chấp nhận UUID hoặc mã CASEL như self_awareness, social_awareness...).',
        security: [],
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
        summary: '[Public] Kho kịch bản truyện mẫu sư phạm',
        description: '**Quyền truy cập:** `Public` (Không yêu cầu đăng nhập).\nDuyệt kho kịch bản truyện mẫu sư phạm đang hoạt động (`active`), hỗ trợ tìm kiếm và lọc theo kỹ năng EQ, độ tuổi mục tiêu.',
        security: [],
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
        summary: '[Moderator | Admin] Tạo kịch bản mẫu mới',
        description: '**Quyền truy cập:** `moderator` | `admin` (Yêu cầu tài khoản có quyền Quản trị hoặc Kiểm duyệt viên).\nTạo mới kịch bản truyện mẫu sư phạm bao gồm các vị trí thế vai nhân vật (slots), các hồi/giai đoạn (stages) và cây quyết định cảm xúc (choices & signals).',
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
        summary: '[Public] Xem chi tiết bộ kịch bản mẫu',
        description: '**Quyền truy cập:** `Public` (Không yêu cầu đăng nhập).\nXem chi tiết toàn bộ kịch bản truyện mẫu bao gồm các slots nhân vật, các giai đoạn và cây quyết định cảm xúc.',
        security: [],
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
        summary: '[Moderator | Admin] Cập nhật thông tin hoặc trạng thái kịch bản mẫu',
        description: '**Quyền truy cập:** `moderator` | `admin` (Yêu cầu tài khoản có quyền Quản trị hoặc Kiểm duyệt viên).\nChỉnh sửa thông tin kịch bản truyện mẫu, hoặc cập nhật trạng thái hoạt động (`draft` / `active` / `retired`).',
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
        summary: '[Admin] Xóa hoặc ngưng dùng kịch bản mẫu',
        description: '**Quyền truy cập:** `admin` (Dành riêng cho Quản trị viên cấp cao).\nXóa kịch bản truyện mẫu (nếu đã có truyện phát sinh sẽ tự động chuyển sang trạng thái ngưng dùng `retired` để bảo toàn dữ liệu).',
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

    // ---- BOOKSHELF ----
    '/bookshelf': {
      get: {
        tags: ['Bookshelf'],
        summary: '[Parent | Kid Session] Lấy danh sách truyện trên kệ sách của bé',
        description: '**Quyền truy cập:** `parent`, `admin`, hoặc phiên đọc `kid_session`.\nLấy toàn bộ truyện trên kệ sách của bé kèm tiến độ đọc mới nhất (phần trăm hoàn thành, trang đang đọc dở).',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'childId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID hồ sơ bé',
          },
          {
            name: 'search',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Tìm kiếm theo tên truyện',
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
          200: { description: 'Lấy danh sách kệ sách thành công' },
          400: { description: 'Dữ liệu không hợp lệ' },
          401: { description: 'Chưa đăng nhập' },
          404: { description: 'Không tìm thấy hồ sơ bé' },
        },
      },
      post: {
        tags: ['Bookshelf'],
        summary: '[Parent] Thêm truyện vào kệ sách của bé',
        description: '**Quyền truy cập:** `parent`, `admin`.\nThêm một câu chuyện vào kệ sách cá nhân của bé.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['childId', 'storyId'],
                properties: {
                  childId: { type: 'string', format: 'uuid' },
                  storyId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Thêm truyện vào kệ sách thành công' },
          404: { description: 'Không tìm thấy hồ sơ bé hoặc truyện' },
        },
      },
    },

    '/bookshelf/check/{storyId}': {
      get: {
        tags: ['Bookshelf'],
        summary: '[Parent | Kid Session] Kiểm tra truyện đã có trên kệ sách của bé chưa',
        description: '**Quyền truy cập:** `parent`, `admin`, hoặc phiên đọc `kid_session`.\nKiểm tra xem truyện đã được thêm vào kệ sách của bé hay chưa.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'storyId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID câu chuyện',
          },
          {
            name: 'childId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID hồ sơ bé',
          },
        ],
        responses: {
          200: { description: 'Kiểm tra trạng thái kệ sách thành công' },
        },
      },
    },

    '/bookshelf/{storyId}': {
      delete: {
        tags: ['Bookshelf'],
        summary: '[Parent] Xóa truyện khỏi kệ sách của bé',
        description: '**Quyền truy cập:** `parent`, `admin`.\nXóa một câu chuyện khỏi kệ sách của bé (không làm mất lịch sử đọc truyện đã ghi nhận).',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'storyId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID câu chuyện',
          },
          {
            name: 'childId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID hồ sơ bé',
          },
        ],
        responses: {
          200: { description: 'Xóa truyện khỏi kệ sách thành công' },
          404: { description: 'Truyện không có trên kệ sách' },
        },
      },
    },

    // ---- READING SESSIONS ----
    '/reading-sessions/start': {
      post: {
        tags: ['Reading Sessions'],
        summary: '[Parent | Kid Session] Bắt đầu hoặc tiếp tục phiên đọc truyện tương tác',
        description: '**Quyền truy cập:** `parent` hoặc phiên `kid_session`.\nKhởi động phiên đọc truyện cho bé. Nếu đã có phiên dở dang (`in_progress`) sẽ tự động tiếp tục trang đang đọc; nếu chọn `isReplay: true` sẽ bắt đầu lại từ trang đầu tiên.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['childId', 'storyId'],
                properties: {
                  childId: { type: 'string', format: 'uuid' },
                  storyId: { type: 'string', format: 'uuid' },
                  isReplay: { type: 'boolean', default: false, description: 'Đọc lại từ đầu' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Khởi động phiên đọc truyện thành công' },
          400: { description: 'Truyện chưa có nội dung trang' },
          404: { description: 'Không tìm thấy hồ sơ bé hoặc câu chuyện' },
        },
      },
    },

    '/reading-sessions/{sessionId}': {
      get: {
        tags: ['Reading Sessions'],
        summary: '[Parent | Kid Session] Lấy trạng thái chi tiết phiên đọc truyện',
        description: '**Quyền truy cập:** `parent` hoặc phiên `kid_session`.\nXem thông tin trang hiện tại, các lựa chọn rẽ nhánh, tiến độ và lịch sử các quyết định đã chọn trong phiên.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'sessionId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID phiên đọc truyện',
          },
        ],
        responses: {
          200: { description: 'Lấy trạng thái phiên đọc thành công' },
          404: { description: 'Không tìm thấy phiên đọc' },
        },
      },
    },

    '/reading-sessions/{sessionId}/choice': {
      post: {
        tags: ['Reading Sessions'],
        summary: '[Kid Session | Parent] Bé chọn phương án xử lý tình huống cảm xúc',
        description: '**Quyền truy cập:** `kid_session` hoặc `parent`.\nGhi nhận lựa chọn của bé tại nhánh rẽ tình huống. Hệ thống sẽ điều hướng đến trang hệ quả tương ứng, hoặc hoàn thành truyện và tự động tính toán chỉ số EQ.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'sessionId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID phiên đọc truyện',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['pageId', 'choiceId'],
                properties: {
                  pageId: { type: 'string', format: 'uuid', description: 'ID trang hiện tại' },
                  choiceId: { type: 'string', format: 'uuid', description: 'ID nhánh rẽ bé lựa chọn' },
                  timeToDecideMs: { type: 'integer', example: 3500, description: 'Thời gian bé suy nghĩ (mili-giây)' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Ghi nhận lựa chọn thành công và trả về trang tiếp theo hoặc kết quả EQ' },
          400: { description: 'Phiên đọc đã kết thúc hoặc sai ID trang' },
          404: { description: 'Không tìm thấy lựa chọn tương ứng' },
        },
      },
    },

    '/reading-sessions/{sessionId}/complete': {
      post: {
        tags: ['Reading Sessions'],
        summary: '[Parent | Kid Session] Hoàn thành phiên đọc và nhận báo cáo đánh giá EQ',
        description: '**Quyền truy cập:** `parent` hoặc phiên `kid_session`.\nĐánh dấu kết thúc phiên đọc truyện, tổng hợp điểm số 5 năng lực EQ chuẩn CASEL và tự động tích lũy thời gian sử dụng màn hình của bé.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'sessionId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID phiên đọc truyện',
          },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  durationSeconds: { type: 'integer', example: 120, description: 'Thời lượng phiên đọc (giây)' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Hoàn thành phiên đọc và tạo báo cáo EQ thành công' },
          404: { description: 'Không tìm thấy phiên đọc' },
        },
      },
    },

    '/reading-sessions/child/{childId}/history': {
      get: {
        tags: ['Reading Sessions'],
        summary: '[Parent | Kid Session] Xem lịch sử các phiên đọc truyện của bé',
        description: '**Quyền truy cập:** `parent` hoặc phiên `kid_session`.\nLấy danh sách các câu chuyện bé đã đọc, số lượng lựa chọn cảm xúc đã đưa ra và điểm số EQ đạt được qua từng phiên.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'childId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'ID hồ sơ bé',
          },
          {
            name: 'status',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['in_progress', 'completed', 'abandoned'] },
            description: 'Lọc theo trạng thái phiên đọc',
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
          200: { description: 'Lấy lịch sử đọc truyện của bé thành công' },
          404: { description: 'Không tìm thấy hồ sơ bé' },
        },
      },
    },

    // ---- MARKETPLACE ----
    '/marketplace/price-tiers': {
      get: {
        tags: ['Marketplace'],
        summary: '[Public] Xem danh sách các mức giá bán niêm yết',
        description: '**Quyền truy cập:** `Public` (Không yêu cầu đăng nhập).\nXem toàn bộ các mức giá niêm yết cho phép tác giả đặt giá khi xuất bản truyện (kèm mốc 0 VND miễn phí).',
        security: [],
        responses: {
          200: { description: 'Lấy danh sách các khung giá thành công' },
        },
      },
    },

    '/marketplace/listings': {
      get: {
        tags: ['Marketplace'],
        summary: '[Public] Khám phá thư viện truyện cộng đồng',
        description: '**Quyền truy cập:** `Public` (Không yêu cầu đăng nhập).\nTìm kiếm và lọc các tác phẩm truyện đã qua kiểm duyệt sư phạm, lọc theo kỹ năng EQ, độ tuổi mục tiêu, miễn phí/trả phí, sắp xếp theo lượt mua, đánh giá hoặc ngày đăng.',
        security: [],
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Tìm theo tiêu đề hoặc mô tả' },
          { name: 'skillId', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Lọc theo ID kỹ năng EQ' },
          { name: 'age', in: 'query', schema: { type: 'integer' }, description: 'Lọc theo độ tuổi của bé' },
          { name: 'isFree', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Lọc truyện miễn phí' },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['newest', 'rating', 'popular', 'price_asc', 'price_desc'], default: 'newest' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: { description: 'Lấy danh sách truyện chợ cộng đồng thành công' },
        },
      },
    },

    '/marketplace/listings/{id}': {
      get: {
        tags: ['Marketplace'],
        summary: '[Public] Xem chi tiết tác phẩm truyện trên chợ',
        description: '**Quyền truy cập:** `Public` (Nếu đã đăng nhập sẽ tự động kiểm tra quyền sở hữu `isOwned`).\nXem chi tiết thông tin truyện, tác giả, mức giá, số lượt tải/mua và điểm đánh giá trung bình.',
        security: [],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Lấy chi tiết tác phẩm thành công' },
          404: { description: 'Không tìm thấy tác phẩm' },
        },
      },
    },

    '/marketplace/listings/{id}/reviews': {
      get: {
        tags: ['Marketplace'],
        summary: '[Public] Xem các đánh giá nhận xét của tác phẩm',
        description: '**Quyền truy cập:** `Public` (Không yêu cầu đăng nhập).\nXem toàn bộ nhận xét, số sao đánh giá (1-5★) và phản hồi từ tác giả.',
        security: [],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Lấy danh sách đánh giá thành công' },
        },
      },
    },

    '/marketplace/seller/register': {
      post: {
        tags: ['Marketplace'],
        summary: '[Parent] Đăng ký trở thành tác giả cộng đồng',
        description: '**Quyền truy cập:** `parent`.\nNộp hồ sơ trở thành Tác giả kể chuyện (bút danh, tiểu sử, chuyên môn và thông tin nhận nhuận bút ngân hàng).',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['displayName'],
                properties: {
                  displayName: { type: 'string', example: 'Cô Mai Kể Chuyện' },
                  bio: { type: 'string', example: 'Giáo viên mầm non với tình yêu thương trẻ thơ' },
                  expertise: { type: 'string', example: 'Giáo dục mầm non, tâm lý trẻ em' },
                  bankName: { type: 'string', example: 'Vietcombank' },
                  bankAccountNumber: { type: 'string', example: '0123456789' },
                  bankAccountHolder: { type: 'string', example: 'NGUYEN THI MAI' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Nộp hồ sơ tác giả thành công, chờ kiểm duyệt' },
          400: { description: 'Bạn đã đăng ký tác giả trước đó' },
        },
      },
    },

    '/marketplace/seller/me': {
      get: {
        tags: ['Marketplace'],
        summary: '[Parent] Xem hồ sơ tác giả của mình',
        description: '**Quyền truy cập:** `parent`.\nXem trạng thái duyệt tác giả (pending/approved/suspended), số lượng tác phẩm và điểm đánh giá tích lũy.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Lấy hồ sơ tác giả thành công' },
        },
      },
      put: {
        tags: ['Marketplace'],
        summary: '[Parent] Cập nhật thông tin tác giả và tài khoản ngân hàng',
        description: '**Quyền truy cập:** `parent`.\nChỉnh sửa bút danh, tiểu sử hoặc tài khoản ngân hàng nhận tiền rút nhuận bút.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  displayName: { type: 'string' },
                  bio: { type: 'string' },
                  expertise: { type: 'string' },
                  bankName: { type: 'string' },
                  bankAccountNumber: { type: 'string' },
                  bankAccountHolder: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật hồ sơ tác giả thành công' },
          404: { description: 'Chưa có hồ sơ tác giả' },
        },
      },
    },

    '/marketplace/seller/my-listings': {
      get: {
        tags: ['Marketplace'],
        summary: '[Parent] Xem danh sách các tác phẩm đăng bán của tác giả',
        description: '**Quyền truy cập:** `parent` (Tác giả đã đăng ký).\nXem các tác phẩm đã đăng bán cùng trạng thái duyệt (submitted, in_review, published, changes_requested, rejected).',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Lấy danh sách tác phẩm của tác giả thành công' },
        },
      },
    },

    '/marketplace/listings': {
      post: {
        tags: ['Marketplace'],
        summary: '[Parent] Đăng bán tác phẩm truyện lên chợ (chờ kiểm duyệt)',
        description: '**Quyền truy cập:** `parent` (Tác giả đã được duyệt `approved`).\nĐăng tải câu chuyện lên chợ cộng đồng kèm định mức giá. Hệ thống sẽ tự động đưa vào hàng đợi kiểm duyệt sư phạm.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['publishedStoryId', 'priceTierId', 'title'],
                properties: {
                  publishedStoryId: { type: 'string', format: 'uuid' },
                  priceTierId: { type: 'string', format: 'uuid' },
                  title: { type: 'string', example: 'Chú Thỏ Trắng Biết Lắng Nghe' },
                  description: { type: 'string' },
                  coverImageKey: { type: 'string' },
                  hasAiContent: { type: 'boolean', default: false },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Nộp tác phẩm lên chợ thành công, đang chờ duyệt' },
          403: { description: 'Tài khoản chưa được duyệt làm tác giả' },
          409: { description: 'Truyện này đã được đăng bán trước đó' },
        },
      },
    },

    '/marketplace/listings/{id}/claim-free': {
      post: {
        tags: ['Marketplace'],
        summary: '[Parent] Nhận câu chuyện miễn phí vào thư viện sở hữu',
        description: '**Quyền truy cập:** `parent`.\nNhận quyền đọc trọn đời cho một câu chuyện miễn phí (0 VND) trên chợ vào thư viện (`Entitlement`).',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Nhận truyện miễn phí vào thư viện thành công' },
          400: { description: 'Truyện này có phí, vui lòng đặt mua qua giỏ hàng' },
        },
      },
    },

    '/marketplace/listings/{id}/reviews': {
      post: {
        tags: ['Marketplace'],
        summary: '[Parent] Đánh giá và nhận xét tác phẩm truyện',
        description: '**Quyền truy cập:** `parent` (Đã sở hữu quyền đọc truyện).\nChấm điểm sao (1-5★), bình luận và gắn các nhãn khen ngợi sư phạm (`child_liked`, `clear_lesson`...).',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['rating'],
                properties: {
                  rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
                  comment: { type: 'string', example: 'Bé rất thích tranh vẽ và bài học chia sẻ này!' },
                  tags: {
                    type: 'array',
                    items: {
                      type: 'string',
                      enum: ['child_liked', 'age_appropriate', 'clear_lesson', 'beautiful_art', 'good_narration'],
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Gửi đánh giá nhận xét thành công' },
          403: { description: 'Bạn cần sở hữu truyện trước khi đánh giá' },
        },
      },
    },

    '/marketplace/reviews/{reviewId}/reply': {
      post: {
        tags: ['Marketplace'],
        summary: '[Parent] Tác giả phản hồi nhận xét của độc giả',
        description: '**Quyền truy cập:** `parent` (Chính chủ tác giả của câu chuyện).\nViết lời cảm ơn hoặc phản hồi trao đổi với phụ huynh dưới phần bình luận.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'reviewId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reply'],
                properties: {
                  reply: { type: 'string', example: 'Cảm ơn mẹ và bé đã ủng hộ tác phẩm ạ!' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Đăng phản hồi thành công' },
          403: { description: 'Chỉ tác giả của câu chuyện mới được quyền phản hồi' },
        },
      },
    },

    // ---- MODERATION & SAFETY ----
    '/moderation/checklist-items': {
      get: {
        tags: ['Moderation'],
        summary: '[Public] Xem 7 tiêu chí sư phạm dùng để duyệt truyện',
        description: '**Quyền truy cập:** `Public` (Không yêu cầu đăng nhập).\nXem danh sách 7 nguyên tắc sư phạm an toàn cho trẻ em được áp dụng khi kiểm duyệt nội dung cộng đồng.',
        security: [],
        responses: {
          200: { description: 'Lấy danh sách 7 tiêu chí sư phạm thành công' },
        },
      },
    },

    '/moderation/check-text': {
      post: {
        tags: ['Moderation'],
        summary: '[Public] Kiểm tra văn bản nhanh với bộ từ khóa cấm',
        description: '**Quyền truy cập:** `Public` (Không yêu cầu đăng nhập).\nQuét nhanh văn bản truyện xem có chứa từ khóa thô tục, bạo lực hay nhạy cảm không.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['text'],
                properties: {
                  text: { type: 'string', example: 'Nội dung truyện cần kiểm tra độ an toàn' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Kiểm tra độ sạch của văn bản thành công' },
        },
      },
    },

    '/moderation/reports': {
      post: {
        tags: ['Moderation'],
        summary: '[Parent] Gửi báo cáo nội dung vi phạm hoặc bài học không phù hợp',
        description: '**Quyền truy cập:** `parent`.\nPhụ huynh gửi báo cáo vi phạm tác phẩm hoặc nhận xét (danh mục: đáng sợ, bạo lực, bài học sai lệch...). Nếu 1 truyện nhận >= 3 báo cáo trong 24h sẽ tự động tạm đình chỉ.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['category'],
                properties: {
                  listingId: { type: 'string', format: 'uuid' },
                  pageId: { type: 'string', format: 'uuid' },
                  productReviewId: { type: 'string', format: 'uuid' },
                  category: {
                    type: 'string',
                    enum: ['scary', 'violent', 'inappropriate_lesson', 'personal_info', 'technical_error', 'other'],
                  },
                  description: { type: 'string', example: 'Hình ảnh ở trang 3 có chi tiết hơi đáng sợ với bé nhỏ tuổi' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Báo cáo vi phạm đã được tiếp nhận' },
        },
      },
      get: {
        tags: ['Moderation'],
        summary: '[Moderator | Admin] Xem danh sách các báo cáo vi phạm từ cộng đồng',
        description: '**Quyền truy cập:** `moderator`, `admin`.\nLấy danh sách các phản ánh của phụ huynh cần xử lý.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'resolved', 'dismissed'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: { description: 'Lấy danh sách báo cáo vi phạm thành công' },
        },
      },
    },

    '/moderation/reports/{reportId}/resolve': {
      put: {
        tags: ['Moderation'],
        summary: '[Moderator | Admin] Xử lý đóng hoặc bác bỏ báo cáo vi phạm',
        description: '**Quyền truy cập:** `moderator`, `admin`.\nCập nhật trạng thái xử lý báo cáo vi phạm (đã xử lý `resolved` hoặc bác bỏ `dismissed`).',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'reportId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['resolved', 'dismissed'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Xử lý báo cáo vi phạm thành công' },
        },
      },
    },

    '/moderation/keywords': {
      get: {
        tags: ['Moderation'],
        summary: '[Moderator | Admin] Xem danh mục từ khóa cấm / nhạy cảm',
        description: '**Quyền truy cập:** `moderator`, `admin`.\nXem toàn bộ từ khóa nằm trong danh sách đen lọc tự động.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Lấy danh sách từ khóa cấm thành công' },
        },
      },
      post: {
        tags: ['Moderation'],
        summary: '[Moderator | Admin] Thêm từ khóa cấm mới vào hệ thống',
        description: '**Quyền truy cập:** `moderator`, `admin`.\nThêm từ khóa cần chặn (`block`) hoặc cảnh báo (`warn`).',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['keyword'],
                properties: {
                  keyword: { type: 'string', example: 'tu_khoa_nhay_cam' },
                  severity: { type: 'string', enum: ['block', 'warn'], default: 'block' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Thêm từ khóa cấm thành công' },
          409: { description: 'Từ khóa đã tồn tại trong danh sách' },
        },
      },
    },

    '/moderation/keywords/{id}': {
      delete: {
        tags: ['Moderation'],
        summary: '[Admin] Xóa từ khóa cấm khỏi hệ thống',
        description: '**Quyền truy cập:** `admin` (Dành riêng cho Quản trị viên tối cao).\nXóa vĩnh viễn từ khóa khỏi danh mục cấm.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Xóa từ khóa thành công' },
          404: { description: 'Không tìm thấy từ khóa' },
        },
      },
    },

    '/moderation/reviews/queue': {
      get: {
        tags: ['Moderation'],
        summary: '[Moderator | Admin] Xem hàng đợi tác phẩm chờ kiểm duyệt',
        description: '**Quyền truy cập:** `moderator`, `admin`.\nDanh sách các truyện do tác giả nộp lên chợ đang chờ thẩm định sư phạm.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: { description: 'Lấy hàng đợi kiểm duyệt thành công' },
        },
      },
    },

    '/moderation/reviews/{listingId}/claim': {
      post: {
        tags: ['Moderation'],
        summary: '[Moderator | Admin] Nhận thẩm định một tác phẩm truyện',
        description: '**Quyền truy cập:** `moderator`, `admin`.\nKiểm duyệt viên khóa quyền duyệt tác phẩm trong 24 giờ để tránh bị trùng lặp thẩm định.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'listingId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Nhận duyệt tác phẩm thành công' },
          409: { description: 'Tác phẩm đang được kiểm duyệt bởi kiểm duyệt viên khác' },
        },
      },
    },

    '/moderation/reviews/{reviewId}/decision': {
      post: {
        tags: ['Moderation'],
        summary: '[Moderator | Admin] Đưa ra quyết định duyệt hoặc yêu cầu chỉnh sửa',
        description: '**Quyền truy cập:** `moderator`, `admin`.\nĐưa ra phán quyết (`approved` - chính thức xuất bản ra chợ; `changes_requested` - yêu cầu tác giả sửa; `rejected` - từ chối; `taken_down` - gỡ bỏ).',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'reviewId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['decision'],
                properties: {
                  decision: { type: 'string', enum: ['approved', 'changes_requested', 'rejected', 'taken_down'] },
                  comment: { type: 'string', example: 'Cốt truyện phù hợp, tranh vẽ đạt chuẩn sư phạm' },
                  checklist: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        checklistItemId: { type: 'string', format: 'uuid' },
                        passed: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Ghi nhận quyết định kiểm duyệt thành công' },
        },
      },
    },

    '/moderation/strikes': {
      post: {
        tags: ['Moderation'],
        summary: '[Moderator | Admin] Phạt đánh gậy tác giả vi phạm tiêu chuẩn cộng đồng',
        description: '**Quyền truy cập:** `moderator`, `admin`.\nÁp dụng biện pháp xử phạt tác giả. Tích lũy 3 gậy còn hiệu lực trong 90 ngày sẽ khiến tài khoản Seller tự động bị đình chỉ (`suspended`).',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sellerId', 'source', 'reason'],
                properties: {
                  sellerId: { type: 'string', format: 'uuid' },
                  source: { type: 'string', enum: ['report', 'rejection', 'takedown'] },
                  sourceId: { type: 'string', format: 'uuid' },
                  reason: { type: 'string', example: 'Cố tình chèn nội dung bạo lực không phù hợp với lứa tuổi 3-6' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Phạt gậy tác giả thành công' },
        },
      },
    },

    '/moderation/sellers/{sellerId}/strikes': {
      get: {
        tags: ['Moderation'],
        summary: '[Moderator | Admin] Xem lịch sử xử phạt của một tác giả',
        description: '**Quyền truy cập:** `moderator`, `admin`.\nXem toàn bộ gậy vi phạm còn hiệu lực và lịch sử kháng cáo của tác giả.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'sellerId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Lấy lịch sử xử phạt thành công' },
        },
      },
    },

    /* =========================================================================
     * PLANS & SUBSCRIPTIONS
     * ========================================================================= */
    '/plans': {
      get: {
        tags: ['Plans & Subscriptions'],
        summary: '[Public] Xem danh sách gói thành viên đang hoạt động',
        description: '**Quyền truy cập:** Mọi người dùng (không yêu cầu đăng nhập).\nTrả về danh sách các gói đăng ký định kỳ (Free, Monthly, Yearly) kèm theo định mức AI story, AI image, số lượng hồ sơ bé và nhân vật tối đa.',
        responses: {
          200: { description: 'Lấy danh sách gói thành viên thành công' },
        },
      },
      post: {
        tags: ['Plans & Subscriptions'],
        summary: '[Admin] Tạo mới gói thành viên',
        description: '**Quyền truy cập:** `admin`.\nTạo gói đăng ký thành viên mới trên hệ thống.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['code', 'name', 'period', 'priceVnd', 'aiStoryQuota', 'aiImageQuota', 'maxChildren', 'maxCharacters'],
                properties: {
                  code: { type: 'string', example: 'FAMILY_VIP' },
                  name: { type: 'string', example: 'Gói Gia Đình VIP' },
                  period: { type: 'string', enum: ['month', 'year'], example: 'month' },
                  priceVnd: { type: 'integer', example: 199000 },
                  aiStoryQuota: { type: 'integer', example: 50 },
                  aiImageQuota: { type: 'integer', example: 100 },
                  maxChildren: { type: 'integer', example: 5 },
                  maxCharacters: { type: 'integer', example: 25 },
                  canSell: { type: 'boolean', example: true },
                  isActive: { type: 'boolean', example: true },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Tạo gói thành viên thành công' },
        },
      },
    },

    '/plans/{id}': {
      get: {
        tags: ['Plans & Subscriptions'],
        summary: '[Public] Xem chi tiết gói thành viên',
        description: '**Quyền truy cập:** Mọi người dùng.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Lấy chi tiết gói thành viên thành công' },
          404: { description: 'Không tìm thấy gói thành viên' },
        },
      },
      put: {
        tags: ['Plans & Subscriptions'],
        summary: '[Admin] Cập nhật thông tin gói thành viên',
        description: '**Quyền truy cập:** `admin`.\nCập nhật quyền lợi, giá tiền hoặc định mức của gói thành viên.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  priceVnd: { type: 'integer' },
                  aiStoryQuota: { type: 'integer' },
                  aiImageQuota: { type: 'integer' },
                  maxChildren: { type: 'integer' },
                  maxCharacters: { type: 'integer' },
                  canSell: { type: 'boolean' },
                  isActive: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật gói thành viên thành công' },
        },
      },
      delete: {
        tags: ['Plans & Subscriptions'],
        summary: '[Admin] Vô hiệu hóa gói thành viên',
        description: '**Quyền truy cập:** `admin`.\nChuyển trạng thái gói thành viên sang không hoạt động (`isActive = false`).',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Vô hiệu hóa gói thành viên thành công' },
        },
      },
    },

    /* =========================================================================
     * CREDIT PACKS
     * ========================================================================= */
    '/credit-packs': {
      get: {
        tags: ['Credit Packs'],
        summary: '[Public] Xem danh sách các gói nạp xu',
        description: '**Quyền truy cập:** Mọi người dùng.\nDanh sách các gói xu kèm số xu thưởng tặng thêm để người dùng bổ sung lượt tạo AI ngoài định mức gói tháng.',
        responses: {
          200: { description: 'Lấy danh sách gói nạp xu thành công' },
        },
      },
      post: {
        tags: ['Credit Packs'],
        summary: '[Admin] Tạo mới gói nạp xu',
        description: '**Quyền truy cập:** `admin`.\nTạo gói nạp xu mới với số xu cơ bản và số xu thưởng thêm.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'credits', 'priceVnd'],
                properties: {
                  name: { type: 'string', example: 'Gói Tiết Kiệm (300 Xu + 50 Xu)' },
                  credits: { type: 'integer', example: 300 },
                  bonusCredits: { type: 'integer', example: 50 },
                  priceVnd: { type: 'integer', example: 300000 },
                  isActive: { type: 'boolean', example: true },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Tạo gói nạp xu thành công' },
        },
      },
    },

    '/credit-packs/{id}': {
      get: {
        tags: ['Credit Packs'],
        summary: '[Public] Xem chi tiết gói nạp xu',
        description: '**Quyền truy cập:** Mọi người dùng.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Lấy chi tiết gói nạp xu thành công' },
          404: { description: 'Không tìm thấy gói nạp xu' },
        },
      },
      put: {
        tags: ['Credit Packs'],
        summary: '[Admin] Cập nhật thông tin gói nạp xu',
        description: '**Quyền truy cập:** `admin`.\nChỉnh sửa số xu, xu thưởng hoặc đơn giá gói nạp.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  credits: { type: 'integer' },
                  bonusCredits: { type: 'integer' },
                  priceVnd: { type: 'integer' },
                  isActive: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật gói nạp xu thành công' },
        },
      },
      delete: {
        tags: ['Credit Packs'],
        summary: '[Admin] Vô hiệu hóa gói nạp xu',
        description: '**Quyền truy cập:** `admin`.\nChuyển trạng thái gói nạp sang không hoạt động (`isActive = false`).',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Vô hiệu hóa gói nạp xu thành công' },
        },
      },
    },

    /* =========================================================================
     * SUBSCRIPTIONS
     * ========================================================================= */
    '/subscriptions/me': {
      get: {
        tags: ['Plans & Subscriptions'],
        summary: '[Parent] Xem thông tin gói đăng ký và định mức sử dụng hiện tại',
        description: '**Quyền truy cập:** `parent`, `moderator`, `admin`.\nXem chi tiết gói thành viên đang sử dụng, thời gian hết hạn, số lượng hồ sơ bé/nhân vật đã tạo và số lượt AI story / AI image còn lại trong chu kỳ.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Lấy thông tin gói thành viên hiện tại thành công' },
        },
      },
    },

    '/subscriptions/subscribe-free': {
      post: {
        tags: ['Plans & Subscriptions'],
        summary: '[Parent] Kích hoạt đăng ký gói dùng thử miễn phí (Free Tier)',
        description: '**Quyền truy cập:** `parent`, `moderator`, `admin`.\nKích hoạt gói trải nghiệm miễn phí (0 VND) trong 30 ngày cho phụ huynh chưa có gói trả phí.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  planId: { type: 'string', format: 'uuid', description: 'ID gói Free (tùy chọn)' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Đăng ký gói miễn phí thành công' },
        },
      },
    },

    '/subscriptions/cancel': {
      post: {
        tags: ['Plans & Subscriptions'],
        summary: '[Parent] Hủy gia hạn gói thành viên hiện tại',
        description: '**Quyền truy cập:** `parent`, `moderator`, `admin`.\nHủy trạng thái kích hoạt tự động của gói đăng ký hiện tại.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Hủy gói thành viên thành công' },
        },
      },
    },

    '/subscriptions/admin/all': {
      get: {
        tags: ['Plans & Subscriptions'],
        summary: '[Admin] Danh sách toàn bộ gói đăng ký người dùng',
        description: '**Quyền truy cập:** `admin`.\nQuản trị viên xem và lọc lịch sử đăng ký gói của toàn bộ người dùng kèm phân trang.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'expired', 'cancelled'] } },
          { name: 'parentId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Lấy danh sách đăng ký thành công' },
        },
      },
    },

    /* =========================================================================
     * WALLETS & FINANCIALS
     * ========================================================================= */
    '/wallets/me': {
      get: {
        tags: ['Wallets & Financials'],
        summary: '[Parent] Xem số dư ví xu và số dư thu nhập tác giả',
        description: '**Quyền truy cập:** `parent`, `moderator`, `admin`.\nTrả về số dư xu (`creditBalance`) và các số dư doanh thu tác giả (`earningPendingVnd`, `earningAvailableVnd`, `earningLockedVnd`).',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Lấy thông tin ví thành công' },
        },
      },
    },

    '/wallets/ledger': {
      get: {
        tags: ['Wallets & Financials'],
        summary: '[Parent] Tra cứu lịch sử biến động số dư / Sổ cái giao dịch',
        description: '**Quyền truy cập:** `parent`, `moderator`, `admin`.\nXem toàn bộ lịch sử nạp xu, tiêu dùng xu, cộng doanh thu bán truyện, giữ tiền rút và đối soát.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'walletType', in: 'query', schema: { type: 'string', enum: ['credit', 'earning'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Lấy sổ cái ví thành công' },
        },
      },
    },

    '/wallets/admin/grant-credits': {
      post: {
        tags: ['Wallets & Financials'],
        summary: '[Admin] Cấp bù hoặc thưởng xu thủ công cho người dùng',
        description: '**Quyền truy cập:** `admin`.\nCộng xu vào ví người dùng và tự động ghi sổ cái `credit_admin_grant`.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userId', 'credits'],
                properties: {
                  userId: { type: 'string', format: 'uuid' },
                  credits: { type: 'integer', example: 50 },
                  reason: { type: 'string', example: 'Đền bù sự cố mạng AI ngày 25/09' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cấp xu cho người dùng thành công' },
        },
      },
    },

    '/wallets/withdrawals': {
      post: {
        tags: ['Wallets & Financials'],
        summary: '[Parent] Tác giả gửi yêu cầu rút tiền doanh thu về ngân hàng',
        description: '**Quyền truy cập:** `parent`, `moderator`, `admin` (yêu cầu hồ sơ Seller đã được duyệt và có thông tin tài khoản ngân hàng).\nTối thiểu 50,000 VND. Số tiền rút sẽ được chuyển từ `earningAvailableVnd` sang `earningLockedVnd` trong khi chờ Admin thanh toán.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['amountVnd'],
                properties: {
                  amountVnd: { type: 'integer', minimum: 50000, example: 200000 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Gửi yêu cầu rút tiền thành công' },
        },
      },
    },

    '/wallets/withdrawals/me': {
      get: {
        tags: ['Wallets & Financials'],
        summary: '[Parent] Xem lịch sử các yêu cầu rút tiền của tôi',
        description: '**Quyền truy cập:** `parent`, `moderator`, `admin`.\nDanh sách các yêu cầu rút tiền kèm trạng thái (`requested`, `paid`, `rejected`, `cancelled`).',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['requested', 'paid', 'rejected', 'cancelled'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Lấy danh sách yêu cầu rút tiền thành công' },
        },
      },
    },

    '/wallets/withdrawals/{id}/cancel': {
      delete: {
        tags: ['Wallets & Financials'],
        summary: '[Parent] Hủy yêu cầu rút tiền đang chờ xử lý',
        description: '**Quyền truy cập:** `parent`, `moderator`, `admin` (chỉ áp dụng cho yêu cầu của chính mình và đang ở trạng thái `requested`).\nSố tiền tạm khóa sẽ được hoàn trả ngay lập tức về số dư khả dụng `earningAvailableVnd`.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Hủy yêu cầu rút tiền thành công' },
        },
      },
    },

    '/wallets/admin/withdrawals': {
      get: {
        tags: ['Wallets & Financials'],
        summary: '[Admin] Xem danh sách các yêu cầu rút tiền cần đối soát',
        description: '**Quyền truy cập:** `admin`.\nXem và lọc các yêu cầu rút tiền của tác giả kèm ảnh chụp tài khoản ngân hàng.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['requested', 'paid', 'rejected', 'cancelled'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Lấy danh sách yêu cầu rút tiền thành công' },
        },
      },
    },

    '/wallets/admin/withdrawals/{id}/process': {
      post: {
        tags: ['Wallets & Financials'],
        summary: '[Admin] Xử lý duyệt chi trả hoặc từ chối yêu cầu rút tiền',
        description: '**Quyền truy cập:** `admin`.\n- Khi chọn `paid`: Bắt buộc cung cấp mã giao dịch ngân hàng `bankTransactionRef`. Số tiền sẽ được trừ khỏi `earningLockedVnd`.\n- Khi chọn `rejected`: Bắt buộc cung cấp lý do `rejectReason`. Số tiền sẽ được hoàn về `earningAvailableVnd` của tác giả.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['paid', 'rejected'] },
                  bankTransactionRef: { type: 'string', example: 'FT260925183921' },
                  rejectReason: { type: 'string', example: 'Số tài khoản người thụ hưởng không chính xác' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Xử lý yêu cầu rút tiền thành công' },
        },
      },
    },

    // ==========================================
    // Stories Paths
    // ==========================================
    '/stories': {
      post: {
        tags: ['Stories'],
        summary: '[Parent] Khởi tạo truyện mới từ khuôn mẫu sư phạm',
        description: '**Quyền truy cập:** `parent`, `moderator`, `admin`.\nTạo bản thảo truyện mới (`kind = private`, `status = draft`). Nếu bật `autoInitializePages = true`, hệ thống tự sinh khung các trang theo các phân đoạn và các nhánh lựa chọn của khuôn.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['templateId', 'title'],
                properties: {
                  templateId: { type: 'string', format: 'uuid', example: '11111111-2222-3333-4444-555555555555' },
                  title: { type: 'string', example: 'Chiếc xe cứu hỏa của Bo' },
                  coverImageKey: { type: 'string', nullable: true, example: 'stories/covers/cover-1.jpg' },
                  useAiImage: { type: 'boolean', default: false },
                  useTts: { type: 'boolean', default: true },
                  autoInitializePages: { type: 'boolean', default: true },
                  characters: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['slotKey'],
                      properties: {
                        slotKey: { type: 'string', example: '{CON}' },
                        characterId: { type: 'string', format: 'uuid', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Tạo truyện thành công' },
        },
      },
      get: {
        tags: ['Stories'],
        summary: '[Parent] Danh sách truyện của phụ huynh',
        description: '**Quyền truy cập:** `parent`, `moderator`, `admin`.\nLấy danh sách truyện do tài khoản hiện tại tạo, hỗ trợ phân trang và lọc theo trạng thái (`draft`, `ready`), loại (`private`, `published`).',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'kind', in: 'query', schema: { type: 'string', enum: ['private', 'published'] } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'generating', 'ready'] } },
          { name: 'templateId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: { description: 'Danh sách truyện paginated' },
        },
      },
    },

    '/stories/{id}': {
      get: {
        tags: ['Stories'],
        summary: '[Parent] Chi tiết câu chuyện kèm cây quyết định và các trang',
        description: '**Quyền truy cập:** `parent`, `moderator`, `admin`.\nTrả về toàn bộ thông tin truyện, nhân vật gắn vào slot, và danh sách trang (gồm tình huống, lựa chọn rẽ nhánh và trang kết quả) theo thứ tự đọc.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Chi tiết truyện thành công' },
          404: { description: 'Không tìm thấy truyện' },
        },
      },
      put: {
        tags: ['Stories'],
        summary: '[Parent] Cập nhật thông tin tiêu đề, ảnh bìa, cài đặt truyện',
        description: '**Quyền truy cập:** Chủ sở hữu truyện.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string', example: 'Chiếc xe cứu hỏa của Bo (bản sửa)' },
                  coverImageKey: { type: 'string', nullable: true },
                  useAiImage: { type: 'boolean' },
                  useTts: { type: 'boolean' },
                  status: { type: 'string', enum: ['draft', 'generating', 'ready'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật truyện thành công' },
        },
      },
      delete: {
        tags: ['Stories'],
        summary: '[Parent] Xóa mềm truyện',
        description: '**Quyền truy cập:** Chủ sở hữu truyện.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Xóa truyện thành công' },
        },
      },
    },

    '/stories/{id}/characters': {
      put: {
        tags: ['Stories'],
        summary: '[Parent] Gán nhân vật gia đình vào các vị trí (slots) của truyện',
        description: '**Quyền truy cập:** Chủ sở hữu truyện.\nCho phép gán hoặc thay đổi nhân vật gia đình (ví dụ `{CON}` gắn với bé Bo, `{ME}` gắn với Mẹ Lan).',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['characters'],
                properties: {
                  characters: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['slotKey'],
                      properties: {
                        slotKey: { type: 'string', example: '{CON}' },
                        characterId: { type: 'string', format: 'uuid', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Gán nhân vật thành công' },
        },
      },
    },

    '/stories/{id}/pages': {
      post: {
        tags: ['Stories'],
        summary: '[Parent] Thêm một trang mới vào truyện',
        description: '**Quyền truy cập:** Chủ sở hữu truyện.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['stageId', 'pageKind'],
                properties: {
                  stageId: { type: 'string', format: 'uuid' },
                  pageKind: { type: 'string', enum: ['lead_in', 'situation', 'consequence', 'ending'] },
                  pageOrder: { type: 'integer', example: 1 },
                  fromChoiceId: { type: 'string', format: 'uuid', nullable: true },
                  contentText: { type: 'string', example: 'Hôm nay trời nắng đẹp, Bo rủ em Na ra công viên chơi...' },
                  backgroundId: { type: 'string', format: 'uuid', nullable: true },
                  origin: { type: 'string', enum: ['human', 'ai', 'ai_edited'], default: 'human' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Thêm trang thành công' },
        },
      },
    },

    '/stories/{id}/pages/{pageId}': {
      put: {
        tags: ['Stories'],
        summary: '[Parent] Chỉnh sửa nội dung câu chữ và hình ảnh trang truyện (Story Editor)',
        description: '**Quyền truy cập:** Chủ sở hữu truyện.\nNếu trang ban đầu do AI viết (`origin = ai`), khi phụ huynh chỉnh sửa chữ hệ thống sẽ tự động chuyển cờ sang `origin = ai_edited`.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'pageId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  contentText: { type: 'string', example: 'Nội dung câu chuyện đã được phụ huynh trau chuốt lại...' },
                  backgroundId: { type: 'string', format: 'uuid', nullable: true },
                  imageKey: { type: 'string', nullable: true },
                  audioKey: { type: 'string', nullable: true },
                  origin: { type: 'string', enum: ['human', 'ai', 'ai_edited'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật trang thành công' },
        },
      },
      delete: {
        tags: ['Stories'],
        summary: '[Parent] Xóa một trang và tự động đánh số lại thứ tự các trang tiếp theo',
        description: '**Quyền truy cập:** Chủ sở hữu truyện.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'pageId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Xóa trang thành công' },
        },
      },
    },

    '/stories/{id}/pages/{pageId}/choices/{choiceId}': {
      put: {
        tags: ['Stories'],
        summary: '[Parent] Chỉnh sửa câu chữ của một nhánh lựa chọn hành vi',
        description: '**Quyền truy cập:** Chủ sở hữu truyện.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'pageId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'choiceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['choiceText'],
                properties: {
                  choiceText: { type: 'string', example: 'Bo dừng lại, hít một hơi sâu và đếm đến 3' },
                  audioKey: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật lựa chọn thành công' },
        },
      },
    },

    '/stories/{id}/review': {
      post: {
        tags: ['Stories'],
        summary: '[Parent] Phê duyệt truyện - Phụ huynh xác nhận đã đọc và duyệt 100% trang',
        description: '**Quyền truy cập:** Chủ sở hữu truyện.\nKiểm tra điều kiện: Truyện có trang, tất cả các trang và lựa chọn đều có nội dung không được bỏ trống. Khi duyệt thành công, truyện được cấp cờ `reviewedAt = now()`, chuyển trạng thái `ready` và đủ điều kiện để đưa vào Giá sách của bé.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Duyệt truyện thành công' },
          400: { description: 'Truyện chưa hoàn thiện (còn trang trống)' },
        },
      },
    },

    '/stories/{id}/publish-version': {
      post: {
        tags: ['Stories'],
        summary: '[Seller / Parent] Tạo bản sao xuất bản (Gỡ cá nhân hóa tự động)',
        description: '**Quyền truy cập:** Chủ sở hữu truyện.\nChỉ thực hiện được khi truyện riêng đã được duyệt (`reviewedAt` khác null). Hệ thống sao chép truyện sang `kind = published`, tự động thay thế tên nhân vật riêng tư bằng tên mặc định của khuôn để bảo vệ danh tính của con trước khi đăng bán trên Marketplace.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string', example: 'Bài học chia sẻ đồ chơi của bạn Thỏ' },
                  coverImageKey: { type: 'string' },
                  nameReplacements: {
                    type: 'array',
                    description: 'Tùy chọn danh sách tên nhân vật thay thế theo từng slotKey hoặc theo tên riêng cũ. Nếu không cung cấp, hệ thống sẽ tự động dùng defaultName của kịch bản.',
                    items: {
                      type: 'object',
                      properties: {
                        slotKey: { type: 'string', example: 'main_child' },
                        fromName: { type: 'string', example: 'Bé Bo' },
                        customName: { type: 'string', example: 'Bé Thỏ Thông Thái' },
                      },
                      required: ['customName'],
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Tạo bản sao xuất bản thành công' },
        },
      },
    },

    // =========================================================================
    // Content Library: Backgrounds
    // =========================================================================
    '/backgrounds': {
      get: {
        tags: ['Content Library'],
        summary: '[Public / Parent] Lấy danh sách ảnh nền mặc định',
        description: 'Dùng khi phụ huynh tạo truyện với `useAiImage = false` hoặc duyệt thư viện ảnh nền có sẵn.',
        parameters: [
          { name: 'tags', in: 'query', schema: { type: 'string' }, description: 'Lọc theo nhãn (VD: phòng ngủ, trường học, rừng cây)' },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Tìm theo tên hoặc nhãn ảnh' },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' }, description: 'Chỉ lấy ảnh đang hoạt động (true/false)' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Danh sách ảnh nền phân trang' },
        },
      },
      post: {
        tags: ['Content Library'],
        summary: '[Moderator / Admin] Tải lên / Tạo ảnh nền mặc định mới',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'imageKey'],
                properties: {
                  name: { type: 'string', example: 'Phòng khách ấm cúng ban ngày' },
                  imageKey: { type: 'string', example: 'backgrounds/living-room-day.webp' },
                  tags: { type: 'string', example: 'nha_cua,phong_khach,ban_ngay' },
                  isActive: { type: 'boolean', default: true },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Thêm mới ảnh nền thành công' },
        },
      },
    },

    '/backgrounds/{id}': {
      get: {
        tags: ['Content Library'],
        summary: 'Lấy chi tiết ảnh nền theo ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Chi tiết ảnh nền' },
          404: { description: 'Không tìm thấy ảnh nền' },
        },
      },
      put: {
        tags: ['Content Library'],
        summary: '[Moderator / Admin] Cập nhật thông tin ảnh nền',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  imageKey: { type: 'string' },
                  tags: { type: 'string' },
                  isActive: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật thành công' },
        },
      },
      delete: {
        tags: ['Content Library'],
        summary: '[Moderator / Admin] Xóa hoặc chuyển trạng thái ngưng hoạt động của ảnh nền',
        description: 'Nếu ảnh nền đã gắn với trang truyện, hệ thống tự động tắt kích hoạt (`isActive: false`) để bảo toàn tính toàn vẹn dữ liệu.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Xóa hoặc tắt kích hoạt thành công' },
        },
      },
    },

    // =========================================================================
    // Content Library: UI Audio Assets
    // =========================================================================
    '/ui-audio-assets': {
      get: {
        tags: ['Content Library'],
        summary: 'Lấy danh sách tài nguyên âm thanh giao diện',
        parameters: [
          { name: 'lang', in: 'query', schema: { type: 'string', default: 'vi' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Danh sách âm thanh giao diện' },
        },
      },
      post: {
        tags: ['Content Library'],
        summary: '[Moderator / Admin] Tạo mới âm thanh giao diện',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['key', 'textContent', 'audioKey'],
                properties: {
                  key: { type: 'string', example: 'PROMPT_CHOOSE_BRANCH' },
                  lang: { type: 'string', default: 'vi', example: 'vi' },
                  textContent: { type: 'string', example: 'Bây giờ bạn nhỏ hãy chọn xem chuyện gì sẽ xảy ra tiếp theo nhé!' },
                  audioKey: { type: 'string', example: 'ui-audio/choose-branch-vi.mp3' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Tạo mới thành công' },
        },
      },
    },

    '/ui-audio-assets/by-key/{key}': {
      get: {
        tags: ['Content Library'],
        summary: 'Lấy âm thanh giao diện theo mã key và ngôn ngữ',
        parameters: [
          { name: 'key', in: 'path', required: true, schema: { type: 'string' }, example: 'PROMPT_CHOOSE_BRANCH' },
          { name: 'lang', in: 'query', schema: { type: 'string', default: 'vi' } },
        ],
        responses: {
          200: { description: 'Chi tiết file âm thanh' },
        },
      },
    },

    '/ui-audio-assets/{id}': {
      get: {
        tags: ['Content Library'],
        summary: 'Lấy chi tiết âm thanh giao diện theo ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Chi tiết âm thanh' },
        },
      },
      put: {
        tags: ['Content Library'],
        summary: '[Moderator / Admin] Cập nhật âm thanh giao diện',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  lang: { type: 'string' },
                  textContent: { type: 'string' },
                  audioKey: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật thành công' },
        },
      },
      delete: {
        tags: ['Content Library'],
        summary: '[Moderator / Admin] Xóa âm thanh giao diện',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Xóa thành công' },
        },
      },
    },

    // =========================================================================
    // Content Library: Checklist Items (7 Tiêu chuẩn sư phạm)
    // =========================================================================
    '/checklist-items': {
      get: {
        tags: ['Content Library'],
        summary: 'Lấy danh sách 7 tiêu chuẩn sư phạm phục vụ kiểm duyệt truyện',
        parameters: [
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: {
          200: { description: 'Danh sách tiêu chuẩn kiểm duyệt' },
        },
      },
      post: {
        tags: ['Content Library'],
        summary: '[Moderator / Admin] Tạo mới tiêu chuẩn kiểm duyệt',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['code', 'description'],
                properties: {
                  code: { type: 'string', example: 'NO_VIOLENCE' },
                  description: { type: 'string', example: 'Không chứa hình ảnh hoặc hành vi bạo lực, xúc phạm thân thể' },
                  displayOrder: { type: 'integer', default: 1 },
                  isActive: { type: 'boolean', default: true },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Tạo mới thành công' },
        },
      },
    },

    '/checklist-items/{id}': {
      get: {
        tags: ['Content Library'],
        summary: 'Lấy chi tiết tiêu chuẩn kiểm duyệt',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Chi tiết' },
        },
      },
      put: {
        tags: ['Content Library'],
        summary: '[Moderator / Admin] Cập nhật tiêu chuẩn kiểm duyệt',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  description: { type: 'string' },
                  displayOrder: { type: 'integer' },
                  isActive: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật thành công' },
        },
      },
      delete: {
        tags: ['Content Library'],
        summary: '[Moderator / Admin] Xóa hoặc tắt kích hoạt tiêu chuẩn kiểm duyệt',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Xóa hoặc tắt kích hoạt thành công' },
        },
      },
    },

    // =========================================================================
    // Content Library: Stats & Bulk Keywords
    // =========================================================================
    '/content-library/stats': {
      get: {
        tags: ['Content Library'],
        summary: '[Moderator / Admin] Thống kê toàn bộ tài nguyên Content Library',
        description: 'Tổng số kịch bản mẫu theo trạng thái, số ảnh nền, file âm thanh, tiêu chuẩn kiểm duyệt và từ khóa cấm.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Báo cáo thống kê tổng hợp' },
        },
      },
    },

    '/content-library/keywords/bulk': {
      post: {
        tags: ['Content Library', 'Moderation'],
        summary: '[Moderator / Admin] Nhập hàng loạt từ khóa cấm (Bulk Import)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['keywords'],
                properties: {
                  keywords: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['keyword'],
                      properties: {
                        keyword: { type: 'string', example: 'tự hại' },
                        severity: { type: 'string', enum: ['block', 'warn'], default: 'block' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Kết quả nhập hàng loạt từ khóa' },
        },
      },
    },

    '/content-library/keywords/{id}': {
      put: {
        tags: ['Content Library', 'Moderation'],
        summary: '[Moderator / Admin] Cập nhật từ khóa cấm',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  keyword: { type: 'string' },
                  severity: { type: 'string', enum: ['block', 'warn'] },
                  isActive: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật từ khóa cấm thành công' },
        },
      },
    },

    // =========================================================================
    // Content Library: Granular Template Configuration (Stages, Slots, Choices)
    // =========================================================================
    '/templates/{id}/stages': {
      post: {
        tags: ['Content Library', 'Templates'],
        summary: '[Moderator / Admin] Thêm phân đoạn sư phạm cho kịch bản mẫu',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['stageOrder', 'learningObjective'],
                properties: {
                  stageOrder: { type: 'integer', example: 1 },
                  learningObjective: { type: 'string', example: 'Nhận diện cảm xúc ghen tị khi em gái có đồ chơi mới' },
                  emotionToName: { type: 'string', example: 'Ghen tị' },
                  leadInPages: { type: 'integer', default: 1 },
                  isClimax: { type: 'boolean', default: false },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Thêm phân đoạn thành công' },
        },
      },
    },

    '/templates/stages/{stageId}': {
      put: {
        tags: ['Content Library', 'Templates'],
        summary: '[Moderator / Admin] Cập nhật phân đoạn sư phạm',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'stageId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  stageOrder: { type: 'integer' },
                  learningObjective: { type: 'string' },
                  emotionToName: { type: 'string' },
                  leadInPages: { type: 'integer' },
                  isClimax: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật thành công' },
        },
      },
      delete: {
        tags: ['Content Library', 'Templates'],
        summary: '[Moderator / Admin] Xóa phân đoạn sư phạm',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'stageId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Xóa thành công' },
        },
      },
    },

    '/templates/{id}/slots': {
      post: {
        tags: ['Content Library', 'Templates'],
        summary: '[Moderator / Admin] Cập nhật danh sách vị trí nhân vật (slots)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['slots'],
                properties: {
                  slots: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['slotKey', 'characterRole', 'defaultName'],
                      properties: {
                        slotKey: { type: 'string', example: '{CON}' },
                        characterRole: { type: 'string', enum: ['self', 'sibling', 'parent', 'relative', 'pet', 'toy'] },
                        defaultName: { type: 'string', example: 'Bé Bi' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật slots thành công' },
        },
      },
    },

    '/templates/{id}/slots/{slotKey}': {
      delete: {
        tags: ['Content Library', 'Templates'],
        summary: '[Moderator / Admin] Xóa một vị trí nhân vật (slot)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'slotKey', in: 'path', required: true, schema: { type: 'string' }, example: '{CON}' },
        ],
        responses: {
          200: { description: 'Xóa slot thành công' },
        },
      },
    },

    '/templates/stages/{stageId}/choices': {
      post: {
        tags: ['Content Library', 'Templates'],
        summary: '[Moderator / Admin] Thêm lựa chọn rẽ nhánh kèm điểm tín hiệu cảm xúc CASEL',
        description: 'Tín hiệu cảm xúc do chuyên gia / Moderator chỉ định, là căn cứ khoa học khách quan để đánh giá EQ của bé khi chọn.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'stageId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['choiceOrder', 'typeCode', 'description'],
                properties: {
                  choiceOrder: { type: 'integer', example: 1 },
                  typeCode: { type: 'string', example: 'DUNG_LAI_THO_SAU' },
                  description: { type: 'string', example: 'Dừng lại, hít một hơi thật sâu và đếm từ 1 đến 5' },
                  isProsocial: { type: 'boolean', default: true },
                  signals: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['skillId', 'delta'],
                      properties: {
                        skillId: { type: 'string', format: 'uuid' },
                        delta: { type: 'integer', example: 5 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Thêm lựa chọn rẽ nhánh thành công' },
        },
      },
    },

    '/templates/choices/{choiceId}': {
      put: {
        tags: ['Content Library', 'Templates'],
        summary: '[Moderator / Admin] Cập nhật lựa chọn rẽ nhánh và điểm tín hiệu cảm xúc',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'choiceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  choiceOrder: { type: 'integer' },
                  typeCode: { type: 'string' },
                  description: { type: 'string' },
                  isProsocial: { type: 'boolean' },
                  signals: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        skillId: { type: 'string', format: 'uuid' },
                        delta: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật thành công' },
        },
      },
      delete: {
        tags: ['Content Library', 'Templates'],
        summary: '[Moderator / Admin] Xóa lựa chọn rẽ nhánh',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'choiceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Xóa thành công' },
        },
      },
    },

    // =========================================================================
    // Moderation: Strike Appeals (Khiếu nại gậy cảnh cáo)
    // =========================================================================
    '/moderation/strikes/{strikeId}/appeals': {
      post: {
        tags: ['Moderation'],
        summary: '[Seller] Gửi đơn khiếu nại đối với gậy cảnh cáo',
        description: 'Tác giả (Seller) gửi giải trình và lý do khiếu nại đối với gậy cảnh cáo đã nhận từ kiểm duyệt viên.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'strikeId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reason'],
                properties: {
                  reason: { type: 'string', minLength: 10, example: 'Truyện của tôi tuân thủ hoàn toàn hướng dẫn, tình huống tranh chấp đồ chơi là để dạy bé bài học chia sẻ chứ không mang tính bạo lực.' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Gửi đơn khiếu nại thành công' },
          400: { description: 'Gậy đã hết hạn hoặc đã được gỡ bỏ' },
          409: { description: 'Gậy này đã có đơn khiếu nại' },
        },
      },
    },

    '/moderation/my-appeals': {
      get: {
        tags: ['Moderation'],
        summary: '[Seller] Xem danh sách đơn khiếu nại của chính mình',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Danh sách đơn khiếu nại của tác giả' },
        },
      },
    },

    '/moderation/appeals': {
      get: {
        tags: ['Moderation'],
        summary: '[Moderator / Admin] Xem danh sách tất cả đơn khiếu nại gậy cảnh cáo',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected', 'cancelled'] } },
          { name: 'sellerId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Danh sách đơn khiếu nại phân trang' },
        },
      },
    },

    '/moderation/appeals/{appealId}/decide': {
      post: {
        tags: ['Moderation'],
        summary: '[Admin] Phê duyệt hoặc từ chối đơn khiếu nại gậy cảnh cáo',
        description: 'Chỉ Admin mới có quyền quyết định. Nếu chấp thuận (`approved`), hệ thống tự động gỡ bỏ gậy cảnh cáo (`revokedAt = now()`), khôi phục trạng thái hoạt động của Seller nếu trước đó bị đình chỉ, ghi nhật ký kiểm toán và gửi thông báo tới Seller.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'appealId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['approved', 'rejected'], example: 'approved' },
                  decisionNote: { type: 'string', example: 'Sau khi rà soát lại nội dung trang truyện, khiếu nại của tác giả là có cơ sở.' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Xử lý quyết định thành công' },
        },
      },
    },

    // =========================================================================
    // Notifications (Hệ thống thông báo đẩy)
    // =========================================================================
    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Lấy danh sách thông báo của tài khoản',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'unreadOnly', in: 'query', schema: { type: 'boolean' }, description: 'Chỉ lấy thông báo chưa đọc (true/false)' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Danh sách thông báo phân trang kèm số lượng chưa đọc' },
        },
      },
    },

    '/notifications/unread-count': {
      get: {
        tags: ['Notifications'],
        summary: 'Lấy nhanh số lượng thông báo chưa đọc (cho huy hiệu badge icon)',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Số lượng thông báo chưa đọc' },
        },
      },
    },

    '/notifications/read-all': {
      patch: {
        tags: ['Notifications'],
        summary: 'Đánh dấu tất cả thông báo là đã đọc',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Đã đánh dấu đọc tất cả' },
        },
      },
    },

    '/notifications/{id}/read': {
      patch: {
        tags: ['Notifications'],
        summary: 'Đánh dấu một thông báo cụ thể là đã đọc',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Đánh dấu đã đọc thành công' },
        },
      },
    },

    '/notifications/{id}': {
      delete: {
        tags: ['Notifications'],
        summary: 'Xóa một thông báo',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Xóa thông báo thành công' },
        },
      },
    },

    // =========================================================================
    // Reports & Supervision
    // =========================================================================
    '/reports/eq/children/{childId}': {
      get: {
        tags: ['Reports & Supervision'],
        summary: '[Parent] Báo cáo phân tích chuyên sâu EQ của bé',
        description: 'Báo cáo toàn diện biểu đồ radar 5 năng lực CASEL, tiến trình phát triển theo thời gian, danh sách cảm xúc gặp phải nhiều nhất trong truyện và lời khuyên sư phạm cá nhân hóa cho phụ huynh dựa trên năng lực cần bồi dưỡng.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'childId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: { description: 'Báo cáo EQ chuyên sâu' },
        },
      },
    },

    '/reports/platform/overview': {
      get: {
        tags: ['Reports & Supervision'],
        summary: '[Moderator / Admin] Tổng quan giám sát toàn nền tảng',
        description: 'Thống kê tổng hợp số lượng phụ huynh, trẻ em, tỷ lệ truyện cá nhân/xuất bản, tình trạng chợ Marketplace, số báo cáo vi phạm đang chờ xử lý và mức độ tuân thủ an toàn.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Dữ liệu giám sát nền tảng' },
        },
      },
    },

    // =========================================================================
    // Platform Settings & Admin Audit Logs
    // =========================================================================
    '/admin/settings': {
      get: {
        tags: ['Platform & Audit Logs'],
        summary: '[Admin] Lấy danh sách toàn bộ cấu hình tham số hệ thống',
        description: 'Tỷ lệ hoa hồng nền tảng (commission_rate: 30%), số ngày giam tiền (holding_days: 7), mức rút tiền tối thiểu (min_withdrawal_vnd), ngưỡng báo cáo tự động tạm gỡ (report_threshold). Tự động khởi tạo giá trị mặc định nếu bảng trống.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Danh sách cấu hình hệ thống' },
        },
      },
    },

    '/admin/settings/{key}': {
      get: {
        tags: ['Platform & Audit Logs'],
        summary: '[Admin] Lấy chi tiết một tham số cấu hình',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'key', in: 'path', required: true, schema: { type: 'string' }, example: 'commission_rate' },
        ],
        responses: {
          200: { description: 'Chi tiết cấu hình' },
        },
      },
      put: {
        tags: ['Platform & Audit Logs'],
        summary: '[Admin] Cập nhật tham số cấu hình hệ thống',
        description: 'Cập nhật giá trị cấu hình và tự động lưu vết vào nhật ký kiểm toán quản trị (Admin Audit Logs).',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'key', in: 'path', required: true, schema: { type: 'string' }, example: 'commission_rate' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['value'],
                properties: {
                  value: { example: 30 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Cập nhật tham số thành công' },
        },
      },
    },

    '/admin/audit-logs': {
      get: {
        tags: ['Platform & Audit Logs'],
        summary: '[Admin] Truy vấn nhật ký kiểm toán quản trị',
        description: 'Xem toàn bộ lịch sử thao tác của các Admin và Moderator (duyệt khiếu nại, cấp gậy, thay đổi cấu hình hệ thống, khóa tài khoản...).',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'actorId', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Lọc theo ID người thực hiện' },
          { name: 'action', in: 'query', schema: { type: 'string' }, description: 'Lọc theo hành động (VD: UPDATE_PLATFORM_SETTING, APPROVE_STRIKE_APPEAL)' },
          { name: 'targetType', in: 'query', schema: { type: 'string' }, description: 'Lọc theo đối tượng tác động (VD: PLATFORM_SETTING, STRIKE_APPEAL)' },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Danh sách nhật ký kiểm toán phân trang' },
        },
      },
    },
  },
};

export default swaggerSpec;
