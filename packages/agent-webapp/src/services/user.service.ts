
import { ChatComponent } from '../components/chat.js';
import { HistoryComponent } from '../components/history.js';
import { burgerApiBaseUrl } from './orders.service.js';

// Chat and History components are defined in index.html
// with their respective ids so we can access them here
declare global {
  interface Window {
    chatHistory: HistoryComponent;
    chat: ChatComponent;
  }
}

let userIdPromise: Promise<string | undefined> | undefined;

export async function getUserId(refresh = false): Promise<string | undefined> {
  if (!refresh && userIdPromise) return userIdPromise;
  userIdPromise = (async () => {
    const response = await fetch(`/api/me`);
    const payload = await response.json();
    return payload?.id;
  })();
  return userIdPromise;
}

export async function initUserSession() {
  try {
    const userId = await getUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }

    // Set up user ID for chat history and chat components
    window.chatHistory.userId = userId;
    (window.chatHistory as unknown as HTMLElement).addEventListener('loadSession', (event) => {
      const { id, messages } = (event as CustomEvent).detail;
      window.chat.sessionId = id;
      window.chat.messages = messages;
    });

    window.chat.userId = userId;
    (window.chat as unknown as HTMLElement).addEventListener('messagesUpdated', () => {
      window.chatHistory.refresh();
    });
  } catch (error) {
    console.log('Error initializing user session:', error);
  }
}

// Wallet Functions
export async function getWalletBalance(userId: string) {
    try {
        const res = await fetch(`${burgerApiBaseUrl}/api/wallet?userId=${userId}`);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

export async function depositFunds(userId: string, amount: number, type: 'crypto' | 'fiat' = 'crypto') {
    try {
        const res = await fetch(`${burgerApiBaseUrl}/api/wallet/deposit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, amount, type })
        });
        return await res.json();
    } catch {
        return null;
    }
}
