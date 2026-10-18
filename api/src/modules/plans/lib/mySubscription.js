// GET /subscriptions/me theo rev8 (plans cap credit theo thang). Ham thuan, khong DB.
// Hinh dang khop Web parentService.getSubscription: { plan, status, periodEnd } (+ usage).

/**
 * Goi Mien phi khi phu huynh chua co dong subscriptions nao (rev8: goi Mien phi cung la mot dong
 * subscriptions — du phong nay chi cho tai khoan cu / seed thieu). Gioi han khop
 * children.service (2 be) va characters.service (5 nhan vat).
 */
export const FREE_PLAN_FALLBACK = {
  code: 'FREE',
  name: 'Gói Miễn phí',
  durationMonths: 1,
  priceVnd: 0n,
  creditsPerMonth: 0,
  maxChildren: 2,
  maxCharacters: 5,
  canSell: false,
};

const pickPlan = ({ code, name, durationMonths, priceVnd, creditsPerMonth, maxChildren, maxCharacters, canSell }) => ({
  code, name, durationMonths, priceVnd, creditsPerMonth, maxChildren, maxCharacters, canSell,
});

/** `subscription`: dong dang hoat dong (include plan) hoac null. `usage`: { childrenCount, charactersCount }. */
export function formatMySubscription(subscription, usage) {
  if (!subscription) {
    return {
      isFallback: true,
      plan: { ...FREE_PLAN_FALLBACK },
      status: 'active',
      periodStart: null,
      periodEnd: null,
      nextCreditGrantAt: null,
      usage,
    };
  }
  return {
    isFallback: false,
    plan: pickPlan(subscription.plan),
    status: subscription.status,
    periodStart: subscription.periodStart,
    periodEnd: subscription.periodEnd,
    nextCreditGrantAt: subscription.nextCreditGrantAt,
    usage,
  };
}
