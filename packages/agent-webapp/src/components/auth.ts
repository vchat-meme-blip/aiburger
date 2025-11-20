
import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { styleMap } from 'lit/directives/style-map.js';
import { getUserInfo } from '../services/auth.service.js';
import type { AuthDetails } from '../services/auth.service.js';
import personSvg from '../../assets/icons/person.svg?raw';
import logoutSvg from '../../assets/icons/logout.svg?raw';
import microsoftSvg from '../../assets/providers/microsoft.svg?inline';
import githubSvg from '../../assets/providers/github.svg?inline';

// Standard Azure SWA routes
const loginRoute = '/.auth/login';
const logoutRoute = '/.auth/logout';

export type AuthComponentOptions = {
  strings: {
    logoutButton: string;
  };
  providers: AuthProvider[];
};

export type AuthProvider = {
  id: string;
  label: string;
  icon: string;
  color: string;
  textColor: string;
};

export const authDefaultOptions: AuthComponentOptions = {
  strings: {
    logoutButton: 'Log out',
  },
  providers: [
    { id: 'aad', label: 'Continue with Microsoft', icon: microsoftSvg, color: '#2F2F2F', textColor: '#fff' },
    { id: 'github', label: 'Continue with GitHub', icon: githubSvg, color: '#24292e', textColor: '#fff' },
    // Azure SWA supports google natively. Added here for UI, maps to /.auth/login/google
    {
      id: 'google',
      label: 'Continue with Google',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512" fill="#fff"><path d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"/></svg>',
      color: '#4285F4',
      textColor: '#fff',
    },
  ],
};

export type AuthButtonType = 'status' | 'login' | 'logout' | 'guard';

@customElement('azc-auth')
export class AuthComponent extends LitElement {
  @property({
    type: Object,
    converter: (value) => ({ ...authDefaultOptions, ...JSON.parse(value || '{}') }),
  })
  options: AuthComponentOptions = authDefaultOptions;

  @property() type: AuthButtonType = 'login';
  @property() loginRedirect = '/';
  @property() logoutRedirect = '/';
  @state() protected _userDetails: AuthDetails | undefined;
  @state() protected loaded = false;

  get userDetails() {
    return this._userDetails;
  }

  onLoginClicked(provider: string) {
    const redirect = `${loginRoute}/${provider}?post_login_redirect_uri=${encodeURIComponent(this.loginRedirect)}`;
    window.location.href = redirect;
  }

  onLogoutClicked() {
    const redirect = `${logoutRoute}?post_logout_redirect_uri=${encodeURIComponent(this.logoutRedirect)}`;
    window.location.href = redirect;
  }

  protected renderStatus = () =>
    html`<section class="auth-status">
      <span class="login-icon">${unsafeSVG(personSvg)}</span>
      ${this._userDetails
        ? html`<span>${this._userDetails.userDetails}</span>
            <slot name="logout"> ${this.renderLogout()} </slot>`
        : nothing}
    </section>`;

  protected renderGuard = () => (this.loaded && this._userDetails ? html`<slot></slot>` : nothing);

  protected renderLogin = () =>
    this.loaded
      ? this.userDetails
        ? html`<slot></slot>`
        : this.renderLandingPage()
      : html`<div class="loading-screen"><div class="spinner"></div></div>`;

