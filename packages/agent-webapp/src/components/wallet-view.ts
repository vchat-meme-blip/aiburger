
import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { getUserId, getWalletBalance, depositFunds } from '../services/user.service.js';

@customElement('azc-wallet-view')
export class WalletViewComponent extends LitElement {
  @state() balance = { balance: 0, cryptoBalance: 0 };
  @state() loading = false;

  async connectedCallback() {
      super.connectedCallback();
      this.loadWallet();
  }

  async loadWallet() {
      const userId = await getUserId();
      if(userId) {
          const w = await getWalletBalance(userId);
          if(w) this.balance = w;
      }
  }

  async addFunds() {
      const userId = await getUserId();
      if(userId) {
          this.loading = true;
          await depositFunds(userId, 0.0015, 'crypto');
          await this.loadWallet();
          this.loading = false;
      }
  }

  render() {
    return html`
      <div class="view-header">
        <h1>Universal Wallet</h1>
        <p>Manage crypto, fiat, and corporate cards in one place.</p>
      </div>

      <div class="wallet-layout">
          <!-- Main Balance Card -->
          <div class="balance-card">
              <div class="card-bg"></div>
              <div class="card-content">
                  <span class="label">Total Balance (USD Equiv)</span>
                  <div class="amount">$${this.balance.balance.toFixed(2)}</div>
                  <div class="crypto-amount">
                      <span>${this.balance.cryptoBalance.toFixed(6)} BTC</span>
                      <span class="separator">•</span>
                      <span>0.00 SOL</span>
                  </div>
                  <div class="actions">
                      <button class="action-btn primary" @click=${this.addFunds} ?disabled=${this.loading}>
                          ${this.loading ? 'Processing...' : 'Deposit Crypto'}
                      </button>
                      <button class="action-btn">Withdraw</button>
                  </div>
              </div>
          </div>

          <!-- Integration Grid -->
          <div class="integrations-grid">
              <div class="integration-item">
                  <div class="logo-area" style="background: #2196F3;">CG</div>
                  <div class="info">
                      <h4>CoinGate</h4>
                      <p>Crypto Payment Gateway</p>
                  </div>
                  <div class="status active">Connected</div>
              </div>
              
              <div class="integration-item">
                  <div class="logo-area" style="background: #673AB7;">K</div>
                  <div class="info">
                      <h4>Kast</h4>
                      <p>Corporate Cards</p>
                  </div>
                  <button class="connect-btn">Connect</button>
              </div>

              <div class="integration-item">
                  <div class="logo-area" style="background: #E91E63;">B</div>
                  <div class="info">
                      <h4>Bitrefill</h4>
                      <p>Gift Cards & Vouchers</p>
                  </div>
                  <button class="connect-btn">Connect</button>
              </div>
          </div>

          <!-- Transaction List placeholder -->
          <div class="transactions">
              <h3>Recent Activity</h3>
              <div class="tx-item">
                  <div class="tx-icon in">↓</div>
                  <div class="tx-info">
                      <div class="tx-title">Deposit (BTC)</div>
                      <div class="tx-date">Today, 10:23 AM</div>
                  </div>
                  <div class="tx-amount positive">+$100.00</div>
              </div>
              <div class="tx-item">
                  <div class="tx-icon out">↑</div>
                  <div class="tx-info">
                      <div class="tx-title">Uber Eats Settlement</div>
                      <div class="tx-date">Yesterday</div>
                  </div>
                  <div class="tx-amount negative">-$24.50</div>
              </div>
          </div>
      </div>
    `;
  }

  static styles = css`
    :host { display: block; width: 100%; height: 100%; }
    .view-header { padding: 2rem; max-width: 800px; margin: 0 auto; }
    h1 { font-family: 'Sofia Sans Condensed', sans-serif; font-size: 2.5rem; margin: 0; color: #212121; text-transform: uppercase; }
    p { color: #757575; margin-top: 0.5rem; }

    .wallet-layout {
        max-width: 800px;
        margin: 0 auto;
        padding: 0 2rem 2rem 2rem;
    }

    .balance-card {
        background: #1a1a1a;
        border-radius: 24px;
        padding: 2rem;
        color: white;
        position: relative;
        overflow: hidden;
        margin-bottom: 2rem;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
    }
    
    .card-bg {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        background: linear-gradient(45deg, #FF5722, #FFC107);
        opacity: 0.1;
        z-index: 0;
    }
    
    .card-content { position: relative; z-index: 1; text-align: center; }
    .label { font-size: 0.9rem; opacity: 0.7; text-transform: uppercase; letter-spacing: 1px; }
    .amount { font-size: 3.5rem; font-weight: 700; margin: 10px 0; letter-spacing: -1px; }
    .crypto-amount { font-family: monospace; background: rgba(255,255,255,0.1); display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.9rem; margin-bottom: 2rem; }
    .separator { margin: 0 8px; opacity: 0.5; }
    
    .actions { display: flex; gap: 10px; justify-content: center; }
    .action-btn {
        background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.2);
        color: white;
        padding: 12px 24px;
        border-radius: 12px;
        font-weight: 600;
        cursor: pointer;
        font-size: 1rem;
        transition: all 0.2s;
    }
    .action-btn:hover { background: rgba(255,255,255,0.2); }
    .action-btn.primary { background: #FF5722; border-color: #FF5722; }
    .action-btn.primary:hover { background: #F4511E; }

    .integrations-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
        margin-bottom: 2rem;
    }
    
    .integration-item {
        background: white;
        padding: 1rem;
        border-radius: 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        border: 1px solid #eee;
    }
    
    .logo-area {
        width: 40px; height: 40px;
        border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
        color: white; font-weight: 700; font-size: 0.9rem;
    }
    
    .info h4 { margin: 0; font-size: 1rem; }
    .info p { margin: 0; font-size: 0.75rem; color: #888; }
    
    .status.active { color: #4CAF50; font-size: 0.8rem; font-weight: 600; margin-left: auto; }
    .connect-btn {
        margin-left: auto;
        background: #f0f0f0;
        border: none;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
    }

    .transactions h3 { margin-top: 0; font-size: 1.2rem; color: #333; }
    .tx-item {
        display: flex;
        align-items: center;
        gap: 15px;
        padding: 15px 0;
        border-bottom: 1px solid #eee;
    }
    .tx-icon {
        width: 36px; height: 36px;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
    }
    .tx-icon.in { background: #E8F5E9; color: #4CAF50; }
    .tx-icon.out { background: #FFEBEE; color: #F44336; }
    
    .tx-info { flex: 1; }
    .tx-title { font-weight: 600; color: #333; }
    .tx-date { font-size: 0.8rem; color: #888; }
    .tx-amount { font-weight: 700; }
    .positive { color: #4CAF50; }
    .negative { color: #333; }
  `;
}
