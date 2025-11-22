
import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { setActiveView } from '../services/user.service.js';
import { getUserInfo } from '../services/auth.service.js';

// Import Icons
import chatSvg from '../../assets/icons/send.svg?raw'; // Reusing send icon as chat icon for now
import clockSvg from '../../assets/icons/clock.svg?raw';
import tagSvg from '../../assets/icons/tag.svg?raw';
import walletSvg from '../../assets/icons/card.svg?raw';
import logoutSvg from '../../assets/icons/logout.svg?raw';
import personSvg from '../../assets/icons/person.svg?raw';

@customElement('azc-sidebar')
export class SidebarComponent extends LitElement {
  @state() activeTab = 'chat';
  @state() userInitials = '';
  @state() userPhoto = '';

  async connectedCallback() {
      super.connectedCallback();
      window.addEventListener('azc-view-change', (e: any) => {
          this.activeTab = e.detail.view;
      });
      
      const info = await getUserInfo();
      if(info?.userDetails) {
          this.userInitials = info.userDetails.substring(0, 2).toUpperCase();
      }
  }

  switchTab(view: any) {
      setActiveView(view);
  }

  openProfile() {
      const card = document.querySelector('azc-user-card') as any;
      if(card) card.openModal();
  }

  logout() {
      const auth = document.querySelector('azc-auth') as any;
      if(auth) auth.onLogoutClicked();
  }

  render() {
    return html`
      <div class="brand">
        <img src="/favicon.png" alt="Chicha" />
      </div>

      <div class="nav-items">
        <button class="nav-item ${this.activeTab === 'chat' ? 'active' : ''}" @click=${() => this.switchTab('chat')} title="Chat">
          ${unsafeSVG(chatSvg)}
        </button>
        <button class="nav-item ${this.activeTab === 'schedules' ? 'active' : ''}" @click=${() => this.switchTab('schedules')} title="Schedules">
          ${unsafeSVG(clockSvg)}
        </button>
        <button class="nav-item ${this.activeTab === 'promos' ? 'active' : ''}" @click=${() => this.switchTab('promos')} title="Deals">
          ${unsafeSVG(tagSvg)}
        </button>
        <button class="nav-item ${this.activeTab === 'wallet' ? 'active' : ''}" @click=${() => this.switchTab('wallet')} title="Wallet">
          ${unsafeSVG(walletSvg)}
        </button>
      </div>

      <div class="bottom-items">
        <button class="nav-item profile" @click=${this.openProfile} title="Profile">
           ${this.userPhoto ? html`<img src="${this.userPhoto}" />` : html`<div class="avatar-placeholder">${this.userInitials || unsafeSVG(personSvg)}</div>`}
        </button>
        <button class="nav-item logout" @click=${this.logout} title="Logout">
           ${unsafeSVG(logoutSvg)}
        </button>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      background: #FFFFFF;
      align-items: center;
      padding: 20px 0;
      box-sizing: border-box;
      border-right: 1px solid rgba(0,0,0,0.05);
    }

    .brand img {
        width: 40px;
        height: 40px;
        margin-bottom: 40px;
        filter: drop-shadow(0 4px 6px rgba(255, 87, 34, 0.2));
    }

    .nav-items {
        display: flex;
        flex-direction: column;
        gap: 20px;
        width: 100%;
        align-items: center;
        flex: 1;
    }

    .nav-item {
        width: 48px;
        height: 48px;
        border-radius: 14px;
        border: none;
        background: transparent;
        color: #9E9E9E;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
    }

    .nav-item svg {
        width: 24px;
        height: 24px;
        fill: currentColor;
    }
    
    /* SVG fixes for stroke icons */
    .nav-item svg path[stroke] {
        fill: none;
    }

    .nav-item:hover {
        background: #F5F7FA;
        color: #FF5722;
    }

    .nav-item.active {
        background: #FFF3E0;
        color: #FF5722;
        box-shadow: 0 4px 12px rgba(255, 87, 34, 0.15);
    }

    .bottom-items {
        display: flex;
        flex-direction: column;
        gap: 15px;
        margin-top: auto;
    }

    .avatar-placeholder {
        width: 36px;
        height: 36px;
        background: #212121;
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 14px;
    }
    
    .avatar-placeholder svg {
        width: 20px;
        height: 20px;
    }

    .logout:hover {
        color: #D32F2F;
        background: #FFEBEE;
    }
  `;
}
