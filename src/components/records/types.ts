export interface SalesRecord {
  id: string;
  dbPath?: string; // The Firebase path to this record or its parent batch
  clientName: string;
  contact: string;
  material: string;
  width: string;
  height: string;
  jobUnit: string;
  quantity: number;
  unitPrice: number;
  total: number;
  amountPaid?: number;
  createdAt: string;
  loggedBy?: string;
  batchId?: string;
  type?: string;
  notes?: string;
  dueDate?: string;
}

export interface SalesBatch {
  id: string; // The batchId
  dbPath?: string; // The Firebase path to this batch
  clientName: string;
  createdAt: string;
  records: SalesRecord[];
  totalAmount: number;
  totalPaid: number;
  totalBalance: number;
  status: string;
  statusColor: string;
  notes?: string;
  dueDate?: string;
}
