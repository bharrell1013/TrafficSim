export class Tutorial {
  private container: HTMLElement;
  private overlay: HTMLElement | null = null;
  private readonly STORAGE_KEY = "traffic_sim_tutorial_seen";

  constructor() {
    this.container = document.body;
    this.init();
  }

  private init(): void {
    if (!this.hasSeenTutorial()) {
      this.render();
    }
  }

  private hasSeenTutorial(): boolean {
    return localStorage.getItem(this.STORAGE_KEY) === "true";
  }

  private markAsSeen(): void {
    localStorage.setItem(this.STORAGE_KEY, "true");
  }

  private render(): void {
    this.overlay = document.createElement("div");
    this.overlay.className = "tutorial-overlay";

    this.overlay.innerHTML = `
      <div class="tutorial-card">
        <div class="tutorial-header">
          <h2>Welcome to Traffic Flow Lab</h2>
          <p>Simulate emergent traffic patterns and experiment with driver behaviors.</p>
        </div>
        
        <div class="tutorial-content">
          <div class="tutorial-step">
            <div class="step-icon">🎮</div>
            <div class="step-text">
              <strong>Controls Menu</strong>
              <p>Click the hamburger icon (☰) in the top left or "Controls" to adjust spawn rates, speed limits, and driver personalities.</p>
            </div>
          </div>
          
          <div class="tutorial-step">
            <div class="step-icon">🛣️</div>
            <div class="step-text">
              <strong>Build Infrastructure</strong>
              <p>Add/remove lanes and place entrance/exit ramps to see how traffic adapts.</p>
            </div>
          </div>

          <div class="tutorial-step">
            <div class="step-icon">📊</div>
            <div class="step-text">
              <strong>Monitor Metrics</strong>
              <p>Watch the dashboard on the right for real-time throughput, speed, and density stats.</p>
            </div>
          </div>
        </div>

        <button id="btn-start-tutorial" class="btn btn-primary btn-large">
          Start Experimenting
        </button>
      </div>
    `;

    this.container.appendChild(this.overlay);

    document
      .getElementById("btn-start-tutorial")
      ?.addEventListener("click", () => {
        this.dismiss();
      });
  }

  private dismiss(): void {
    if (this.overlay) {
      this.overlay.classList.add("fade-out");
      this.overlay.addEventListener("transitionend", () => {
        if (this.overlay && this.overlay.parentNode) {
          this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
      });

      // Also open the controls sidebar to show them where it is
      const controlsSidebar = document.getElementById("controls-container");
      const hamburgerBtn = document.getElementById("hamburger-btn");
      if (controlsSidebar && hamburgerBtn) {
        controlsSidebar.classList.add("open");
        hamburgerBtn.classList.add("active");
      }
    }
    this.markAsSeen();
  }
}
