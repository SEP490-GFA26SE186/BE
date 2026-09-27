import { z } from 'zod';

const getNotifications = z.object({
  query: z.object({
    unreadOnly: z
      .string()
      .transform((val) => val === 'true')
      .optional(),
    page: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .default('1'),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .default('20'),
  }),
});

const markAsRead = z.object({
  params: z.object({
    id: z.string().uuid('Invalid notification ID format'),
  }),
});

const deleteNotification = z.object({
  params: z.object({
    id: z.string().uuid('Invalid notification ID format'),
  }),
});

export default {
  getNotifications,
  markAsRead,
  deleteNotification,
};
