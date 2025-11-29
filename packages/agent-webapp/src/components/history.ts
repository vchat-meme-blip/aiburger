import { LitElement, css, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { customElement, property, state } from 'lit/decorators.js';
import deleteSvg from '../../assets/icons/delete.svg?raw';

export type ChatSession = {
  id: string;
  title: string;
};

export type HistoryComponentState = {
  hasError: boolean;
  isLoading: boolean;
};

export type HistoryComponentOptions = {
  apiUrl?: string;
  strings: {
    chats: string;
    deleteChatButton: string;
    errorMessage: string;
    noChatHistory: string;
  };
};

export const historyDefaultOptions: HistoryComponentOptions = {
  apiUrl: '',
  strings: {
    chats: 'Chat History',
    deleteChatButton: 'Delete chat',
    errorMessage: 'Cannot load chat history',
    noChatHistory: 'No chat history found',
  },
};

@customElement('azc-history')
export class HistoryComponent extends LitElement {
  @property({
    type: Object,
    converter: (value) => ({ ...historyDefaultOptions, ...JSON.parse(value ?? '{}') }),
  })
  options: HistoryComponentOptions = historyDefaultOptions;

  @property({ type: Boolean, reflect: true }) open = false;
  @property() userId = '';
  @state() protected chats: ChatSession[] = [];
  @state() protected hasError = false;
  @state() protected isLoading = false;

  override connectedCallback() {
      super.connectedCallback();
      window.addEventListener('azc-toggle-history', () => this.toggle());

      // Close on Escape key
      document.addEventListener('keydown', (e) => {
          if(e.key === 'Escape' && this.open) this.open = false;
      });
  }

  toggle() {
      this.open = !this.open;
      if(this.open && this.userId) {
          this.refresh();
      }
  }

  async onChatClicked(sessionId: string) {
    if (!this.userId) return;
    try {
      this.isLoading = true;
      const response = await fetch(`${this.getApiUrl()}/api/chats/${sessionId}/?userId=${this.userId}`);
      if (!response.ok) throw new Error(`Failed to load chat: ${response.statusText}`);

      const messages = await response.json();
      const loadSessionEvent = new CustomEvent('loadSession', {
        detail: { id: sessionId, messages },
        bubbles: true,
      });
      (this as unknown as HTMLElement).dispatchEvent(loadSessionEvent);

      // Close drawer on selection
      this.open = false;
    } catch (error) {
      console.error(error);
    }
    this.isLoading = false;
  }

  async onDeleteChatClicked(sessionId: string) {
    if (!this.userId) return;
    try {
      this.chats = this.chats.filter((chat) => chat.id !== sessionId);
      await fetch(`${this.getApiUrl()}/api/chats/${sessionId}?userId=${this.userId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error(error);
    }
  }

  override requestUpdate(name?: string, oldValue?: any) {
    if (name === 'userId' && this.userId) {
        // Don't auto refresh on ID change, wait for open
    }
    super.requestUpdate(name, oldValue);
  }

  async refresh() {
    if (!this.userId) return;
    this.isLoading = true;
    this.hasError = false;
    try {
      const response = await fetch(`${this.getApiUrl()}/api/chats?userId=${this.userId}`);
      if (!response.ok) {
          if (response.status === 400) {
              console.warn('Chat history refresh skipped: Invalid User ID');
              this.isLoading = false;
              return;
          }
          throw new Error(`API Error: ${response.status}`);
      }

      const chats = await response.json();
      if (!Array.isArray(chats)) {
          this.chats = [];
      } else {
          this.chats = chats;
      }
    } catch (error) {
      this.hasError = true;
    } finally {
      this.isLoading = false;
    }
  }

  protected getApiUrl = () => this.options.apiUrl || import.meta.env.VITE_API_URL || '';

  protected renderLoader = () =>
    this.isLoading ? html`<div class="loader-spinner"></div>` : nothing;

  protected renderNoChatHistory = () =>
    this.chats.length === 0 && !this.isLoading && !this.hasError
      ? html`<div class="empty-state">${this.options.strings.noChatHistory}</div>`
      : nothing;

  protected renderError = () =>
    this.hasError ? html`<div class="error-state">${this.options.strings.errorMessage}</div>` : nothing;

  protected renderChatEntry = (entry: ChatSession) => html`
    <div class="chat-card" @click=${() => this.onChatClicked(entry.id)}>
        <div class="chat-info">
            <span class="chat-title">${entry.title || 'Untitled Chat'}</span>
            <span class="chat-date">Session #${entry.id.slice(-4)}</span>
        </div>
        <button
            class="delete-btn"
            @click=${(e: Event) => { e.stopPropagation(); this.onDeleteChatClicked(entry.id); }}
            title="${this.options.strings.deleteChatButton}"
        >
            ${unsafeSVG(deleteSvg)}
        </button>
    </div>
  `;

  protected override render() {
    return html`
        <div class="backdrop ${this.open ? 'open' : ''}" @click=${() => this.open = false}></div>
        <div class="drawer ${this.open ? 'open' : ''}">
            <div class="drawer-header">
                <h2>${this.options.strings.chats}</h2>
                <button class="close-btn" @click=${() => this.open = false}>×</button>
            </div>
            <div class="drawer-content">
                ${this.renderLoader()}
                ${repeat(this.chats, (entry) => entry.id, (entry) => this.renderChatEntry(entry))}
                ${this.renderNoChatHistory()}
                ${this.renderError()}
            </div>
        </div>
    `;
  }

  static override styles = css`
    :host {
        position: fixed;
        z-index: 2000;
        top: 0;
        right: 0;
        height: 100vh;
        pointer-events: none; /* Allow clicking through when closed */
    }

    .backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(2px);
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
    }

    .backdrop.open {
        opacity: 1;
        pointer-events: auto;
    }

    .drawer {
        position: absolute;
        top: 0;
        right: 0;
        width: 350px;
        height: 100%;
        background: #fff;
        box-shadow: -5px 0 25px rgba(0,0,0,0.1);
        transform: translateX(100%);
        transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        max-width: 90vw;
    }

    .drawer.open {
        transform: translateX(0);
    }

    .drawer-header {
        padding: 1.5rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #eee;
    }

    h2 {
        margin: 0;
        font-family: 'Sofia Sans Condensed', sans-serif;
        font-size: 1.5rem;
        text-transform: uppercase;
        color: #212121;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 2rem;
        line-height: 1;
        cursor: pointer;
        color: #999;
        padding: 0 0.5rem;
        transition: color 0.2s;
    }
    .close-btn:hover { color: #333; }

    .drawer-content {
        flex: 1;
        overflow-y: auto;
        padding: 1rem;
    }

    /* Chat Card Styling */
    .chat-card {
        background: #f9f9f9;
        border-radius: 12px;
        padding: 1rem;
        margin-bottom: 0.8rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.2s;
        border: 1px solid transparent;
    }

    .chat-card:hover {
        background: #fff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        border-color: #eee;
    }

    .chat-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
        overflow: hidden;
    }

    .chat-title {
        font-weight: 600;
        color: #333;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .chat-date {
        font-size: 0.8rem;
        color: #888;
        font-family: monospace;
    }

    .delete-btn {
        background: none;
        border: none;
        color: #ccc;
        cursor: pointer;
        padding: 6px;
        border-radius: 50%;
        transition: all 0.2s;
        opacity: 0; /* Hidden by default for cleaner look */
    }

    .chat-card:hover .delete-btn {
        opacity: 1;
    }

    .delete-btn:hover {
        background: #FFEBEE;
        color: #D32F2F;
    }

    .delete-btn svg { width: 18px; height: 18px; fill: currentColor; }

    /* States */
    .empty-state, .error-state {
        text-align: center;
        margin-top: 3rem;
        color: #999;
        font-style: italic;
    }

    .loader-spinner {
        width: 30px;
        height: 30px;
        border: 3px solid #f3f3f3;
        border-top: 3px solid #FF5722;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 2rem auto;
    }

    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  `;
}
