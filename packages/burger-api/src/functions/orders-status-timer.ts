import { app, InvocationContext } from '@azure/functions';
import { DbService } from '../db-service.js';
import { PubSubService } from '../pubsub-service.js';
import { OrderStatus } from '../order.js';

app.timer('orders-status-timer', {
  // Runs every 2 minutes to save Web PubSub quota (Free Tier limit: 20k messages/day)
  schedule: '0 */2 * * * *',
  async handler(_timer, context: InvocationContext) {
    context.log('Order status timer triggered');
    const db = await DbService.getInstance();
    const pubSub = PubSubService.getInstance();
    
    const startTime = Date.now();
    const now = new Date();

    // --- Order Status Updates ---
    const allOrders = await db.getOrders();
    const orders = allOrders.filter((order) =>
      [OrderStatus.Pending, OrderStatus.InPreparation, OrderStatus.Ready].includes(order.status),
    );

    const updateTasks = [];
    for (const order of orders) {
      switch (order.status) {
        case OrderStatus.Pending: {
          const minutesSinceCreated = (now.getTime() - new Date(order.createdAt).getTime()) / 60_000;
          if (minutesSinceCreated > 3 || (minutesSinceCreated >= 1 && Math.random() < 0.5)) {
            updateTasks.push({
              orderId: order.id,
              userId: order.userId,
              update: { status: OrderStatus.InPreparation },
              statusName: 'in-preparation',
            });
          }

          break;
        }

        case OrderStatus.InPreparation: {
          const estimatedCompletionAt = new Date(order.estimatedCompletionAt);
          const diffMinutes = (now.getTime() - estimatedCompletionAt.getTime()) / 60_000;
          if (diffMinutes > 3 || (Math.abs(diffMinutes) <= 3 && Math.random() < 0.5)) {
            updateTasks.push({
              orderId: order.id,
              userId: order.userId,
              update: { status: OrderStatus.Ready, readyAt: now.toISOString() },
              statusName: 'ready',
            });
          }

          break;
        }

        case OrderStatus.Ready: {
          if (order.readyAt) {
            const readyAt = new Date(order.readyAt);
            const minutesSinceReady = (now.getTime() - readyAt.getTime()) / 60_000;
            if (minutesSinceReady >= 1 && (minutesSinceReady > 2 || Math.random() < 0.5)) {
              updateTasks.push({
                orderId: order.id,
                userId: order.userId,
                update: { status: OrderStatus.Completed, completedAt: now.toISOString() },
                statusName: 'completed',
              });
            }
          }

          break;
        }
        // No default
      }
    }

    const updatePromises = updateTasks.map(async (task) => {
      try {
        const updatedOrder = await db.updateOrder(task.orderId, task.update);
        
        if (updatedOrder) {
            // Broadcast to the specific user
            await pubSub.broadcastToUser(task.userId, 'order-update', updatedOrder);
        }

        return { id: task.orderId, status: task.statusName, success: true };
      } catch (error) {
        context.error(`ERROR: Failed to update order ${task.orderId} to ${task.statusName}:`, error);
        return { id: task.orderId, status: task.statusName, success: false, error: error as Error };
      }
    });

    const results = await Promise.all(updatePromises);

    const updated = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const elapsedMs = Date.now() - startTime;
    context.log(`Order status updates: ${updated} orders updated, ${failed} failed (time elapsed: ${elapsedMs}ms)`);

    // --- Lightning Deal Simulation ---
    // 10% chance every tick to broadcast a flash deal to ALL connected users
    if (Math.random() < 0.1) {
        const deals = [
            "⚡ FLASH DEAL: 50% OFF Spicy Jalapeño Burgers for the next 10 mins!",
            "⚡ FREE DRINK with every order placed now!",
            "⚡ Uber Eats Alert: Shake Shack free delivery just started."
        ];
        const randomDeal = deals[Math.floor(Math.random() * deals.length)];
        context.log('Broadcasting Flash Deal:', randomDeal);
        
        await pubSub.broadcastToAll('flash-deal', { message: randomDeal });
    }
  },
});