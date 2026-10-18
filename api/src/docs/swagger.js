import { env } from '../config/index.js';
import storiesPaths from './paths/stories.paths.js';
import moderatorPaths from './paths/moderator.paths.js';
import monitoringPaths from './paths/monitoring.paths.js';
import adminPaths from './paths/admin.paths.js';

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
    { name: 'Publishing', description: 'Người bán và đăng bán truyện (bản sao gỡ cá nhân hoá)' },
    { name: 'Market', description: 'Chợ truyện: xem, mua (payOS), truyện đã mua' },
    { name: 'Admin Withdrawals', description: 'Duyệt rút tiền người bán qua chi hộ payOS' },
    { name: 'Payments', description: 'Mua gói qua payOS: tạo link, trạng thái đơn, webhook' },
    { name: 'Kid Mode', description: 'Quản lý mã PIN và phiên đọc Chế độ Trẻ em' },
    { name: 'Email Verification', description: 'Gửi và xác thực địa chỉ email qua Brevo' },
    { name: 'Children', description: 'Quản lý hồ sơ bé và kiểm soát thời gian sử dụng màn hình' },
    { name: 'Characters', description: 'Quản lý nhân vật gia đình đưa vào truyện và chân dung AI' },
    { name: 'EQ Skills', description: 'Danh mục 5 nhóm năng lực trí tuệ cảm xúc chuẩn CASEL' },
    { name: 'Stories', description: 'Tạo truyện từ chủ đề và nhân vật, nhờ AI viết chữ, chỉnh sửa trang và điểm dừng cảm xúc, phụ huynh xem xét trước khi cho bé đọc' },
    { name: 'Content Library', description: 'Thư viện tài nguyên sư phạm: ảnh nền mặc định, âm thanh UI, tiêu chuẩn kiểm duyệt và cấu hình kịch bản' },
    { name: 'Bookshelf', description: 'Quản lý kệ sách cá nhân của bé và theo dõi tiến độ đọc truyện' },
    { name: 'Payments', description: 'Mua gói qua payOS: tạo link, trạng thái đơn, webhook' },
    { name: 'Kid Mode', description: 'Bé đọc truyện trên giá, trả lời điểm dừng, BE chấm EQ (token kid_session)' },
    { name: 'Marketplace', description: 'Chợ truyện cộng đồng: hồ sơ tác giả, đăng bán, nhận miễn phí và đánh giá sản phẩm' },
    { name: 'Moderation', description: 'Kiểm duyệt an toàn nội dung, từ khóa cấm, duyệt tác phẩm và báo cáo vi phạm' },
    { name: 'Plans & Subscriptions', description: 'Gói thành viên, định mức tạo truyện/chân dung AI và quyền lợi tài khoản' },
    { name: 'Wallets & Financials', description: 'Ví xu phụ huynh, số dư thu nhập tác giả (Seller Wallet), sổ cái giao dịch và yêu cầu rút tiền' },
    { name: 'Reports & Supervision', description: 'Báo cáo EQ biểu đồ radar, tiến trình học tập và giám sát nền tảng' },
    { name: 'Platform & Audit Logs', description: 'Cài đặt tham số hệ thống và nhật ký kiểm toán quản trị' },
    { name: 'Cart', description: 'Giỏ hàng mua sắm truyện chợ cộng đồng' },
    { name: 'Orders', description: 'Đơn hàng mua gói Subscription, nạp Credit hoặc mua truyện' },
    { name: 'Entitlements', description: 'Quyền sở hữu truyện chợ đã mua & cá nhân hóa vào giá sách' },
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
          name: { type: 'string', example: 'Bé Bo' },
          birthDate: { type: 'string', format: 'date', nullable: true, example: '2019-05-10' },
          age: { type: 'integer', nullable: true, example: 7 },
          dailyScreenTimeMinutes: { type: 'integer', example: 30 },
          preferredVoice: { type: 'string', nullable: true, example: 'northern_female' },
          character: {
            type: 'object',
            nullable: true,
            description: 'Nhân vật đại diện của bé (characters.child_id); null nếu chưa có',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string', example: 'Bé Bo' },
              appearance: { type: 'string', example: 'Bé trai tóc ngắn xoăn, hay mặc áo khủng long xanh' },
              portraitImageKey: { type: 'string', nullable: true },
              portraitStatus: { type: 'string', enum: ['none', 'queued', 'generating', 'ready', 'failed'] },
            },
          },
          booksCount: { type: 'integer', example: 8 },
          completedSessionsCount: { type: 'integer', example: 14 },
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
          date: { type: 'string', format: 'date', example: '2026-09-24', description: 'Ngày theo giờ Việt Nam' },
          dailyLimitMinutes: { type: 'integer', example: 30 },
          usedMinutes: { type: 'integer', example: 15 },
          usedSeconds: { type: 'integer', example: 900 },
          remainingMinutes: { type: 'integer', example: 15 },
          isLimitReached: { type: 'boolean', example: false },
          sessionsCount: { type: 'integer', example: 1 },
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
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Quên mật khẩu — gửi mã khôi phục qua email',
        description: 'Mã hiệu lực 1 giờ, dùng một lần; mã cũ chưa dùng hết hiệu lực. Luôn trả 200 kể cả email chưa đăng ký (không để dò email).',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } } } },
        responses: { 200: { description: 'Đã nhận yêu cầu' } },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Đặt lại mật khẩu bằng mã trong email',
        description: 'Thành công → thu hồi mọi phiên đăng nhập (refresh token) cũ.',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['token', 'newPassword'], properties: { token: { type: 'string' }, newPassword: { type: 'string', minLength: 8 } } } } } },
        responses: { 200: { description: 'Đã đặt lại' }, 400: { description: 'Mã sai / đã dùng / hết hạn' } },
      },
    },
    '/auth/change-password': {
      put: {
        tags: ['Auth'],
        summary: 'Đổi mật khẩu (đang đăng nhập)',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string', minLength: 8 } } } } } },
        responses: { 200: { description: 'Đã đổi' }, 400: { description: 'Mật khẩu hiện tại sai / mật khẩu mới trùng mật khẩu cũ' } },
      },
    },

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
                required: ['startedAt', 'endedAt'],
                description: 'duration_seconds và usage_date (giờ Việt Nam) do DB tự tính',
                properties: {
                  startedAt: { type: 'string', format: 'date-time', description: 'Thời điểm bắt đầu phiên' },
                  endedAt: { type: 'string', format: 'date-time', description: 'Thời điểm kết thúc phiên (sau startedAt)' },
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

    // ---- PUBLISHING + MODERATION (rev8 luong 3) ----
    '/sellers/me': { get: { tags: ['Publishing'], summary: '[Parent] Hồ sơ người bán của tôi', security: [{ BearerAuth: [] }], responses: { 200: { description: '{ seller | null, planCanSell }' } } } },
    '/sellers/apply': { post: { tags: ['Publishing'], summary: '[Parent] Nộp hồ sơ người bán', description: 'Cần gói can_sell. Bị từ chối thì nộp lại được.', security: [{ BearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['displayName'], properties: { displayName: { type: 'string' }, bio: { type: 'string' }, expertise: { type: 'string' } } } } } }, responses: { 200: { description: '{ seller }' } } } },
    '/listings/price-tiers': { get: { tags: ['Publishing'], summary: 'Bậc giá đăng bán', security: [{ BearerAuth: [] }], responses: { 200: { description: '{ priceTiers: [{ id, label, priceVnd }] }' } } } },
    '/listings/mine': { get: { tags: ['Publishing'], summary: '[Parent] Truyện tôi đăng bán', security: [{ BearerAuth: [] }], responses: { 200: { description: '{ listings: [{ id, title, status, priceVnd, lastDecision }] }' } } } },
    '/listings': { post: { tags: ['Publishing'], summary: '[Seller] Đăng bán một truyện riêng đã hoàn tất', description: 'Tạo bản sao published đã gỡ cá nhân hoá: tên chung cho từng token (aliases), bỏ situation và audio, use_tts=false. 422 khi còn tên thật (kể cả trong tên mới) hoặc bí danh trùng / là tên thật.', security: [{ BearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['storyId', 'title', 'priceTierId', 'aliases'], properties: { storyId: { type: 'string', format: 'uuid' }, title: { type: 'string' }, description: { type: 'string' }, priceTierId: { type: 'string', format: 'uuid' }, aliases: { type: 'array', items: { type: 'object', properties: { token: { type: 'string', example: '{NV1}' }, aliasName: { type: 'string' } } } } } } } } }, responses: { 200: { description: '{ listing }' } } } },
    '/moderation/sellers': { get: { tags: ['Moderation'], summary: '[Moderator] Hồ sơ người bán theo trạng thái (?status=pending)', security: [{ BearerAuth: [] }], responses: { 200: { description: '{ sellers }' } } } },
    '/moderation/sellers/{userId}/decision': { post: { tags: ['Moderation'], summary: '[Moderator] Duyệt / từ chối hồ sơ người bán', security: [{ BearerAuth: [] }], parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['approve'], properties: { approve: { type: 'boolean' } } } } } }, responses: { 200: { description: '{ seller }' } } } },
    '/moderation/submissions': { get: { tags: ['Moderation'], summary: '[Moderator] Hàng đợi truyện chờ duyệt (cũ nhất trước)', security: [{ BearerAuth: [] }], responses: { 200: { description: '{ queue: [{ reviewId, listingId, title, seller, priceVnd, claimedBy }] }' } } } },
    '/moderation/submissions/{reviewId}/claim': { post: { tags: ['Moderation'], summary: '[Moderator] Nhận bài (giữ 30 phút)', description: 'Người khác đang giữ → 409.', security: [{ BearerAuth: [] }], parameters: [{ name: 'reviewId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'chi tiết lượt duyệt' } } } },
    '/moderation/submissions/{reviewId}': { get: { tags: ['Moderation'], summary: '[Moderator] Chi tiết lượt duyệt: truyện (tên chung), checklist, trang đã xem, tiến độ', security: [{ BearerAuth: [] }], parameters: [{ name: 'reviewId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: '{ review, listing, story, checklist, pageViews, progress }' } } } },
    '/moderation/submissions/{reviewId}/pages/{pageId}/view': { post: { tags: ['Moderation'], summary: '[Moderator] Đánh dấu đã xem trang (+ nhận xét)', security: [{ BearerAuth: [] }], parameters: [{ name: 'reviewId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'pageId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { comment: { type: 'string' } } } } } }, responses: { 200: { description: 'chi tiết lượt duyệt' } } } },
    '/moderation/submissions/{reviewId}/decision': { post: { tags: ['Moderation'], summary: '[Moderator] Quyết định', description: 'Lượt nộp bán: approved | changes_requested | rejected. Lượt hậu kiểm (report_followup / random_audit): approved = giữ / bán lại, taken_down = gỡ hẳn (archived + tự cảnh cáo). approved chỉ khi đã xem 100% trang và đạt đủ checklist; quyết định khác bắt buộc nhận xét.', security: [{ BearerAuth: [] }], parameters: [{ name: 'reviewId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['decision'], properties: { decision: { type: 'string', enum: ['approved', 'changes_requested', 'rejected', 'taken_down'] }, comment: { type: 'string' }, issueStrike: { type: 'boolean', description: 'rejected + true → cảnh cáo nguồn rejection' }, checklist: { type: 'array', items: { type: 'object', properties: { itemId: { type: 'string', format: 'uuid' }, passed: { type: 'boolean' } } } } } } } } }, responses: { 200: { description: 'chi tiết lượt duyệt' } } } },

    // ---- MARKET + RUT TIEN (rev8 luong 4, 6) ----
    '/market/listings': { get: { tags: ['Market'], summary: 'Truyện đang bán (chỉ published)', security: [{ BearerAuth: [] }], parameters: [{ name: 'search', in: 'query', schema: { type: 'string' } }, { name: 'competency', in: 'query', schema: { type: 'string' } }, { name: 'age', in: 'query', schema: { type: 'string' } }, { name: 'priceTierId', in: 'query', schema: { type: 'string' } }, { name: 'sort', in: 'query', schema: { type: 'string' } }, { name: 'page', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: '{ items: [{ id, title, topic, totalPages, priceTier, seller, purchaseCount, owned }], pagination }' } } } },
    '/market/listings/{listingId}': { get: { tags: ['Market'], summary: 'Chi tiết truyện đang bán + trang đầu xem trước (tên chung)', security: [{ BearerAuth: [] }], parameters: [{ name: 'listingId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: '{ listing }' } } } },
    '/market/owned': { get: { tags: ['Market'], summary: '[Parent] Truyện đã mua / nhận (entitlement)', security: [{ BearerAuth: [] }], responses: { 200: { description: '{ items }' } } } },
    '/market/checkout': { post: { tags: ['Market'], summary: '[Parent] Mua / nhận truyện', description: 'Giá + tỉ lệ người bán (80%) chốt vào order_item. 0đ → nhận ngay. Có giá → link payOS, trả về /parent/marketplace/result?orderId=…; trạng thái qua GET /payments/orders/{orderId}. Mua truyện của mình → 422; đã có → 409.', security: [{ BearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['listingId'], properties: { listingId: { type: 'string', format: 'uuid' } } } } } }, responses: { 200: { description: '{ order, checkoutUrl }' } } } },
    '/sellers/me/earnings': { get: { tags: ['Publishing'], summary: '[Seller] Doanh thu: chờ (giữ 3 ngày) / rút được / đang rút, tài khoản nhận, lịch sử', security: [{ BearerAuth: [] }], responses: { 200: { description: '{ balance, bank, withdrawals, ledger, minWithdrawalVnd }' } } } },
    '/sellers/me/bank': { put: { tags: ['Publishing'], summary: '[Seller] Tài khoản nhận tiền', description: 'Số tài khoản mã hoá AES-256-GCM khi lưu, chỉ trả số che. Đổi tài khoản → chặn rút 24 giờ.', security: [{ BearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['bankBin', 'bankName', 'accountNumber', 'accountHolder'], properties: { bankBin: { type: 'string', example: '970416' }, bankName: { type: 'string' }, accountNumber: { type: 'string' }, accountHolder: { type: 'string' } } } } } }, responses: { 200: { description: '{ bank }' } } } },
    '/sellers/me/withdrawals': { post: { tags: ['Publishing'], summary: '[Seller] Yêu cầu rút tiền', description: 'Tối thiểu market.min_withdrawal_vnd; giữ tiền (available → locked); mỗi lúc một yêu cầu chưa xong.', security: [{ BearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['amountVnd'], properties: { amountVnd: { type: 'integer' } } } } } }, responses: { 200: { description: '{ withdrawal }' } } } },
    '/sellers/me/withdrawals/{id}': { delete: { tags: ['Publishing'], summary: '[Seller] Huỷ yêu cầu rút (khi Admin chưa duyệt)', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: '{ withdrawal }' } } } },
    '/admin/withdrawals': { get: { tags: ['Admin Withdrawals'], summary: '[Admin] Yêu cầu rút tiền theo trạng thái', security: [{ BearerAuth: [] }], parameters: [{ name: 'status', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: '{ withdrawals }' } } } },
    '/admin/withdrawals/{id}/approve': { post: { tags: ['Admin Withdrawals'], summary: '[Admin] Duyệt → tạo lệnh chi hộ payOS', description: 'Idempotency key = id yêu cầu. Trạng thái → processing; hoàn tất khi mọi giao dịch SUCCEEDED (cron / sync).', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: '{ withdrawal }' } } } },
    '/admin/withdrawals/{id}/reject': { post: { tags: ['Admin Withdrawals'], summary: '[Admin] Từ chối (bắt buộc lý do) → trả tiền', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } } } }, responses: { 200: { description: '{ withdrawal }' } } } },
    '/admin/withdrawals/{id}/sync': { post: { tags: ['Admin Withdrawals'], summary: '[Admin] Hỏi lại payOS trạng thái lệnh chi hộ', security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: '{ withdrawal }' } } } },

    // ---- PAYMENTS (payOS, rev8) ----
    '/payments/plans/checkout': {
      post: {
        tags: ['Payments'],
        summary: '[Parent] Mua / đổi gói qua payOS',
        description: 'Gói 0đ: kích hoạt ngay (`checkoutUrl: null`). Gói trả phí: tạo đơn `pending` (hạn 15 phút) + link payOS; FE chuyển người dùng tới `checkoutUrl`. payOS trả về `<WEB_URL>/parent/billing/result?orderId=…`. Trả tiền xong: kỳ gói mới bắt đầu ngay, cấp đủ credit gói mới, credit còn lại giữ một lần.',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['planId'], properties: { planId: { type: 'string', format: 'uuid' } } } } } },
        responses: { 201: { description: '{ order, checkoutUrl }' }, 404: { description: 'Không có gói' }, 502: { description: 'payOS lỗi' } },
      },
    },
    '/payments/orders/{orderId}': {
      get: {
        tags: ['Payments'],
        summary: '[Parent] Trạng thái đơn — BE tự hỏi lại payOS khi đơn chưa xong',
        description: 'Trang kết quả thanh toán gọi endpoint này (không tin query string của returnUrl). payOS báo PAID (đủ tiền) → giao hàng; CANCELLED / EXPIRED → đóng đơn. Idempotent với webhook.',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: '{ order: { id, status: pending|paid|failed|cancelled|expired, totalVnd, items } }' } },
      },
    },
    '/payments/payos/webhook': {
      post: {
        tags: ['Payments'],
        summary: '[payOS] Webhook thanh toán (không token, xác thực bằng chữ ký)',
        description: 'Đăng ký `<API công khai>/api/v1/payments/payos/webhook` trên my.payos.vn khi API đã public. Luôn trả 200 (kể cả chữ ký sai — đã ghi webhook_logs) để payOS không gửi lại vô hạn; chỉ giao hàng khi chữ ký đúng, code 00, đủ tiền, đơn pending/expired.',
        responses: { 200: { description: '{ ok, processed, reason }' } },
      },
    },

    // ---- KID MODE (rev8) — token `kid_session` tu POST /auth/kid-mode/enter ----
    '/kid/me': { get: { tags: ['Kid Mode'], summary: '[Kid Session] Hồ sơ bé đang dùng máy', security: [{ BearerAuth: [] }], responses: { 200: { description: '{ child }' }, 403: { description: 'Không phải token Kid Mode' } } } },
    '/kid/bookshelf': { get: { tags: ['Kid Mode'], summary: '[Kid Session] Giá sách của bé (chỉ truyện đã sẵn sàng: hoàn tất + đủ giọng đọc)', security: [{ BearerAuth: [] }], responses: { 200: { description: '{ items: [{ storyId, title, totalPages, readingProgress }] }' } } } },
    '/kid/ui-audio': { get: { tags: ['Kid Mode'], summary: '[Kid Session] Câu đọc dùng chung (tên cảm xúc, câu nhắc)', security: [{ BearerAuth: [] }], responses: { 200: { description: '{ assets: { <key>: { text, audioUrl } } }' } } } },
    '/kid/sessions': {
      post: {
        tags: ['Kid Mode'],
        summary: '[Kid Session] Bắt đầu / tiếp tục lượt đọc',
        description: 'Truyện phải nằm trên giá của bé và **sẵn sàng cho trẻ** (422 kèm tiến độ giọng đọc nếu chưa). Có lượt `in_progress` thì tiếp tục; không thì tạo lượt mới, `isFirstPlay` = bé chưa từng đọc truyện này (chỉ lượt đầu được chấm EQ). Nội dung trả về **không có đáp án** (answerEmotion, isCorrect, role, feedback); chữ đã thay tên thật.',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['storyId'], properties: { storyId: { type: 'string', format: 'uuid' } } } } } },
        responses: { 201: { description: '{ session, story: { pages[{ id, pageOrder, text, audioUrl, imageUrl }], checkpoints[{ id, afterPageId, type, question, questionAudioUrl, options[{ id, text, textAudioUrl }], result }] } }' }, 404: { description: 'Truyện không có trên giá của bé' }, 422: { description: 'Truyện chưa sẵn sàng' } },
      },
    },
    '/kid/sessions/{sessionId}': { get: { tags: ['Kid Mode'], summary: '[Kid Session] Nội dung + câu đã trả lời của lượt đọc', security: [{ BearerAuth: [] }], parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: '{ session, story }' } } } },
    '/kid/sessions/{sessionId}/progress': { put: { tags: ['Kid Mode'], summary: '[Kid Session] Lưu trang đang đọc', security: [{ BearerAuth: [] }], parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['pageId'], properties: { pageId: { type: 'string', format: 'uuid' } } } } } }, responses: { 200: { description: '{ session }' } } } },
    '/kid/sessions/{sessionId}/answers': {
      post: {
        tags: ['Kid Mode'],
        summary: '[Kid Session] Bé trả lời điểm dừng — BE chấm',
        description: 'Cảm xúc: `emotion`; vị trí người khác / giải quyết tình huống: `optionId`; liên hệ bản thân: chỉ `checkpointId`. Sai lần đầu (cảm xúc / vị trí) → `done: false` + `hint`; gửi lần nữa → `done: true`, sai thì kèm `answer`. Giải quyết tình huống trả `feedback`. Chỉ lần chọn đầu được chấm (1 / 0,5 / 0) và chỉ cộng vào eq_competency_stats ở lượt đọc đầu. Gửi lại câu đã xong → trả kết quả cũ.',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['checkpointId'], properties: { checkpointId: { type: 'string', format: 'uuid' }, emotion: { type: 'string', enum: ['happy', 'sad', 'angry', 'scared', 'neutral'] }, optionId: { type: 'string', format: 'uuid' }, skipped: { type: 'boolean' }, timeToFirstMs: { type: 'integer' }, questionReplays: { type: 'integer' } } } } } },
        responses: { 200: { description: '{ result: { checkpointId, done, correct, attempts, hint?, hintAudioUrl?, answer?, feedback?, feedbackAudioUrl? } }' }, 400: { description: 'Lựa chọn sai kiểu điểm dừng' }, 409: { description: 'Lượt đọc đã kết thúc' } },
      },
    },
    '/kid/sessions/{sessionId}/complete': { post: { tags: ['Kid Mode'], summary: '[Kid Session] Đọc xong (idempotent)', security: [{ BearerAuth: [] }], parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: '{ session }' } } } },

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

  },
};

export default swaggerSpec;
