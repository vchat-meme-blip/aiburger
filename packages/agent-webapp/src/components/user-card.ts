
import { LitElement, css, html, nothing } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { repeat } from 'lit/directives/repeat.js';
import { customElement, state } from 'lit/decorators.js';
import { getUserInfo } from '../services/auth.service.js';
import { getUserId, getWalletBalance, depositFunds } from '../services/user.service.js';
import { fetchOrders, type BurgerOrder, burgerApiBaseUrl } from '../services/orders.service.js';
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
  @state() protected activeTab = 'identity'; 
  @state() protected orders: BurgerOrder[] = [];
  @state() protected ordersLoading = false;
  @state() protected walletBalance = { balance: 0, cryptoBalance: 0 };
  @state() protected walletLoading = false;
  @state() protected uberConnected = false;
  @state() protected uberLoading = false;

  constructor() {
    super();
    this.getUserId();
  }

  openModal() {
    this.isOpen = true;
    document.body.style.overflow = 'hidden';
    if(this.activeTab === 'orders') this.loadOrders();
    else if(this.activeTab === 'wallet') this.loadWallet();
    else if(this.activeTab === 'integrations') this.checkUberStatus();
  }

  closeModal() {
    this.isOpen = false;
    document.body.style.overflow = '';
  }

  switchTab(tab: string) {
      this.activeTab = tab;
      if(tab === 'orders') this.loadOrders();
      else if (tab === 'wallet') this.loadWallet();
      else if (tab === 'integrations') this.checkUberStatus();
  }

  protected handleOverlayClick = (event: Event) => {
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  };

  protected handleEscapeKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.closeModal();
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

  protected renderLoading = () => html`<div class="spinner dark"></div>`;

  protected copyUserIdToClipboard = async () => {
    if (this.userId) {
      try {
        await navigator.clipboard.writeText(this.userId);
      } catch (error) {
        console.error('Failed to copy user ID:', error);
      }
    }
  };

  protected getUserId = async () => {
    this.isLoading = true;
    try {
      const authDetails = await getUserInfo();
      if (!authDetails) return;
      this.username = authDetails.userDetails;
      const id = await getUserId();
      if (id) this.userId = id;
    } catch (error) {
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
      const updated = await depositFunds(this.userId, 0.0015, 'crypto');
      if(updated) this.walletBalance = updated;
      this.walletLoading = false;
  }

  protected async checkUberStatus() {
      if (!this.userId) return;
      this.uberLoading = true;
      try {
          const res = await fetch(`${burgerApiBaseUrl}/api/uber/status?userId=${this.userId}`);
          if (res.ok) {
              const data = await res.json();
              this.uberConnected = data.connected;
          }
      } catch(e) {
          console.error("Failed to check uber status", e);
      } finally {
          this.uberLoading = false;
      }
  }

  protected connectUber() {
      if (!this.userId) return;
      // Open in new window
      const url = `${burgerApiBaseUrl}/api/uber/login?userId=${this.userId}`;
      window.open(url, 'Connect Uber', 'width=500,height=700');
      
      // Poll for status change
      const poll = setInterval(async () => {
          await this.checkUberStatus();
          if (this.uberConnected) clearInterval(poll);
      }, 2000);
      
      // Stop polling after 2 mins
      setTimeout(() => clearInterval(poll), 120000);
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
            title="Copy"
          >
            <span class="copy-icon">${unsafeSVG(copySvg)}</span>
          </button>
        </div>
        <div class="warning">Keep this ID private!</div>
      </div>
    </div>
  `;

  protected renderOrdersTab = () => html`
    <div class="orders-container">
        ${this.ordersLoading ? html`<div class="spinner dark"></div>` : nothing}
        ${!this.ordersLoading && this.orders.length === 0 ? html`<p class="empty-state">No orders found yet. Time to eat! 🍔</p>` : nothing}
        <div class="order-list">
            ${repeat(this.orders, (order) => order.id, (order) => html`
                <div class="order-item">
                    <div class="order-header">
                        <span class="order-date">${new Date(order.createdAt).toLocaleDateString()}</span>
                        <span class="order-status status-${order.status}">${order.status.replace('-', ' ')}</span>
                    </div>
                    <div class="order-items">
                        ${order.items.length} Items • $${order.totalPrice.toFixed(2)}
                    </div>
                    <div class="order-id-small">Order #${order.id.slice(-6)}</div>
                </div>
            `)}
        </div>
    </div>
  `;

  protected renderWalletTab = () => html`
    <div class="wallet-container">
        ${this.walletLoading ? html`<div class="spinner dark"></div>` : html`
            <div class="wallet-card">
                 <div class="balance-section">
                     <span class="label">Total Balance</span>
                     <span class="balance">$${this.walletBalance.balance.toFixed(2)}</span>
                     <span class="sub-balance">${this.walletBalance.cryptoBalance.toFixed(6)} BTC</span>
                 </div>
                 <div class="wallet-actions">
                     <button class="wallet-btn primary" @click=${this.addFunds}>Add Funds (Sim)</button>
                 </div>
            </div>
    
            <div class="settlement-info">
                 <h4 style="color: #212121; margin-top:0;">Settings</h4>
                 <div class="setting-row">
                     <span>Auto-Conversion</span>
                     <strong class="status-active">Enabled</strong>
                 </div>
            </div>
        `}
    </div>
  `;

  protected renderIntegrationsTab = () => html`
      <div class="integrations-container">
          <div class="integration-card">
              <div class="int-header">
                  <div class="int-logo uber">Uber</div>
                  <div class="int-info">
                      <h3>Uber Eats</h3>
                      <p>Connect to order from real restaurants near you.</p>
                  </div>
              </div>
              <div class="int-action">
                  ${this.uberLoading 
                      ? html`<div class="spinner small"></div>` 
                      : this.uberConnected 
                          ? html`<button class="btn-connected" disabled>Connected ✅</button>`
                          : html`<button class="btn-connect" @click=${this.connectUber}>Connect Uber</button>`
                  }
              </div>
          </div>
          
          <div class="integration-card disabled">
              <div class="int-header">
                  <div class="int-logo dd">DD</div>
                  <div class="int-info">
                      <h3>DoorDash</h3>
                      <p>Coming soon...</p>
                  </div>
              </div>
              <div class="int-action">
                  <button class="btn-connect" disabled>Coming Soon</button>
              </div>
          </div>
      </div>
  `;

  protected renderModal = () => html`
    <div class="modal-overlay" @click="${this.handleOverlayClick}">
      <div class="modal-content">
        <div class="modal-header">
            <div class="tabs">
                <button class="tab ${this.activeTab === 'identity' ? 'active' : ''}" @click=${() => this.switchTab('identity')}>Identity</button>
                <button class="tab ${this.activeTab === 'orders' ? 'active' : ''}" @click=${() => this.switchTab('orders')}>Orders</button>
                <button class="tab ${this.activeTab === 'wallet' ? 'active' : ''}" @click=${() => this.switchTab('wallet')}>Wallet</button>
                <button class="tab ${this.activeTab === 'integrations' ? 'active' : ''}" @click=${() => this.switchTab('integrations')}>Apps</button>
            </div>
            <button class="close-button" @click="${this.closeModal}">×</button>
        </div>
        <div class="modal-body">
            ${this.activeTab === 'identity' ? (this.isLoading ? this.renderLoading() : this.renderIdentityTab()) : nothing}
            ${this.activeTab === 'orders' ? this.renderOrdersTab() : nothing}
            ${this.activeTab === 'wallet' ? this.renderWalletTab() : nothing}
            ${this.activeTab === 'integrations' ? this.renderIntegrationsTab() : nothing}
        </div>
      </div>
    </div>
  `;

  protected override render() {
    return html`${this.isOpen ? this.renderModal() : nothing}`;
  }

  static override styles = css`
    :host {
      --azc-primary: linear-gradient(135deg, #de471d 0%, #ff6b3d 100%);
      --azc-border-radius: 16px;
    }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background-color: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    }
    .modal-content {
      position: relative;
      width: 90%;
      max-width: 600px;
      max-height: 85vh;
      background: #FFFFFF; /* Explicit White Background */
      border-radius: 24px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      color: #212121; /* Explicit Dark Text */
      overflow: hidden;
    }
    
    .modal-header {
        padding: 1.5rem;
        border-bottom: 1px solid #f0f0f0;
        display: flex;
        justify-content: center;
        position: relative;
        background: #fff;
    }
    
    .close-button {
      position: absolute;
      right: 1.5rem;
      top: 50%;
      transform: translateY(-50%);
      background: #f5f5f5;
      border: none;
      border-radius: 50%;
      width: 32px; height: 32px;
      font-size: 1.5rem;
      line-height: 1;
      cursor: pointer;
      color: #666;
      display: flex; align-items: center; justify-content: center;
    }
    .close-button:hover { background: #eee; color: #000; }

    /* Pill Tabs */
    .tabs {
        display: flex;
        background: #f5f5f5;
        padding: 4px;
        border-radius: 50px;
        overflow-x: auto;
    }
    .tab {
        background: transparent;
        border: none;
        padding: 8px 16px;
        border-radius: 50px;
        cursor: pointer;
        font-weight: 600;
        color: #757575;
        transition: all 0.2s;
        font-size: 0.85rem;
        white-space: nowrap;
    }
    .tab.active {
        background: #212121;
        color: #fff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    
    .modal-body {
        flex: 1;
        overflow-y: auto;
        padding: 2rem;
        color: #212121;
    }

    /* Identity Card */
    .card {
      position: relative;
      background: var(--azc-primary);
      border-radius: 20px;
      padding: 2rem;
      box-shadow: 0 10px 30px rgba(222, 71, 29, 0.25);
      color: #fff;
      font-family: 'Sofia Sans Condensed', sans-serif;
    }
    .card h1 { font-size: 2rem; margin: 0; text-transform: uppercase; }
    .card h2 { font-size: 1rem; margin: 0; opacity: 0.8; font-weight: 400; text-transform: uppercase; letter-spacing: 2px; }
    .card pre { font-size: 1.5rem; font-weight: 700; margin: 0.5rem 0; white-space: normal; line-break: anywhere; font-family: monospace; }
    .card p { margin: 1.5rem 0 0.5rem 0; opacity: 0.8; font-size: 0.9rem; }
    
    .card-shine {
      background: linear-gradient(135deg, #de471d 0%, #ff6b3d 100%);
      overflow: hidden;
    }
    
    .burger {
      position: absolute; right: -20px; bottom: -20px;
      width: 180px; height: 180px; opacity: 0.15; pointer-events: none;
    }
    
    .user-id-row {
      display: flex; align-items: center; gap: 10px;
      background: rgba(255,255,255,0.15);
      padding: 10px 15px; border-radius: 12px;
    }
    .copy-button {
      background: none; border: none; cursor: pointer; padding: 5px;
      color: white; opacity: 0.8; transition: opacity 0.2s;
    }
    .copy-button:hover { opacity: 1; }
    .copy-icon { width: 20px; height: 20px; display: block; fill: currentColor; }
    
    /* Orders List */
    .order-list { display: flex; flex-direction: column; gap: 1rem; }
    .order-item {
        background: #fff;
        border: 1px solid #eee;
        border-radius: 12px;
        padding: 1rem;
        box-shadow: 0 2px 5px rgba(0,0,0,0.02);
    }
    .order-header { display: flex; justify-content: space-between; margin-bottom: 0.5rem; }
    .order-date { font-size: 0.85rem; color: #888; }
    .order-status { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; padding: 4px 8px; border-radius: 4px; background: #eee; color: #555; }
    .status-ready { background: #E8F5E9; color: #2E7D32; }
    .order-items { font-weight: 600; font-size: 1.1rem; color: #212121; }
    .order-id-small { font-size: 0.8rem; color: #bbb; margin-top: 5px; font-family: monospace; }
    .empty-state { text-align: center; color: #888; margin-top: 2rem; font-style: italic; }

    /* Wallet */
    .wallet-card {
        background: #212121;
        color: white;
        border-radius: 20px;
        padding: 2rem;
        text-align: center;
        margin-bottom: 2rem;
        box-shadow: 0 10px 30px rgba(0,0,0,0.15);
    }
    .balance-section .label { opacity: 0.6; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; }
    .balance-section .balance { font-size: 3rem; font-weight: 700; margin: 10px 0; display: block; }
    .sub-balance { background: rgba(255,255,255,0.1); padding: 4px 10px;kz border-radius: 20px; font-size: 0.9rem; font-family: monospace; }
    .wallet-btn {
        background: #FF5722; color: white; border: none;
        padding: 12px 24px; border-radius: 50px; font-weight: 600;
        cursor: pointer; margin-top: 1.5rem; font-size: 1rem;
        transition: transform 0.2s;
    }
    .wallet-btn:hover { transform: translateY(-2px); background: #F4511E; }

    .settlement-info { background: #f9f9f9; padding: 1.5rem; border-radius: 16px; border: 1px solid #eee; }
    .setting-row { display: flex; justify-content: space-between; font-size: 0.95rem; }
    .status-active { color: #4CAF50; }

    /* Integrations */
    .integrations-container { display: flex; flex-direction: column; gap: 1rem; }
    .integration-card {
        background: white;
        border: 1px solid #eee;
        border-radius: 16px;
        padding: 1.5rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.2s;
    }
    .integration-card:hover { border-color: #ddd; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .integration-card.disabled { opacity: 0.6; filter: grayscale(1); pointer-events: none; }
    
    .int-header { display: flex; gap: 1rem; align-items: center; }
    .int-logo { 
        width: 50px; height: 50px; background: #000; color: white; 
        border-radius: 12px; display: flex; align-items: center; justify-content: center; 
        font-weight: 800; font-size: 1.2rem;
    }
    .int-logo.dd { background: #FF3008; }
    
    .int-info h3 { margin: 0 0 4px 0; font-size: 1.1rem; }
    .int-info p { margin: 0; color: #666; font-size: 0.9rem; }
    
    .btn-connect {
        background: #000; color: white; border: none; padding: 8px 16px;
        border-radius: 8px; cursor: pointer; font-weight: 600;
        transition: background 0.2s;
    }
    .btn-connect:hover { background: #333; }
    .btn-connected {
        background: #E8F5E9; color: #2E7D32; border: 1px solid #A5D6A7;
        padding: 8px 16px; border-radius: 8px; font-weight: 600;
    }

    /* Spinner */
    .spinner.dark {
      width: 40px; height: 40px;
      border: 4px solid #eee; border-left-color: #FF5722;
      border-radius: 50%; animation: spin 1s linear infinite; margin: 3rem auto;
    }
    .spinner.small {
      width: 24px; height: 24px;
      border: 3px solid #eee; border-left-color: #000;
      border-radius: 50%; animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;
}
