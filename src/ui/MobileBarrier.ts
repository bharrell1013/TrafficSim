export class MobileBarrier {
  private userAgentRegex =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

  constructor() {
    this.check();
  }

  private check(): void {
    if (this.isMobile()) {
      this.showBarrier();
    }
  }

  private isMobile(): boolean {
    const isMobileUA = this.userAgentRegex.test(navigator.userAgent);
    const isSmallScreen = window.matchMedia("(max-width: 768px)").matches;

    // Check for touch capability as a secondary signal, but rely mostly on UA/screen
    // simple check: if it says it's a mobile device in UA string, or screen is very small
    return isMobileUA || isSmallScreen;
  }

  private showBarrier(): void {
    const barrier = document.createElement("div");
    barrier.className = "mobile-barrier";
    barrier.innerHTML = `
      <div class="mobile-barrier-content">
        <h1>Desktop Required</h1>
        <p>The Traffic Flow Laboratory is a complex simulation that requires the performance and screen real estate of a desktop computer.</p>
        <p>Please visit this site on a laptop or desktop browser for the best experience.</p>
      </div>
    `;

    // Add styles dynamically
    const style = document.createElement("style");
    style.textContent = `
      .mobile-barrier {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: #0f172a; /* Slate 900 */
        color: #f8fafc; /* Slate 50 */
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        text-align: center;
        padding: 2rem;
      }
      .mobile-barrier-content {
        max-width: 500px;
        background: #1e293b; /* Slate 800 */
        padding: 2rem;
        border-radius: 12px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      }
      .mobile-barrier h1 {
        margin-top: 0;
        margin-bottom: 1rem;
        font-size: 1.5rem;
        font-weight: 700;
        color: #ef4444; /* Red 500 */
      }
      .mobile-barrier p {
        margin-bottom: 1rem;
        line-height: 1.6;
        color: #cbd5e1; /* Slate 300 */
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(barrier);

    // Optionally stop the app execution or hide the main app
    const app = document.getElementById("app");
    if (app) {
      app.style.display = "none";
    }
  }
}
