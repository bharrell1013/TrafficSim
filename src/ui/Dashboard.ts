import type { SimulationMetrics } from "../models/types";

export class Dashboard {
  private container: HTMLElement;
  private throughputEl: HTMLElement;
  private speedEl: HTMLElement;
  private densityEl: HTMLElement;
  private waitingEl: HTMLElement;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
    this.render();
    this.throughputEl = document.getElementById("metric-throughput")!;
    this.speedEl = document.getElementById("metric-speed")!;
    this.densityEl = document.getElementById("metric-density")!;
    this.waitingEl = document.getElementById("metric-waiting")!;
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="dashboard">
        <h2>Live Metrics</h2>
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-icon"></div>
            <div class="metric-content">
              <span class="metric-value" id="metric-throughput">0</span>
              <span class="metric-label">Throughput/min</span>
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-icon"></div>
            <div class="metric-content">
              <span class="metric-value" id="metric-speed">0</span>
              <span class="metric-label">Avg Speed (m/s)</span>
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-icon"></div>
            <div class="metric-content">
              <span class="metric-value" id="metric-density">0</span>
              <span class="metric-label">Cars on Road</span>
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-icon"></div>
            <div class="metric-content">
              <span class="metric-value" id="metric-waiting">0</span>
              <span class="metric-label">Waiting to Merge</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  update(metrics: SimulationMetrics): void {
    this.throughputEl.textContent = metrics.throughput.toString();
    this.speedEl.textContent = metrics.averageSpeed.toFixed(1);
    this.densityEl.textContent = metrics.density.toString();
    this.waitingEl.textContent = metrics.waitingCars.toString();
  }
}
