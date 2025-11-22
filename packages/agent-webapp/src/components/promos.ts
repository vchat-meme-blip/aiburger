
import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { getUserId } from '../services/user.service.js';
import { burgerApiBaseUrl } from '../services/orders.service.js';

@customElement('azc-promos')
export class PromosComponent extends LitElement {
  @state() promos: any[] = [];
  @state() loading = false;

  override async connectedCallback() {
      super.connectedCallback();
      this.loadPromos();
  }

  async loadPromos() {
      this.loading = true;
      try {
          const userId = await getUserId();
          if(!userId) return;
          
          // Use the discovery endpoint to find "deals" specifically
          const res = await fetch(`${burgerApiBaseUrl}/api/discovery/search?q=deals promo special cheap&userId=${userId}`);
          if(res.ok) {
              const data = await res.json();
              this.promos = data.results || [];
          }
      } catch(e) {
          console.error(e);
      } finally {
          this.loading = false;
      }
  }

  override render() {
    return html`
      <div class="view-header">
        <h1>Deal Hunter</h1>
        <p>AI-curated offers from Contoso Burgers and nearby partners.</p>
      </div>

      <div class="restaurant-grid">
          ${this.loading ? html`<div class="spinner"></div>` : ''}
          
          ${this.promos.map(item => html`
             <div class="restaurant-card">
                 <div class="card-image" style="background-image: url('${item.image_url}')">
                    <span class="promo-badge">${item.promo || 'Special Offer'}</span>
                 </div>
                 <div class="card-details">
                     <h4>${item.name}</h4>
                     <div class="meta">
                        <span>${item.source}</span>
                        <span class="rating" style="color:#FF5722"><strong>$${item.price}</strong></span>
                     </div>
                     <p style="font-size: 0.85rem; color: #666; margin-bottom: 10px; flex: 1;">${item.description}</p>
                     
                     ${item.type === 'internal' 
                        ? html`<button class="order-btn" @click=${() => this.orderInternal(item.name)}>Order Now</button>`
                        : html`<a href="${item.url}" target="_blank" class="order-btn">View on Uber Eats</a>`
                     }
                 </div>
             </div>
          `)}
      </div>
    `;
  }

  orderInternal(name: string) {
      // Switch to chat and pre-fill
      const event = new CustomEvent('azc-view-change', { detail: { view: 'chat' } });
      window.dispatchEvent(event);
      
      // Hacky way to set input, better to have a service
      setTimeout(() => {
          const chat = document.querySelector('azc-chat') as any;
          if(chat) {
              chat.question = `Order the ${name} promo`;
              chat.onSendClicked();
          }
      }, 100);
  }

  static override styles = css`
    :host { display: block; width: 100%; height: 100%; }
    
    .view-header { padding: 2rem; max-width: 1200px; margin: 0 auto; }
    h1 { font-family: 'Sofia Sans Condensed', sans-serif; font-size: 2.5rem; margin: 0; color: #212121; text-transform: uppercase; }
    p { color: #757575; margin-top: 0.5rem; }

    .restaurant-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 20px;
      padding: 0 2rem 2rem 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    .restaurant-card {
      background: white;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      display: flex;
      flex-direction: column;
      border: 1px solid #eee;
      height: 100%;
      transition: transform 0.2s;
    }
    
    .restaurant-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.1);
    }

    .card-image {
      height: 160px;
      background-size: cover;
      background-position: center;
      position: relative;
      background-color: #eee;
    }

    .promo-badge {
      position: absolute;
      top: 10px;
      left: 10px;
      background: #FF5722;
      color: white;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 20px;
    }

    .card-details { padding: 16px; display: flex; flex-direction: column; flex: 1; }
    h4 { margin: 0 0 5px 0; font-size: 1.1rem; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 0.9rem; color: #666; }
    
    .order-btn {
      margin-top: auto;
      display: block;
      text-align: center;
      background: #212121;
      color: white;
      text-decoration: none;
      padding: 10px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      border: none;
    }
    .spinner { margin: 2rem auto; width: 40px; height: 40px; border: 4px solid #eee; border-left-color: #FF5722; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;
}
