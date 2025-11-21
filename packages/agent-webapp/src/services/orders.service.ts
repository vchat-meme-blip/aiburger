
export interface BurgerOrder {
  id: string;
  createdAt: string;
  items: Array<{
    burgerId: string;
    quantity: number;
    extraToppingIds?: string[];
  }>;
  estimatedCompletionAt: string;
  totalPrice: number;
  status: string;
  nickname?: string;
  readyAt?: string;
  completedAt?: string;
}

export const burgerApiBaseUrl: string = import.meta.env.VITE_BURGER_API_URL || '';

export async function fetchOrders({
  userId,
  status,
  lastMinutes,
}: {
  userId: string;
  status?: string;
  lastMinutes?: number;
}): Promise<BurgerOrder[] | undefined> {
  try {
    const parameters = new URLSearchParams();
    parameters.append('userId', userId);
    if (status) parameters.append('status', status);
    if (lastMinutes) parameters.append('last', `${lastMinutes}m`);
    
    const url = `${burgerApiBaseUrl}/api/orders?${parameters.toString()}`;
    const response = await fetch(url);
    if (!response.ok) return undefined;
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    return undefined;
  }
}
