
import { LitElement, css, html, nothing } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { repeat } from 'lit/directives/repeat.js';
import { customElement, state } from 'lit/decorators.js';
import { getUserInfo } from '../services/auth.service.js';
import { getUserId, getWalletBalance, depositFunds } from '../services/user.service.js';
import { fetchOrders, type BurgerOrder } from '../services/orders.service.js';
import copySvg from '../../assets/icons/copy.svg?raw';
import burgerOutlineSvg from '../../assets/icons/burger-outline.svg?raw';
import cardSvg from '../../assets/icons/card.svg?raw';

@customElement('azc-user-card')
export class UserCard extends LitElement {
  @state() protected userId = '';
  @state() protected isLoading = false;
  @state() protected hasError = false;
  @state() protected username = '';
  @state() protected isOpen = false;
  @state() protected activeTab = 'identity'; // identity | orders | wallet
  @state() protected orders: BurgerOrder[] = [];
  @state() protected ordersLoading = false;
  
  @state() protected walletBalance = { balance: 0, cryptoBalance: 0 };
  @state() protected walletLoading = false;

  constructor() {
    super();
    this.getUserId();
  }

  openModal() {
    this.isOpen = true;
    document.body.style.overflow = 'hidden';
    if(this.activeTab === 'orders') {
        this.loadOrders();
    } else if(this.activeTab === 'wallet') {
        this.loadWallet();
    }
  }

  closeModal() {
    this.isOpen = false;
    document.body.style.overflow = '';
  }

  switchTab(tab: string) {
      this.activeTab = tab;
      if(tab === 'orders') {
          this.loadOrders();
      } else if (tab === 'wallet') {
          this.loadWallet();
      }
  }

  protected handleNavClick = () => {
    this.openModal();
  };

  protected handleOverlayClick = (event: Event) => {
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  };

