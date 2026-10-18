import { z } from 'zod';

const checkoutPlan = z.object({ body: z.object({ planId: z.string({ required_error: 'Thiếu planId' }).uuid('planId không hợp lệ') }) });
const getOrder = z.object({ params: z.object({ orderId: z.string().uuid('orderId không hợp lệ') }) });

export default { checkoutPlan, getOrder };
