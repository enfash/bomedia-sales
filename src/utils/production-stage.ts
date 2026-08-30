/**
 * Single source of truth for the production-stage accent colour, used on the
 * dashboard, the production board, and analytics.
 *
 * Independent of payment status ({@link STATUS_META} in payment-status.ts) —
 * a job's stage and its payment state are separate axes of a sale, so this
 * does not reference STATUS_META even where a colour happens to coincide.
 */

import type { ProductionStage } from '@/components/records/types';
import { Colors } from '@/constants/theme';

export const STAGE_META: Record<ProductionStage, string> = {
  Queued: Colors.light.outline,
  Printing: Colors.light.primary,
  Finishing: Colors.light.warning,
  Ready: Colors.light.success,
  Delivered: Colors.light.textSecondary,
};
