import { Container, CosmosClient, Database } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import burgersData from '../data/burgers.json';
import toppingsData from '../data/toppings.json';
import { ToppingCategory, Topping } from './topping.js';
import { Burger } from './burger.js';
import { Order, OrderStatus, PaymentStatus } from './order.js';

// Helper to strip properties starting with underscore from an object
function stripUnderscoreProperties<T extends object>(object: T): T {
  if (!object || typeof object !== 'object') return object;
  const result: Record<string, any> = {};
  for (const key of Object.keys(object)) {
    if (!key.startsWith('_')) {
      result[key] = (object as any)[key];
    }
  }

  return result as T;
}

// Helper to remove userId from Order(s)
function stripUserId<T extends Order | Order[] | undefined>(orderOrOrders: T): T {
  if (Array.isArray(orderOrOrders)) {
    return orderOrOrders.map((order) => {
      if (!order) return order;
      const { userId, ...rest } = order;
      return rest as Order;
    }) as T;
  }

  if (orderOrOrders && typeof orderOrOrders === 'object') {
    const { userId, ...rest } = orderOrOrders;
    return rest as T;
  }

  return orderOrOrders;
}

export interface UserWallet {
    balance: number;
    cryptoBalance: number;
}

// Database service for our burger API using Azure Cosmos DB
export class DbService {
  private static instance: DbService;
  private client: CosmosClient | undefined = undefined;
  private database: Database | undefined = undefined;
  private burgersContainer: Container | undefined = undefined;
  private toppingsContainer: Container | undefined = undefined;
  private ordersContainer: Container | undefined = undefined;
  private usersContainer: Container | undefined = undefined;

  // Fallback to local data if Cosmos DB is not available
  private localBurgers: Burger[] = [];
  private localToppings: Topping[] = [];
  private localOrders: Order[] = [];
  // In-memory store for user tokens when using local mode
  private localUserTokens: Map<string, any> = new Map();
  private isCosmosDbInitialized = false;

  static async getInstance(): Promise<DbService> {
    if (!DbService.instance) {
      const instance = new DbService();
      await instance.initializeCosmosDb();
      instance.initializeLocalData();
      DbService.instance = instance;
    }

    return DbService.instance;
  }

  // Initialize Cosmos DB client and containers
  protected async initializeCosmosDb(): Promise<void> {
    try {
      const endpoint = process.env.AZURE_COSMOSDB_NOSQL_ENDPOINT;

      if (!endpoint) {
        console.warn('Cosmos DB endpoint not found in environment variables. Using local data.');
        return;
      }

      // Use DefaultAzureCredential for managed identity
      const credential = new DefaultAzureCredential();

      this.client = new CosmosClient({
        endpoint,
        aadCredentials: credential,
      });

      // Get or create database
      const databaseId = 'burgerDB';
      const { database } = await this.client.databases.createIfNotExists({
        id: databaseId,
      });
      this.database = database;

      // Get or create containers
      const { container: burgersContainer } = await this.database.containers.createIfNotExists({
        id: 'burgers',
        partitionKey: { paths: ['/id'] },
      });
      this.burgersContainer = burgersContainer;

      const { container: toppingsContainer } = await this.database.containers.createIfNotExists({
        id: 'toppings',
        partitionKey: { paths: ['/id'] },
      });
      this.toppingsContainer = toppingsContainer;

      const { container: ordersContainer } = await this.database.containers.createIfNotExists({
        id: 'orders',
        partitionKey: { paths: ['/id'] },
      });
      this.ordersContainer = ordersContainer;

      // Initialize connection to userDB as well to support user-related functions
      try {
        const userDbId = 'userDB';
        const { database: userDatabase } = await this.client.databases.createIfNotExists({
          id: userDbId,
        });

        // Get or create users container
        const { container: usersContainer } = await userDatabase.containers.createIfNotExists({
          id: 'users',
          partitionKey: { paths: ['/id'] },
        });

        this.usersContainer = usersContainer;
      } catch (error) {
        console.error('Failed to initialize users database:', error);
      }

      this.isCosmosDbInitialized = true;

      // Seed initial data if containers are empty
      await this.seedInitialDataIfEmpty();

      console.log('Successfully connected to Cosmos DB');
    } catch (error) {
      console.error('Failed to initialize Cosmos DB:', error);
      console.warn('Falling back to local data storage');
    }
  }

