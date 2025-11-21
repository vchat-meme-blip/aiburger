export enum OrderStatus {
  Pending = 'pending',
  InPreparation = 'in-preparation',
  Ready = 'ready',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

export enum PaymentStatus {
  Unpaid = 'unpaid',
  Paid = 'paid',
  Failed = 'failed',
}

export interface OrderItem {
  burgerId: string;
  quantity: number;
  extraToppingIds?: string[]; // Optional list of extra topping IDs
}

export interface Order {
  id: string;
  userId: string; // Mandatory userId parameter
  createdAt: string; // ISO date string
  items: OrderItem[];
  estimatedCompletionAt: string; // ISO date string for estimated completion time
  totalPrice: number;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  nickname?: string; // Optional nickname for the order
  readyAt?: string; // ISO date string for when the order was ready (undefined until ready)
  completedAt?: string; // ISO date string for when the order was completed (undefined until completed)
}