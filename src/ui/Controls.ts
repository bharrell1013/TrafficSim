import { Simulation } from "../core/Simulation";
import type { DriverType } from "../models/types";

export type RampPlacementMode = "none" | "entrance" | "exit";

export class Controls {
  private container: HTMLElement;
  private simulation: Simulation;
  private placementMode: RampPlacementMode = "none";
  private onPlacementModeChange: ((mode: RampPlacementMode) => void) | null =
    null;

  constructor(containerId: string, simulation: Simulation) {
    this.container = document.getElementById(containerId)!;
    this.simulation = simulation;
    this.render();
    this.attachListeners();
  }

  setPlacementModeCallback(callback: (mode: RampPlacementMode) => void): void {
    this.onPlacementModeChange = callback;
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="controls-panel">
        <h2>Controls</h2>
        
        <div class="control-section">
          <h3>Simulation</h3>
          <div class="button-group">
            <button id="btn-play" class="btn btn-primary">Play</button>
            <button id="btn-pause" class="btn btn-secondary">Pause</button>
            <button id="btn-reset" class="btn btn-danger">Reset</button>
          </div>
        </div>
        
        <div class="control-section">
          <h3>Spawn Rate</h3>
          <div class="slider-container">
            <input type="range" id="spawn-rate" min="0" max="3" step="0.1" value="0.5">
            <span id="spawn-rate-value">0.5 cars/s</span>
          </div>
          <h3>Speed Limit</h3>
          <div class="slider-container">
            <input type="range" id="speed-limit" min="30" max="150" step="5" value="80">
            <span id="speed-limit-value">80 km/h</span>
          </div>
        </div>
        
        <div class="control-section">
          <h3>Driver Types</h3>
          <div class="checkbox-matrix">
            <label class="driver-checkbox type-a">
              <input type="checkbox" id="driver-a" checked>
              <span class="driver-label">Type A</span>
              <span class="driver-desc">Average</span>
            </label>
            <label class="driver-checkbox type-b">
              <input type="checkbox" id="driver-b" checked>
              <span class="driver-label">Type B</span>
              <span class="driver-desc">Aggressive</span>
            </label>
            <label class="driver-checkbox type-c">
              <input type="checkbox" id="driver-c" checked>
              <span class="driver-label">Type C</span>
              <span class="driver-desc">Slow/Erratic</span>
            </label>
          </div>
        </div>
        
        <div class="control-section">
          <h3>Infrastructure</h3>
          <div class="button-group vertical">
            <button id="btn-add-lane" class="btn btn-outline">+ Add Lane</button>
            <button id="btn-remove-lane" class="btn btn-outline">− Remove Lane</button>
          </div>
          <div class="button-group vertical" style="margin-top: 10px;">
            <button id="btn-place-entrance" class="btn btn-success">Place Entrance Ramp</button>
            <button id="btn-place-exit" class="btn btn-warning">Place Exit Ramp</button>
          </div>
          <p id="placement-hint" class="placement-hint" style="display: none;">Click on the circle edge to place the ramp</p>
        </div>
        
        <div class="control-section">
          <h3>Quick Actions</h3>
          <div class="button-group vertical">
            <button id="btn-spawn-10" class="btn btn-outline">Spawn 10 Cars</button>
            <button id="btn-spawn-50" class="btn btn-outline">Spawn 50 Cars</button>
          </div>
        </div>
      </div>
    `;
  }

  private attachListeners(): void {
    document.getElementById("btn-play")!.addEventListener("click", () => {
      this.simulation.start();
      this.updatePlayPauseState(true);
    });

    document.getElementById("btn-pause")!.addEventListener("click", () => {
      this.simulation.stop();
      this.updatePlayPauseState(false);
    });

    document.getElementById("btn-reset")!.addEventListener("click", () => {
      this.simulation.stop();
      this.simulation.reset();
      this.updatePlayPauseState(false);
    });

    const spawnRateSlider = document.getElementById(
      "spawn-rate"
    ) as HTMLInputElement;
    const spawnRateValue = document.getElementById("spawn-rate-value")!;
    spawnRateSlider.addEventListener("input", () => {
      const rate = parseFloat(spawnRateSlider.value);
      spawnRateValue.textContent = `${rate.toFixed(1)} cars/s`;
      this.simulation.setSpawnRate(rate);
    });

    const speedLimitSlider = document.getElementById(
      "speed-limit"
    ) as HTMLInputElement;
    const speedLimitValue = document.getElementById("speed-limit-value")!;
    speedLimitSlider.addEventListener("input", () => {
      const limit = parseFloat(speedLimitSlider.value);
      speedLimitValue.textContent = `${limit} km/h`;
      this.simulation.setSpeedLimit(limit);
    });

    const driverCheckboxes = ["driver-a", "driver-b", "driver-c"];
    for (const id of driverCheckboxes) {
      document.getElementById(id)!.addEventListener("change", () => {
        this.updateDriverTypes();
      });
    }

    document.getElementById("btn-add-lane")!.addEventListener("click", () => {
      this.simulation.addLane();
      this.updateLaneButtonState();
    });

    document
      .getElementById("btn-remove-lane")!
      .addEventListener("click", () => {
        this.simulation.removeLane();
        this.updateLaneButtonState();
      });

    this.updateLaneButtonState();

    document
      .getElementById("btn-place-entrance")!
      .addEventListener("click", () => {
        this.setPlacementMode(
          this.placementMode === "entrance" ? "none" : "entrance"
        );
      });

    document.getElementById("btn-place-exit")!.addEventListener("click", () => {
      this.setPlacementMode(this.placementMode === "exit" ? "none" : "exit");
    });

    document.getElementById("btn-spawn-10")!.addEventListener("click", () => {
      this.simulation.spawnInitialCars(10);
    });

    document.getElementById("btn-spawn-50")!.addEventListener("click", () => {
      this.simulation.spawnInitialCars(50);
    });
  }

  private setPlacementMode(mode: RampPlacementMode): void {
    this.placementMode = mode;

    const entranceBtn = document.getElementById("btn-place-entrance")!;
    const exitBtn = document.getElementById("btn-place-exit")!;
    const hint = document.getElementById("placement-hint")!;

    entranceBtn.classList.toggle("active", mode === "entrance");
    exitBtn.classList.toggle("active", mode === "exit");
    hint.style.display = mode === "none" ? "none" : "block";

    if (this.onPlacementModeChange) {
      this.onPlacementModeChange(mode);
    }
  }

  getPlacementMode(): RampPlacementMode {
    return this.placementMode;
  }

  clearPlacementMode(): void {
    this.setPlacementMode("none");
  }

  private updatePlayPauseState(playing: boolean): void {
    const playBtn = document.getElementById("btn-play")!;
    const pauseBtn = document.getElementById("btn-pause")!;
    playBtn.classList.toggle("active", playing);
    pauseBtn.classList.toggle("active", !playing);
  }

  private updateDriverTypes(): void {
    const types = new Set<DriverType>();
    if ((document.getElementById("driver-a") as HTMLInputElement).checked)
      types.add("A");
    if ((document.getElementById("driver-b") as HTMLInputElement).checked)
      types.add("B");
    if ((document.getElementById("driver-c") as HTMLInputElement).checked)
      types.add("C");
    this.simulation.setDriverTypes(types);
  }

  private updateLaneButtonState(): void {
    const removeLaneBtn = document.getElementById(
      "btn-remove-lane"
    ) as HTMLButtonElement;
    removeLaneBtn.disabled = this.simulation.config.numLanes <= 1;
  }
}