  // Seed initial data if containers are empty
  private async seedInitialDataIfEmpty(): Promise<void> {
    if (!this.isCosmosDbInitialized) return;

    try {
      // Check if Burgers container is empty
      const burgerIterator = this.burgersContainer!.items.query('SELECT VALUE COUNT(1) FROM c');
      const burgerResponse = await burgerIterator.fetchAll();
      const burgerCount = burgerResponse.resources[0];

      if (burgerCount === 0) {
        console.log('Seeding burgers data to Cosmos DB...');
        const burgers = burgersData as Burger[];
        const burgerCreationPromises = burgers.map(async (burger) => this.burgersContainer!.items.create(burger));
        await Promise.all(burgerCreationPromises);
      }

      // Check if Toppings container is empty
      const toppingIterator = this.toppingsContainer!.items.query('SELECT VALUE COUNT(1) FROM c');
      const toppingResponse = await toppingIterator.fetchAll();
      const toppingCount = toppingResponse.resources[0];

      if (toppingCount === 0) {
        console.log('Seeding toppings data to Cosmos DB...');
        const toppings = toppingsData as Topping[];
        const toppingCreationPromises = toppings.map(async (topping) => this.toppingsContainer!.items.create(topping));
        await Promise.all(toppingCreationPromises);
      }
    } catch (error) {
      console.error('Error seeding initial data:', error);
    }
  }

  // Burger methods
  async getBurgers(): Promise<Burger[]> {
    if (this.isCosmosDbInitialized) {
      try {
        const querySpec = {
          query: 'SELECT * FROM c',
        };
        // Enable cross-partition query to avoid warnings/errors
        const { resources } = await this.burgersContainer!.items.query(querySpec, { forceQueryPlan: true }).fetchAll();
        return (resources as Burger[]).map(stripUnderscoreProperties);
      } catch (error) {
        console.error('Error fetching burgers from Cosmos DB:', error);
        return [...this.localBurgers];
      }
    }

    return [...this.localBurgers];
  }

  async getBurger(id: string): Promise<Burger | undefined> {
    if (this.isCosmosDbInitialized) {
      try {
        const { resource } = await this.burgersContainer!.item(id, id).read();
        return resource ? stripUnderscoreProperties(resource as Burger) : undefined;
      } catch (error) {
        console.error(`Error fetching burger ${id} from Cosmos DB:`, error);
        return this.localBurgers.find((burger) => burger.id === id);
      }
    }

    return this.localBurgers.find((burger) => burger.id === id);
  }

  // Topping methods
  async getToppings(): Promise<Topping[]> {
    if (this.isCosmosDbInitialized) {
      try {
        const querySpec = {
          query: 'SELECT * FROM c',
        };
        // Enable cross-partition query to avoid warnings/errors
        const { resources } = await this.toppingsContainer!.items.query(querySpec, { forceQueryPlan: true }).fetchAll();
        return (resources as Topping[]).map(stripUnderscoreProperties);
      } catch (error) {
        console.error('Error fetching toppings from Cosmos DB:', error);
        return [...this.localToppings];
      }
    }

    return [...this.localToppings];
  }

  async getTopping(id: string): Promise<Topping | undefined> {
    if (this.isCosmosDbInitialized) {
      try {
        const { resource } = await this.toppingsContainer!.item(id, id).read();
        return resource ? stripUnderscoreProperties(resource as Topping) : undefined;
      } catch (error) {
        console.error(`Error fetching topping ${id} from Cosmos DB:`, error);
        return this.localToppings.find((topping) => topping.id === id);
      }
    }

    return this.localToppings.find((topping) => topping.id === id);
  }

  async getToppingsByCategory(category: ToppingCategory): Promise<Topping[]> {
    const toppings = await this.getToppings();
    return toppings.filter((topping) => topping.category === category);
  }

  // Order methods
  async getOrders(userId?: string): Promise<Order[]> {
    if (this.isCosmosDbInitialized) {
      try {
        let querySpec;
        if (userId) {
          querySpec = {
            query: 'SELECT * FROM c WHERE c.userId = @userId',
            parameters: [
              {
                name: '@userId',
                value: userId,
              },
            ],
          };
        } else {
          querySpec = {
            query: 'SELECT * FROM c',
          };
        }
        // Enable cross-partition query to avoid warnings/errors
        const { resources } = await this.ordersContainer!.items.query(querySpec, { forceQueryPlan: true }).fetchAll();
        return stripUserId((resources as Order[]).map(stripUnderscoreProperties));
      } catch (error) {
        console.error('Error fetching orders from Cosmos DB:', error);
        const orders = userId ? this.localOrders.filter((order) => order.userId === userId) : this.localOrders;
        return stripUserId(orders);
      }
    }

    const orders = userId ? this.localOrders.filter((order) => order.userId === userId) : this.localOrders;
    return stripUserId(orders);
  }

