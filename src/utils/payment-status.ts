/**
 * Utility for determining payment status and associated brand colours.
 * Enforces MD3 and Brand Guidelines.
 */

export interface PaymentStatusData {
  status: 'Paid' | 'Overpaid' | 'Partial' | 'Unpaid' | 'Cancelled';
  color: string;
  backgroundColor: string;
}

export function getPaymentStatus(totalAmount: number, totalPaid: number, isOverdue = false): PaymentStatusData {
  // Overpaid
  if (totalPaid > totalAmount && totalAmount > 0) {
    return { status: 'Overpaid', color: '#2e388d', backgroundColor: '#e5eeff' }; // Primary, Surface
  }
  
  // Paid
  if (totalPaid >= totalAmount && totalAmount > 0) {
    return { status: 'Paid', color: '#2E7D32', backgroundColor: '#E8F5E9' };
  }
  
  // Partial
  if (totalPaid > 0 && totalPaid < totalAmount) {
    return { status: 'Partial', color: '#EF6C00', backgroundColor: '#FFF4E5' };
  }
  
  // Unpaid (default or overdue)
  if (isOverdue) {
    return { status: 'Unpaid', color: '#C62828', backgroundColor: '#FDECEC' };
  }
  
  // Outstanding (not yet overdue, or 0)
  return { status: 'Unpaid', color: '#ba1a1a', backgroundColor: '#ffdad6' }; // Using MD3 Error colors
}

// Fallback resolver for manual statuses (e.g. from quote screens)
export function getStatusColors(statusText: string): { text: string, bg: string } {
  switch (statusText) {
    case 'Paid':
    case 'Won':
    case 'Approved':
      return { text: '#2E7D32', bg: '#E8F5E9' };
    case 'Overpaid':
      return { text: '#2e388d', bg: '#e5eeff' };
    case 'Partial':
    case 'Negotiation':
      return { text: '#EF6C00', bg: '#FFF4E5' };
    case 'Unpaid':
    case 'Rejected':
    case 'Lost':
      return { text: '#C62828', bg: '#FDECEC' };
    case 'Cancelled':
      return { text: '#546E7A', bg: '#ECEFF1' };
    default:
      return { text: '#454651', bg: '#eff4ff' };
  }
}