  protected renderLandingPage = () => html`
    <div class="landing-page">
      <div class="hero-section">
        <div class="hero-content">
          <div class="badge">✨ AI-Powered Cravings</div>
          <h1>Hungry? Just Ask <span class="highlight">Chicha</span>.</h1>
          <p class="subtitle">The first AI Agent that finds promos, schedules deliveries, and manages your orders across Uber, DoorDash, and POS systems. Never miss a bite.</p>
          
          <div class="social-proof">
            <div class="avatars">
              <div class="avatar" style="background-color: #FF6B6B">J</div>
              <div class="avatar" style="background-color: #4ECDC4">S</div>
              <div class="avatar" style="background-color: #FFE66D">M</div>
              <div class="avatar" style="background-color: #1A535C">+2k</div>
            </div>
            <div class="rating">
              ★★★★★ <span>Trusted by 10,000+ hungry humans</span>
            </div>
          </div>

          <button class="cta-button" @click=${() => this.scrollToLogin()}>
            Order Now
          </button>
        </div>
        
        <div class="hero-visual">
           <!-- A CSS-only abstract burger illustration -->
           <div class="abstract-burger">
              <div class="bun-top"></div>
              <div class="lettuce"></div>
              <div class="patty"></div>
              <div class="bun-bottom"></div>
              <div class="float-card card-1">
                 <span>🎉</span> Promo Alert! 50% OFF
              </div>
              <div class="float-card card-2">
                 <span>🚚</span> Arriving in 5m
              </div>
           </div>
        </div>
      </div>

      <div class="features-grid">
        <div class="feature-card">
          <div class="icon">🏷️</div>
          <h3>Promo Hunter</h3>
          <p>I monitor every platform 24/7. When your favorite burger drops in price, I alert you instantly.</p>
        </div>
        <div class="feature-card">
          <div class="icon">⏰</div>
          <h3>Smart Schedule</h3>
          <p>Distracted gaming or working? Schedule orders in advance. I'll handle the rest.</p>
        </div>
        <div class="feature-card">
          <div class="icon">💳</div>
          <h3>Universal Pay</h3>
          <p>Pay with Crypto or Fiat. We handle the conversion so you just handle the eating.</p>
        </div>
        <div class="feature-card">
          <div class="icon">🛵</div>
          <h3>Delivery Guard</h3>
          <p>I track the rider. If they get lost, I call them. You don't have to lift a finger.</p>
        </div>
      </div>

      <div class="login-section" id="login-target">
        <h2>Ready to eat?</h2>
        <p>Sign in to start your order</p>
        <div class="login-buttons">
          ${this.options.providers.map((provider) => {
            const providerStyle = {
              '--button-bg': provider.color,
              '--button-color': provider.textColor,
            };
            return html`<button
              class="login-btn"
              @click=${() => {
                this.onLoginClicked(provider.id);
              }}
              style=${styleMap(providerStyle)}
            >
              <div class="btn-icon">${unsafeSVG(provider.icon)}</div>
              <span>${provider.label}</span>
            </button>`;
          })}
        </div>
      </div>
      
      <footer>
        <p>© 2025 Chicha AI. Serving bytes and bites.</p>
      </footer>
    </div>
  `;

  protected scrollToLogin() {
    const el = this.renderRoot.querySelector('#login-target');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  protected renderLogout = () =>
    html`<button
      class="logout"
      @click=${() => {
        this.onLogoutClicked();
      }}
      title="log out"
    >
      ${unsafeSVG(logoutSvg)}
    </button>`;

  public override async connectedCallback() {
    super.connectedCallback();
    const userDetails = await getUserInfo();
    this._userDetails = userDetails;
    this.loaded = true;
  }

  protected override updated(changedProperties: Map<string | number | symbol, unknown>) {
    super.updated(changedProperties);

    if (this._userDetails) {
      (this as unknown as HTMLElement).classList.add('authenticated');
    } else {
      (this as unknown as HTMLElement).classList.remove('authenticated');
    }
  }

  protected override render() {
    switch (this.type) {
      case 'status': {
        return this.renderStatus();
      }

      case 'guard': {
        return this.renderGuard();
      }

      case 'logout': {
        return this.renderLogout();
      }

      default: {
        return this.renderLogin();
      }
    }
  }

  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    
    /* Loading State */
    .loading-screen {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
      width: 100%;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid rgba(0,0,0,0.1);
      border-left-color: var(--azc-primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Authentication Status (Navbar) */
    .auth-status {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      font-size: 0.9rem;
      font-weight: 500;
    }
    .login-icon {
      width: 24px;
      height: 24px;
      color: var(--azc-primary);
    }
    .logout {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      border-radius: 50%;
      color: var(--azc-text-subtle);
      transition: all 0.2s;
    }
    .logout:hover {
      background: rgba(0,0,0,0.05);
      color: var(--azc-primary);
    }

    /* --- Landing Page Styles --- */
    .landing-page {
      width: 100%;
      height: 100%;
      overflow-y: auto;
      background-color: var(--azc-bg);
      color: var(--azc-text-color);
      padding: 2rem;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    /* Hero */
    .hero-section {
      display: flex;
      flex-direction: column-reverse;
      align-items: center;
      gap: 3rem;
      max-width: 1200px;
      width: 100%;
      margin: 2rem 0 4rem 0;
    }

    @media (min-width: 900px) {
      .hero-section {
        flex-direction: row;
        justify-content: space-between;
        text-align: left;
        height: 80vh;
        min-height: 600px;
      }
      .hero-content {
        flex: 1;
        padding-right: 2rem;
      }
      .hero-visual {
        flex: 1;
        display: flex;
        justify-content: center;
        align-items: center;
      }
    }

    .badge {
      display: inline-block;
      padding: 0.5rem 1rem;
      background: #FFF3E0;
      color: var(--azc-primary);
      border-radius: 50px;
      font-weight: 600;
      font-size: 0.85rem;
      margin-bottom: 1.5rem;
      border: 1px solid #FFE0B2;
    }

    h1 {
      font-size: 3rem;
      line-height: 1.1;
      font-weight: 800;
      margin: 0 0 1.5rem 0;
      letter-spacing: -0.02em;
    }

    .highlight {
      color: var(--azc-primary);
      position: relative;
    }
    
    .highlight::after {
      content: '';
      position: absolute;
      bottom: 5px;
      left: 0;
      width: 100%;
      height: 8px;
      background: var(--azc-secondary);
      opacity: 0.3;
      z-index: -1;
      border-radius: 4px;
    }

    .subtitle {
      font-size: 1.2rem;
      line-height: 1.6;
      color: var(--azc-text-subtle);
      margin-bottom: 2rem;
      max-width: 600px;
    }

    /* CTA Button */
    .cta-button {
      background: var(--azc-primary);
      color: white;
      border: none;
      padding: 1rem 2.5rem;
      font-size: 1.1rem;
      font-weight: 600;
      border-radius: 50px;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 4px 14px rgba(255, 87, 34, 0.3);
    }
    .cta-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(255, 87, 34, 0.4);
      background: #F4511E;
    }

    /* Social Proof */
    .social-proof {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }
    .avatars {
      display: flex;
    }
    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 2px solid white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      font-weight: bold;
      color: rgba(0,0,0,0.6);
      margin-left: -10px;
    }
    .avatar:first-child { margin-left: 0; }
    
    .rating {
      font-size: 0.9rem;
      font-weight: 600;
      color: #FFC107;
    }
    .rating span {
      color: var(--azc-text-subtle);
      font-weight: 400;
      margin-left: 5px;
    }

    /* Abstract Burger Visual */
    .abstract-burger {
      position: relative;
      width: 300px;
      height: 300px;
    }
    .bun-top {
      width: 200px;
      height: 100px;
      background: #FFD54F;
      border-radius: 200px 200px 20px 20px;
      position: absolute;
      top: 50px;
      left: 50px;
      box-shadow: inset -10px -5px 20px rgba(0,0,0,0.05);
    }
    .lettuce {
      width: 220px;
      height: 40px;
      background: #66BB6A;
      border-radius: 20px;
      position: absolute;
      top: 140px;
      left: 40px;
    }
    .patty {
      width: 200px;
      height: 50px;
      background: #795548;
      border-radius: 20px;
      position: absolute;
      top: 170px;
      left: 50px;
    }
    .bun-bottom {
      width: 200px;
      height: 60px;
      background: #FFD54F;
      border-radius: 20px 20px 50px 50px;
      position: absolute;
      top: 210px;
      left: 50px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.1);
    }

    .float-card {
      position: absolute;
      background: white;
      padding: 0.8rem 1.2rem;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      font-weight: 600;
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: float 3s ease-in-out infinite;
    }
    .card-1 { top: 20px; right: -20px; animation-delay: 0s; }
    .card-2 { bottom: 40px; left: -40px; animation-delay: 1.5s; }
    
    @keyframes float {
      0% { transform: translateY(0px); }
      50% { transform: translateY(-10px); }
      100% { transform: translateY(0px); }
    }

    /* Features Grid */
    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 2rem;
      width: 100%;
      max-width: 1200px;
      margin-bottom: 5rem;
    }
    