  async getOrder(id: string, userId?: string): Promise<Order | undefined> {
    if (this.isCosmosDbInitialized) {
      try {
        const { resource } = await this.ordersContainer!.item(id, id).read();
        if (!resource) return undefined;

        const order = stripUnderscoreProperties(resource as Order);
        if (userId && order.userId !== userId) {
          return undefined;
        }

        return stripUserId(order);
      } catch (error) {
        console.error(`Error fetching order ${id} from Cosmos DB:`, error);
        const order = this.localOrders.find((order) => order.id === id);
        if (!order) return undefined;
        if (userId && order.userId !== userId) {
          return undefined;
        }

        return stripUserId(order);
      }
    }

    const order = this.localOrders.find((order) => order.id === id);
    if (!order) return undefined;
    if (userId && order.userId !== userId) {
      return undefined;
    }

    return stripUserId(order);
  }

  async createOrder(order: Order): Promise<Order> {
    if (this.isCosmosDbInitialized) {
      try {
        const { resource } = await this.ordersContainer!.items.create(order);
        return stripUserId(stripUnderscoreProperties(resource as Order));
      } catch (error) {
        console.error('Error creating order in Cosmos DB:', error);
        this.localOrders.push(order);
        return stripUserId(order);
      }
    }

    this.localOrders.push(order);
    return stripUserId(order);
  }

  async updateOrderStatus(id: string, status: OrderStatus, userId?: string): Promise<Order | undefined> {
    if (this.isCosmosDbInitialized) {
      try {
        const { resource: existingOrder } = await this.ordersContainer!.item(id, id).read();
        if (!existingOrder) return undefined;

        if (userId && (existingOrder as Order).userId !== userId) {
          return undefined;
        }

        const updatedOrder = { ...existingOrder, status };
        const { resource } = await this.ordersContainer!.item(id, id).replace(updatedOrder);
        return stripUserId(stripUnderscoreProperties(resource as Order));
      } catch (error) {
        console.error(`Error updating order ${id} in Cosmos DB:`, error);
        const orderIndex = this.localOrders.findIndex((order) => order.id === id);
        if (orderIndex === -1) return undefined;

        const order = this.localOrders[orderIndex];
        if (userId && order.userId !== userId) {
          return undefined;
        }

        this.localOrders[orderIndex] = { ...order, status };
        return stripUserId(this.localOrders[orderIndex]);
      }
    }

    const orderIndex = this.localOrders.findIndex((order) => order.id === id);
    if (orderIndex === -1) return undefined;

    const order = this.localOrders[orderIndex];
    if (userId && order.userId !== userId) {
      return undefined;
    }

    this.localOrders[orderIndex] = { ...order, status };
    return stripUserId(this.localOrders[orderIndex]);
  }

