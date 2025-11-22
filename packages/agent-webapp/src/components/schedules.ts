
import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import clockSvg from '../../assets/icons/clock.svg?raw';

@customElement('azc-schedules')
export class SchedulesComponent extends LitElement {
  override render() {
    return html`
      <div class="view-header">
        <h1>Scheduled Orders</h1>
        <p>Upcoming food drops tailored to your timeline.</p>
      </div>

      <div class="timeline">
         <div class="empty-state">
             <div class="icon">${unsafeSVG(clockSvg)}</div>
             <h3>No scheduled orders yet</h3>
             <p>Ask Chicha to "Order burgers for 8 PM" to see them here.</p>
         </div>
      </div>
    `;
  }

  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .view-header {
        padding: 2rem;
        max-width: 800px;
        margin: 0 auto;
    }
    h1 { 
        font-family: 'Sofia Sans Condensed', sans-serif;
        font-size: 2.5rem; 
        margin: 0; 
        color: #212121;
        text-transform: uppercase;
    }
    p { color: #757575; margin-top: 0.5rem; }

    .timeline {
        max-width: 800px;
        margin: 2rem auto;
        padding: 0 2rem;
        position: relative;
    }

    .empty-state {
        text-align: center;
        padding: 4rem 2rem;
        background: white;
        border-radius: 24px;
        border: 2px dashed #eee;
    }
    .empty-state .icon {
        width: 64px;
        height: 64px;
        margin: 0 auto 1rem auto;
        color: #ddd;
    }
    .empty-state h3 { margin: 0; color: #333; }
  `;
}