    .feature-card {
      background: white;
      padding: 2rem;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.04);
      transition: transform 0.2s;
      border: 1px solid rgba(0,0,0,0.03);
    }
    .feature-card:hover {
      transform: translateY(-5px);
    }
    .feature-card .icon {
      font-size: 2.5rem;
      margin-bottom: 1rem;
    }
    .feature-card h3 {
      margin: 0 0 0.5rem 0;
      font-size: 1.25rem;
      color: var(--azc-text-color);
    }
    .feature-card p {
      margin: 0;
      color: var(--azc-text-subtle);
      line-height: 1.5;
    }

    /* Login Section */
    .login-section {
      background: white;
      padding: 3rem;
      border-radius: 24px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.08);
      text-align: center;
      max-width: 500px;
      width: 100%;
      margin-bottom: 4rem;
      scroll-margin-top: 100px;
    }
    
    .login-section h2 {
      margin: 0 0 0.5rem 0;
      font-size: 2rem;
    }
    .login-section p {
      color: var(--azc-text-subtle);
      margin: 0 0 2rem 0;
    }

    .login-buttons {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .login-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      width: 100%;
      padding: 14px 20px;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      background: var(--button-bg);
      color: var(--button-color);
      transition: opacity 0.2s, transform 0.1s;
    }
    .login-btn:hover {
      opacity: 0.9;
    }
    .login-btn:active {
      transform: scale(0.98);
    }
    .btn-icon {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .btn-icon svg {
      fill: currentColor;
      width: 100%;
      height: 100%;
    }

    footer {
      margin-top: auto;
      color: var(--azc-text-subtle);
      font-size: 0.9rem;
      padding-bottom: 2rem;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'azc-auth': AuthComponent;
  }
}
