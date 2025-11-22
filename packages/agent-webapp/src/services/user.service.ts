
import { ChatComponent } from '../components/chat.js';
import { HistoryComponent } from '../components/history.js';
import { burgerApiBaseUrl } from './orders.service.js';

// Chat and History components are defined in index.html
declare global {
  interface Window {
    chatHistory: HistoryComponent;
    chat: ChatComponent;
  }
}

// State for View Switching
type ViewName = 'chat' | 'schedules' | 'promos' | 'wallet';
let activeView: ViewName = 'chat';

export function setActiveView(view: ViewName) {
    activeView = view;
    // Dispatch event for UI updates
    window.dispatchEvent(new CustomEvent('azc-view-change', { detail: { view } }));
    
    // Handle DOM visibility
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('active');
    });
    document.getElementById(`view-${view}`)?.classList.add('active');
}

export function getActiveView() {
    return activeView;
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
      // If on login page, this is expected
      return;
    }

    // Set up user ID for components if they exist
    if(window.chatHistory) {
        window.chatHistory.userId = userId;
        (window.chatHistory as unknown as HTMLElement).addEventListener('loadSession', (event) => {
          const { id, messages } = (event as CustomEvent).detail;
          if(window.chat) {
              window.chat.sessionId = id;
              window.chat.messages = messages;
              // If loading a chat, switch to chat view
              setActiveView('chat');
          }
        });
    }

    if(window.chat) {
        window.chat.userId = userId;
        (window.chat as unknown as HTMLElement).addEventListener('messagesUpdated', () => {
          if(window.chatHistory) window.chatHistory.refresh();
        });
    }
    
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