  protected handleEscapeKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      this.closeModal();
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.handleEscapeKey);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleEscapeKey);
    document.body.style.overflow = '';
  }

  protected renderLoading = () => html`<p class="message">Loading...</p>`;

  protected copyUserIdToClipboard = async () => {
    if (this.userId) {
      try {
        await navigator.clipboard.writeText(this.userId);
        // Select the user-id text
        const pre = (this as any).renderRoot.querySelector('.user-id');
        if (pre) {
          const range = document.createRange();
          range.selectNodeContents(pre);
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      } catch (error) {
        console.error('Failed to copy user ID:', error);
      }
    }
  };

  protected getUserId = async () => {
    this.isLoading = true;
    this.hasError = false;
    try {
      const authDetails = await getUserInfo();
      if (!authDetails) return;
      this.username = authDetails.userDetails;
      const id = await getUserId();
      if (!id) {
        throw new Error('Unable to retrieve user ID');
      }

      this.userId = id;
    } catch (error) {
      console.error('Error fetching user ID:', error);
      this.hasError = true;
    } finally {
      this.isLoading = false;
    }
  };

  protected async loadOrders() {
    if (!this.userId) return;
    this.ordersLoading = true;
    try {
        const userOrders = await fetchOrders({ userId: this.userId });
        if (userOrders) {
            this.orders = userOrders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        }
    } catch (e) {
        console.error("Failed to load orders", e);
    } finally {
        this.ordersLoading = false;
    }
  }
  
  protected async loadWallet() {
      if(!this.userId) return;
      this.walletLoading = true;
      const wallet = await getWalletBalance(this.userId);
      if(wallet) this.walletBalance = wallet;
      this.walletLoading = false;
  }
  
  protected async addFunds() {
      if(!this.userId) return;
      this.walletLoading = true;
      // Simulate adding 0.0015 BTC (~$100)
      const updated = await depositFunds(this.userId, 0.0015, 'crypto');
      if(updated) this.walletBalance = updated;
      this.walletLoading = false;
  }

  protected renderIdentityTab = () => html`
    <div class="card card-shine">
      <span class="burger">${unsafeSVG(burgerOutlineSvg)}</span>
      <div class="card-content">
        <h1>Contoso Burgers</h1>
        <h2>Membership Card</h2>
        <p>Card attributed to:</p>
        <div><pre>${this.username}</pre></div>
        <p>Unique user ID:</p>
        <div class="user-id-row">
          <pre class="user-id">${this.userId}</pre>
          <button
            class="copy-button"
            @click="${this.copyUserIdToClipboard}"
            title="Copy user ID to clipboard"
            aria-label="Copy user ID to clipboard"
          >
            <span class="visually-hidden">Copy</span>
            <span class="copy-icon">${unsafeSVG(copySvg)}</span>
          </button>
        </div>
        <div class="warning">This user ID is personal, do not share it with anyone!</div>
      </div>
    </div>
  `;

  protected renderOrdersTab = () => html`
    <div class="orders-container">
        <h3>Order History</h3>
        ${this.ordersLoading ? html`<div class="spinner"></div>` : nothing}
        ${!this.ordersLoading && this.orders.length === 0 ? html`<p class="empty-state">No orders found yet. Time to eat! 🍔</p>` : nothing}
        <div class="order-list">
            ${repeat(this.orders, (order) => order.id, (order) => html`
                <div class="order-item">
                    <div class="order-header">
                        <span class="order-date">${new Date(order.createdAt).toLocaleDateString()} ${new Date(order.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        <span class="order-status status-${order.status}">${order.status.replace('-', ' ')}</span>
                    </div>
                    <div class="order-items">
                        ${order.items.length} Items • $${order.totalPrice.toFixed(2)}
                    </div>
                    <div class="order-id-small">#${order.id.slice(-6)}</div>
                </div>
            `)}
        </div>
    </div>
  `;

  protected renderWalletTab = () => html`
    <div class="wallet-container">
        <h3>Chicha Wallet</h3>
        ${this.walletLoading ? html`<div class="spinner"></div>` : html`
            <div class="wallet-card">
                 <div class="balance-section">
                     <span class="label">Available Balance</span>
                     <span class="balance">$${this.walletBalance.balance.toFixed(2)}</span>
                     <span class="sub-balance">${this.walletBalance.cryptoBalance.toFixed(6)} BTC</span>
                 </div>
                 <div class="wallet-actions">
                     <button class="wallet-btn primary" @click=${this.addFunds}>Add Funds (Simulate)</button>
                     <button class="wallet-btn">Manage Cards</button>
                 </div>
            </div>
    
            <div class="settlement-info">
                 <h4>Settlement Settings</h4>
                 <div class="setting-row">
                     <span>Merchant</span>
                     <strong>CoinGate Services</strong>
                 </div>
                 <div class="setting-row">
                     <span>Auto-Conversion</span>
                     <strong class="status-active">Enabled</strong>
                 </div>
                 <p class="info-text">Payments are processed via CoinGate and settled to Uber Eats in Fiat currency automatically.</p>
            </div>
        `}
    </div>
  `;

  protected renderNavLink = () => html`
    <button @click="${this.handleNavClick}" class="member-card-link">
      <span class="card-icon">${unsafeSVG(cardSvg)}</span>
      Dashboard
    </button>
  `;

  protected renderModal = () => html`
    <div class="modal-overlay" @click="${this.handleOverlayClick}">
      <div class="modal-content">
        <div class="modal-header">
            <button class="close-button" @click="${this.closeModal}" aria-label="Close modal">×</button>
            <div class="tabs">
                <button class="tab ${this.activeTab === 'identity' ? 'active' : ''}" @click=${() => this.switchTab('identity')}>Identity</button>
                <button class="tab ${this.activeTab === 'orders' ? 'active' : ''}" @click=${() => this.switchTab('orders')}>Orders</button>
                <button class="tab ${this.activeTab === 'wallet' ? 'active' : ''}" @click=${() => this.switchTab('wallet')}>Wallet</button>
            </div>
        </div>
        <div class="modal-body">
            ${this.activeTab === 'identity' ? (this.isLoading ? this.renderLoading() : this.renderIdentityTab()) : nothing}
            ${this.activeTab === 'orders' ? this.renderOrdersTab() : nothing}
            ${this.activeTab === 'wallet' ? this.renderWalletTab() : nothing}
        </div>
      </div>
    </div>
  `;

  protected override render() {
    return html` ${this.renderNavLink()} ${this.isOpen ? this.renderModal() : nothing} `;
  }

  static override styles = css`
    :host {
      --azc-primary: linear-gradient(135deg, #de471d 0%, #ff6b3d 100%);
      --azc-border-radius: 16px;
      --azc-text-color: #212121;
    }
    
    /* Nav Link Styles - High Contrast */
    .member-card-link {
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid #e0e0e0;
      color: #212121 !important; /* Forced dark color */
      text-decoration: none;
      padding: 0.6rem 1.2rem;
      border-radius: 50px;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.95rem;
      font-weight: 700;
      box-shadow: 0 2px 5px rgba(0,0,0,0.05);
    }
    .member-card-link:hover {
      background: #fff;
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    .card-icon {
      display: inline-block;
      fill: var(--azc-primary);
      width: 20px;
      height: 20px;
    }

    /* Modal Styles - Centering Fix */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(5px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    }
    .modal-content {
      position: relative;
      width: 90%;
      max-width: 700px;
      max-height: 90vh;
      background: #F9F9F9;
      border-radius: var(--azc-border-radius);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      color: #333;
      /* Ensure it's visible on mobile */
      margin: auto;
    }
    .modal-header {
        background: white;
        padding: 1rem 1.5rem;
        border-bottom: 1px solid #eee;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        flex-shrink: 0;
    }
    .close-button {
      position: absolute;
      top: 50%;
      right: 1rem;
      transform: translateY(-50%);
      background: none;
      border: none;
      font-size: 2rem;
      line-height: 1;
      cursor: pointer;
      color: #666;
      z-index: 10;
      padding: 0.5rem;
    }
    .close-button:hover { color: #000; }

    .tabs {
        display: flex;
        gap: 0.5rem;
        background: #f0f0f0;
        padding: 4px;
        border-radius: 8px;
        flex-wrap: wrap;
        justify-content: center;
    }
    .tab {
        background: none;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        color: #666;
        transition: all 0.2s;
        font-size: 0.9rem;
    }
    .tab.active {
        background: white;
        color: #FF5722;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    
    .modal-body {
        flex: 1;
        overflow-y: auto;
        padding: 1.5rem;
        color: #333;
        /* Fix for scrolling inside modal */
        min-height: 300px;
    }

    /* Identity Card Styles */
    svg {
      fill: currentColor;
      width: 100%;
    }
    h1 {
      font-size: 2em;
      color: #fff;
      margin: 0;
      font-weight: 600;
      text-transform: uppercase;
    }
    h1, h2 { font-family: 'Sofia Sans Condensed', sans-serif; }
    h1, h2, pre, .warning { text-shadow: 0 1px 0px rgba(0, 0, 0, 0.5); }
    
    .card {
      position: relative;
      background: var(--azc-primary);
      border-radius: var(--azc-border-radius);
      padding: 2rem;
      box-shadow: 0 10px 30px rgba(222, 71, 29, 0.3);
      font-family: 'Sofia Sans Condensed', sans-serif;
      text-align: left;
      width: 100%;
      box-sizing: border-box;
      color: #fff;
      font-size: 1.2rem;
    }
    .card h2 {
        font-size: 1em;
        margin: 0;
        font-weight: 600;
        font-style: italic;
        text-transform: uppercase;
    }
    .card pre {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0;
        white-space: normal;
        line-break: anywhere;
    }
    .card p { margin: 1.5rem 0 0 0; }
    
    .card-shine {
      --shine-deg: 45deg;
      position: relative;
      background-repeat: no-repeat;
      background-position: 0% 0, 0 0;
      background-image: linear-gradient(var(--shine-deg), transparent 20%, transparent 45%, #ffffff30 50%, #ffffff30 51%, transparent 56%, transparent 100%);
      background-size: 250% 250%, 100% 100%;
      transition: background-position 1.5s ease;
    }
    .card-shine:hover { background-position: 90% 0, 0 0; }
    
    .burger {
      z-index: 1;
      width: 10rem;
      height: 10rem;
      display: inline-block;
      vertical-align: middle;
      opacity: 0.4;
      position: absolute;
      right: -1rem;
      top: 3.5rem;
      pointer-events: none;
      clip-path: inset(0 1rem 0 0);
    }
    .user-id-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      border: 1px solid #ffffff;
      padding: 1rem;
      border-radius: calc(var(--azc-border-radius) / 2);
      margin: 0.5rem 0;
    }
    .copy-button {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.3rem;
      display: flex;
      align-items: center;
      border-radius: 4px;
      transition: background 0.2s;
    }
    .copy-button:hover { background: #ffffff30; }
    .copy-icon {
      width: 1.5rem;
      height: 1.5rem;
      display: inline-block;
      vertical-align: middle;
      color: #fff;
    }

    /* Orders Tab Styles */
    .orders-container h3, .wallet-container h3 {
        margin-top: 0;
        color: #333;
        border-bottom: 2px solid #FF5722;
        padding-bottom: 0.5rem;
        display: inline-block;
    }
    .order-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-top: 1rem;
    }
    .order-item {
        background: white;
        border-radius: 12px;
        padding: 1rem;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        border: 1px solid #eee;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .order-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .order-date { font-size: 0.85rem; color: #888; }
    .order-status {
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        padding: 4px 8px;
        border-radius: 4px;
        background: #eee;
        color: #555;
    }
    .status-pending { background: #FFF3E0; color: #E65100; }
    .status-in-preparation { background: #E3F2FD; color: #1565C0; }
    .status-ready { background: #E8F5E9; color: #2E7D32; }
    .status-completed { background: #EEEEEE; color: #616161; }
    
    .order-items { font-weight: 600; font-size: 1.1rem; color: #333; }
    .order-id-small { font-size: 0.8rem; color: #aaa; font-family: monospace; }
    .empty-state { text-align: center; color: #888; margin-top: 2rem; font-style: italic; }
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid rgba(0,0,0,0.1);
      border-left-color: #FF5722;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 2rem auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Wallet Tab Styles */
    .wallet-card {
        background: linear-gradient(135deg, #1A1A1A 0%, #333 100%);
        color: white;
        border-radius: 16px;
        padding: 2rem;
        margin-bottom: 2rem;
        box-shadow: 0 10px 20px rgba(0,0,0,0.2);
        text-align: center;
    }
    .balance-section { display: flex; flex-direction: column; align-items: center; margin-bottom: 2rem; }
    .balance-section .label { font-size: 0.9rem; opacity: 0.7; text-transform: uppercase; letter-spacing: 1px; }
    .balance-section .balance { font-size: 3rem; font-weight: 700; margin: 0.5rem 0; }
    .balance-section .sub-balance { font-family: monospace; opacity: 0.5; }
    
    .wallet-actions { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
    .wallet-btn {
        background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.2);
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
    }
    .wallet-btn:hover { background: rgba(255,255,255,0.2); }
    .wallet-btn.primary { background: #FF5722; border-color: #FF5722; }
    .wallet-btn.primary:hover { background: #F4511E; }

    .settlement-info {
        background: white;
        border-radius: 12px;
        padding: 1.5rem;
        border: 1px solid #eee;
    }
    .setting-row {
        display: flex;
        justify-content: space-between;
        padding: 0.8rem 0;
        border-bottom: 1px solid #f5f5f5;
    }
    .status-active { color: #4CAF50; }
    .info-text { font-size: 0.85rem; color: #888; margin-top: 1rem; line-height: 1.5; }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      border: 0;
    }
  `;
}
