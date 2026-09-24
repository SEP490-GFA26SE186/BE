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
  },
};

export default swaggerSpec;