  async deleteOrder(id: string, userId?: string): Promise<boolean> {
    if (this.isCosmosDbInitialized) {
      try {
        const { resource: existingOrder } = await this.ordersContainer!.item(id, id).read();
        if (!existingOrder) return false;

        if (userId && (existingOrder as Order).userId !== userId) {
          return false;
        }

        await this.ordersContainer!.item(id, id).delete();
        return true;
      } catch (error) {
        console.error(`Error deleting order ${id} from Cosmos DB:`, error);
        const orderIndex = this.localOrders.findIndex((order) => order.id === id);
        if (orderIndex === -1) return false;

        const order = this.localOrders[orderIndex];
        if (userId && order.userId !== userId) {
          return false;
        }

        this.localOrders.splice(orderIndex, 1);
        return true;
      }
    }

    const orderIndex = this.localOrders.findIndex((order) => order.id === id);
    if (orderIndex === -1) return false;

    const order = this.localOrders[orderIndex];
    if (userId && order.userId !== userId) {
      return false;
    }

    this.localOrders.splice(orderIndex, 1);
    return true;
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined> {
    if (this.isCosmosDbInitialized) {
      try {
        const { resource: existingOrder } = await this.ordersContainer!.item(id, id).read();
        if (!existingOrder) return undefined;

        const updatedOrder = { ...existingOrder, ...updates };
        const { resource } = await this.ordersContainer!.item(id, id).replace(updatedOrder);
        return stripUserId(stripUnderscoreProperties(resource as Order));
      } catch (error) {
        console.error(`Error updating order ${id} in Cosmos DB:`, error);
        const orderIndex = this.localOrders.findIndex((order) => order.id === id);
        if (orderIndex === -1) return undefined;

        this.localOrders[orderIndex] = { ...this.localOrders[orderIndex], ...updates };
        return stripUserId(this.localOrders[orderIndex]);
      }
    }

    const orderIndex = this.localOrders.findIndex((order) => order.id === id);
    if (orderIndex === -1) return undefined;

    this.localOrders[orderIndex] = { ...this.localOrders[orderIndex], ...updates };
    return stripUserId(this.localOrders[orderIndex]);
  }

  // User methods
  async createUser(id: string, name: string): Promise<void> {
    if (!this.usersContainer) {
      console.warn('Users container not initialized. User creation skipped (local mode).');
      this.localUserTokens.set(id, { id, name, createdAt: new Date().toISOString(), wallet: { balance: 0, cryptoBalance: 0 } });
      return;
    }

    try {
      await this.usersContainer.items.create({
        id,
        name,
        createdAt: new Date().toISOString(),
        wallet: { balance: 0, cryptoBalance: 0 }
      });
    } catch (error) {
      // Ignore if user already exists
    }
  }

  async getUserName(id: string): Promise<string | undefined> {
    if (!this.usersContainer) {
      const user = this.localUserTokens.get(id);
      return user?.name;
    }

    try {
      const { resource } = await this.usersContainer.item(id, id).read();
      return resource?.name;
    } catch (error) {
      console.error('Error fetching user:', error);
      return undefined;
    }
  }

  async userExists(id: string): Promise<boolean> {
    if (!this.usersContainer) {
       return true;
    }

    try {
      const { resource } = await this.usersContainer.item(id, id).read();
      return Boolean(resource);
    } catch (error) {
      return false;
    }
  }

  async getRegisteredUsers(): Promise<number> {
    if (!this.usersContainer) {
      return this.localUserTokens.size;
    }

    try {
      const querySpec = {
        query: 'SELECT VALUE COUNT(1) FROM c',
      };
      // Enable cross-partition query
      const { resources } = await this.usersContainer.items.query(querySpec, { forceQueryPlan: true }).fetchAll();
      return resources[0] || 0;
    } catch (error) {
      console.error('Error counting registered users:', error);
      return 0;
    }
  }

  // Update user with external API tokens (e.g., Uber)
  async updateUserToken(userId: string, provider: string, tokenData: any): Promise<void> {
    if (!this.usersContainer) {
        const user = this.localUserTokens.get(userId) || { id: userId, wallet: { balance: 0, cryptoBalance: 0 } };
        user[provider] = tokenData;
        this.localUserTokens.set(userId, user);
        return;
    }

    try {
        const { resource: user } = await this.usersContainer.item(userId, userId).read();
        if (user) {
            user[provider] = tokenData;
            await this.usersContainer.item(userId, userId).replace(user);
        }
    } catch (error) {
        console.error(`Error updating token for user ${userId}:`, error);
    }
  }

  async getUserToken(userId: string, provider: string): Promise<any> {
      if (!this.usersContainer) {
          const user = this.localUserTokens.get(userId);
          return user ? user[provider] : undefined;
      }

      try {
          const { resource: user } = await this.usersContainer.item(userId, userId).read();
          return user ? user[provider] : undefined;
      } catch (error) {
          console.error(`Error getting token for user ${userId}:`, error);
          return undefined;
      }
  }

  // Wallet Methods
  async getUserWallet(userId: string): Promise<UserWallet> {
      if (!this.usersContainer) {
          const user = this.localUserTokens.get(userId) || { id: userId, wallet: { balance: 0, cryptoBalance: 0 } };
          this.localUserTokens.set(userId, user); // Ensure user exists in local map
          return user.wallet || { balance: 0, cryptoBalance: 0 };
      }

      try {
          const { resource: user } = await this.usersContainer.item(userId, userId).read();
          return user?.wallet || { balance: 0, cryptoBalance: 0 };
      } catch (error) {
          console.error(`Error fetching wallet for user ${userId}:`, error);
          return { balance: 0, cryptoBalance: 0 };
      }
  }

  async updateUserWallet(userId: string, wallet: UserWallet): Promise<void> {
      if (!this.usersContainer) {
          const user = this.localUserTokens.get(userId);
          if (user) {
              user.wallet = wallet;
              this.localUserTokens.set(userId, user);
          }
          return;
      }

      try {
          const { resource: user } = await this.usersContainer.item(userId, userId).read();
          if (user) {
              user.wallet = wallet;
              await this.usersContainer.item(userId, userId).replace(user);
          }
      } catch (error) {
          console.error(`Error updating wallet for user ${userId}:`, error);
          throw error;
      }
  }

  async depositFunds(userId: string, amount: number, type: 'crypto' | 'fiat'): Promise<UserWallet> {
      const wallet = await this.getUserWallet(userId);

      if (type === 'crypto') {
          // Simulate conversion rate: 100 USD = 0.0015 BTC (roughly)
          // Just keeping simple float math for demo
          wallet.cryptoBalance += amount;
          // Auto-convert to fiat for settlement capability
          wallet.balance += amount * 60000; // Assuming amount is BTC
      } else {
          wallet.balance += amount;
      }

      await this.updateUserWallet(userId, wallet);
      return wallet;
  }

  async processPayment(userId: string, orderId: string): Promise<boolean> {
      // 1. Get Order
      const order = await this.getOrder(orderId, userId);
      if (!order) throw new Error('Order not found');
      if (order.paymentStatus === PaymentStatus.Paid) return true;

      // 2. Get Wallet
      const wallet = await this.getUserWallet(userId);

      // 3. Check Balance
      if (wallet.balance < order.totalPrice) {
          throw new Error('Insufficient funds');
      }

      // 4. Deduct Funds
      wallet.balance -= order.totalPrice;
      await this.updateUserWallet(userId, wallet);

      // 5. Update Order Status
      await this.updateOrder(orderId, { paymentStatus: PaymentStatus.Paid });

      return true;
  }

  // Store configuration methods
  async getStoreConfig(userId: string, provider: string, storeId: string): Promise<any> {
    if (this.isCosmosDbInitialized && this.usersContainer) {
      try {
        const querySpec = {
          query: 'SELECT c.stores FROM c WHERE c.id = @userId',
          parameters: [
            {
              name: '@userId',
              value: userId
            }
          ]
        };

        const { resources } = await this.usersContainer.items.query(querySpec).fetchAll();
        if (resources.length === 0) return null;

        const userData = resources[0];
        return userData.stores?.[provider]?.[storeId] || null;
      } catch (error) {
        console.error('Error getting store config from Cosmos DB:', error);
        return null;
      }
    }
    return null;
  }

  async updateStoreConfig(userId: string, provider: string, storeId: string, config: any): Promise<void> {
    if (this.isCosmosDbInitialized && this.usersContainer) {
      try {
        // First, get the user document
        const { resource: user } = await this.usersContainer.item(userId, userId).read();

        // Initialize stores object if it doesn't exist
        const stores = user?.stores || {};
        if (!stores[provider]) {
          stores[provider] = {};
        }

        // Update the store config
        stores[provider][storeId] = {
          ...stores[provider][storeId],
          ...config,
          updatedAt: new Date().toISOString()
        };

        // Update the user document
        await this.usersContainer.items.upsert({
          id: userId,
          ...user,
          stores
        });
      } catch (error) {
        console.error('Error updating store config in Cosmos DB:', error);
        throw error;
      }
    }
  }

  async getUserStores(userId: string, provider: string): Promise<any[]> {
    if (this.isCosmosDbInitialized && this.usersContainer) {
      try {
        const querySpec = {
          query: 'SELECT c.stores FROM c WHERE c.id = @userId',
          parameters: [
            {
              name: '@userId',
              value: userId
            }
          ]
        };

        const { resources } = await this.usersContainer.items.query(querySpec).fetchAll();
        if (resources.length === 0) return [];

        const userData = resources[0];
        return userData.stores?.[provider] ? Object.values(userData.stores[provider]) : [];
      } catch (error) {
        console.error('Error getting user stores from Cosmos DB:', error);
        return [];
      }
    }
    return [];
  }

  async deleteStoreConfig(userId: string, provider: string, storeId: string): Promise<boolean> {
    if (this.isCosmosDbInitialized && this.usersContainer) {
      try {
        const { resource: user } = await this.usersContainer.item(userId, userId).read();
        if (!user?.stores?.[provider]?.[storeId]) return false;

        // Remove the store config
        delete user.stores[provider][storeId];

        // If no more stores for this provider, remove the provider entry
        if (Object.keys(user.stores[provider]).length === 0) {
          delete user.stores[provider];
        }

        // Update the user document
        await this.usersContainer.items.upsert(user);
        return true;
      } catch (error) {
        console.error('Error deleting store config from Cosmos DB:', error);
        return false;
      }
    }
    return false;
  }

  // Initialize local data from JSON files
  private initializeLocalData(): void {
    // Initialize local data from JSON files
    this.localBurgers = burgersData as Burger[];
    this.localToppings = toppingsData as Topping[];
    this.localOrders = [];
  }
}
