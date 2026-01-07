import "./style.css";
import { Simulation } from "./core/Simulation";
import { Renderer } from "./core/Renderer";
import { Dashboard } from "./ui/Dashboard";
import { Controls } from "./ui/Controls";
import type { RampPlacementMode } from "./ui/Controls";
import type { SimulationConfig } from "./models/types";

const config: SimulationConfig = {
  speedLimit: 80,
  numLanes: 3,
  baseRadius: 150,
  laneWidth: 35,
  carLength: 12,
  carWidth: 6,
};

const simulation = new Simulation(config);
const canvas = document.getElementById(
  "simulation-canvas"
) as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const dashboard = new Dashboard("dashboard-container");
const controls = new Controls("controls-container", simulation);

let currentPlacementMode: RampPlacementMode = "none";

controls.setPlacementModeCallback((mode) => {
  currentPlacementMode = mode;
  canvas.style.cursor = mode === "none" ? "default" : "crosshair";
});

function renderCurrentState(): void {
  renderer.render(
    Array.from(simulation.cars.values()),
    simulation.config,
    simulation.ramps,
    simulation.rampCars
  );
}

canvas.addEventListener("click", (event) => {
  if (currentPlacementMode === "none") return;

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const center = renderer.getCanvasCenter();
  const dx = x - center.x;
  const dy = y - center.y;
  const angle = Math.atan2(dy, dx);

  simulation.addRamp(currentPlacementMode, angle);
  controls.clearPlacementMode();
  renderCurrentState();
});

simulation.onUpdate = (cars, metrics, rampCars) => {
  renderer.render(cars, simulation.config, simulation.ramps, rampCars);
  dashboard.update(metrics);
};

renderer.render([], simulation.config, simulation.ramps);

const hamburgerBtn = document.getElementById("hamburger-btn");
const controlsSidebar = document.getElementById("controls-container");

if (hamburgerBtn && controlsSidebar) {
  hamburgerBtn.addEventListener("click", () => {
    controlsSidebar.classList.toggle("open");
    hamburgerBtn.classList.toggle("active");
  });
}
