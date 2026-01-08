import type { Car } from "../models/Car";
import type {
  RampConfig,
  RampCar,
  SimulationConfig,
  DriverType,
} from "../models/types";

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private centerX: number = 0;
  private centerY: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private resize(): void {
    const container = this.canvas.parentElement!;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
    this.centerX = this.canvas.width / 2;
    this.centerY = this.canvas.height / 2;
  }

  private getScaleFactor(config: SimulationConfig): number {
    const outerRadius = this.getOuterRadius(config);
    const rampLength = 60;
    const padding = 40;
    const requiredSize = (outerRadius + rampLength + padding) * 2;

    const availableWidth = this.canvas.width;
    const availableHeight = this.canvas.height;
    const available = Math.min(availableWidth, availableHeight);

    const scale = available / requiredSize;
    return Math.min(scale, 1);
  }

  render(
    cars: Car[],
    config: SimulationConfig,
    ramps: RampConfig[],
    rampCars: RampCar[] = []
  ): void {
    this.ctx.fillStyle = "#0a0a0f";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const scale = this.getScaleFactor(config);
    this.ctx.save();
    this.ctx.translate(this.centerX, this.centerY);
    this.ctx.scale(scale, scale);
    this.ctx.translate(-this.centerX, -this.centerY);

    this.drawRoad(config);
    this.drawRamps(ramps, config);
    this.drawRampCars(rampCars, ramps, config);

    for (const car of cars) {
      this.drawCar(car, config);
    }

    this.ctx.restore();

    if (ramps.length === 0) {
      this.drawInstructions();
    }
  }

  private drawInstructions(): void {
    this.ctx.save();
    this.ctx.fillStyle = "#a1a1aa"; // text-secondary color
    this.ctx.font = "14px Inter, sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "bottom";

    const text =
      "Tip: Use the controls menu to place Entrance and Exit Ramps, then hit Play to start the simulation";
    // Draw at bottom with some padding
    this.ctx.fillText(text, this.centerX, this.canvas.height - 20);
    this.ctx.restore();
  }

  private drawRoad(config: SimulationConfig): void {
    const { numLanes, baseRadius, laneWidth } = config;

    for (let i = 0; i < numLanes; i++) {
      const radius = baseRadius + i * laneWidth;

      this.ctx.beginPath();
      this.ctx.arc(this.centerX, this.centerY, radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = "#1a1a2e";
      this.ctx.lineWidth = laneWidth - 2;
      this.ctx.stroke();
    }

    for (let i = 0; i <= numLanes; i++) {
      const radius = baseRadius + i * laneWidth - laneWidth / 2;

      this.ctx.beginPath();
      this.ctx.arc(this.centerX, this.centerY, radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = i === 0 || i === numLanes ? "#5a5a8e" : "#4a4a7e";
      this.ctx.lineWidth = i === 0 || i === numLanes ? 3 : 1;
      this.ctx.setLineDash(i === 0 || i === numLanes ? [] : [10, 10]);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
  }

  private drawRamps(ramps: RampConfig[], config: SimulationConfig): void {
    for (const ramp of ramps) {
      const outerRadius =
        config.baseRadius + (config.numLanes - 0.5) * config.laneWidth;
      const rampLength = 60;

      const innerX = this.centerX + Math.cos(ramp.angle) * outerRadius;
      const innerY = this.centerY + Math.sin(ramp.angle) * outerRadius;
      const outerX =
        this.centerX + Math.cos(ramp.angle) * (outerRadius + rampLength);
      const outerY =
        this.centerY + Math.sin(ramp.angle) * (outerRadius + rampLength);

      const gradient = this.ctx.createLinearGradient(
        innerX,
        innerY,
        outerX,
        outerY
      );
      if (ramp.type === "entrance") {
        gradient.addColorStop(0, "rgba(46, 204, 113, 0.8)");
        gradient.addColorStop(1, "rgba(46, 204, 113, 0.2)");
      } else {
        gradient.addColorStop(0, "rgba(231, 76, 60, 0.8)");
        gradient.addColorStop(1, "rgba(231, 76, 60, 0.2)");
      }

      this.ctx.beginPath();
      this.ctx.moveTo(innerX, innerY);
      this.ctx.lineTo(outerX, outerY);
      this.ctx.strokeStyle = gradient;
      this.ctx.lineWidth = 20;
      this.ctx.lineCap = "round";
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(innerX, innerY);
      this.ctx.lineTo(outerX, outerY);
      this.ctx.strokeStyle = ramp.type === "entrance" ? "#2ecc71" : "#e74c3c";
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      this.drawRampArrow(ramp, innerX, innerY, outerX, outerY);
    }
  }

  private drawRampArrow(
    ramp: RampConfig,
    innerX: number,
    innerY: number,
    outerX: number,
    outerY: number
  ): void {
    const midX = (innerX + outerX) / 2;
    const midY = (innerY + outerY) / 2;
    const angle = Math.atan2(innerY - outerY, innerX - outerX);

    const arrowAngle = ramp.type === "entrance" ? angle : angle + Math.PI;
    const arrowSize = 12;

    this.ctx.save();
    this.ctx.translate(midX, midY);
    this.ctx.rotate(arrowAngle);

    this.ctx.beginPath();
    this.ctx.moveTo(arrowSize, 0);
    this.ctx.lineTo(-arrowSize / 2, -arrowSize / 2);
    this.ctx.lineTo(-arrowSize / 2, arrowSize / 2);
    this.ctx.closePath();
    this.ctx.fillStyle = ramp.type === "entrance" ? "#2ecc71" : "#e74c3c";
    this.ctx.fill();

    this.ctx.restore();
  }

  private drawRampCars(
    rampCars: RampCar[],
    ramps: RampConfig[],
    config: SimulationConfig
  ): void {
    for (const rampCar of rampCars) {
      const ramp = ramps.find((r) => r.id === rampCar.rampId);
      if (!ramp) continue;

      const outerRadius =
        config.baseRadius + (config.numLanes - 0.5) * config.laneWidth;
      const rampLength = 60;

      let radius: number;
      if (rampCar.waitingToMerge && rampCar.entering) {
        const queueOffset = rampCar.queuePosition * 15;
        radius =
          outerRadius +
          rampLength -
          rampCar.progress * rampLength +
          queueOffset;
      } else {
        const progress = rampCar.entering
          ? rampCar.progress
          : 1 - rampCar.progress;
        radius = outerRadius + rampLength * (1 - progress);
      }

      const x = this.centerX + Math.cos(ramp.angle) * radius;
      const y = this.centerY + Math.sin(ramp.angle) * radius;

      const rampRotation = ramp.angle + Math.PI / 2;

      this.drawCarShapeSimple(
        x,
        y,
        rampRotation,
        rampCar.driverType,
        config,
        1.0
      );
    }
  }

  private drawCar(car: Car, config: SimulationConfig): void {
    const currentLane = car.getCurrentLane();
    const radius = config.baseRadius + currentLane * config.laneWidth;

    let x = this.centerX + Math.cos(car.state.position) * radius;
    let y = this.centerY + Math.sin(car.state.position) * radius;

    // Frustration shake for Type B when stuck
    if (car.state.driverType === "B" && car.state.stuckTime > 1) {
      const shakeAmount = Math.min(car.state.stuckTime * 0.5, 2);
      x += (Math.random() - 0.5) * shakeAmount;
      y += (Math.random() - 0.5) * shakeAmount;
    }

    const speedRatio = car.getSpeedRatio(config.speedLimit);
    const isBraking = car.state.acceleration < -0.5;
    const isDistracted = car.isDistracted;
    const distractionIntensity = car.distractionIntensity;

    this.drawCarShapeFull(
      x,
      y,
      car.state.position,
      car.state.driverType,
      config,
      speedRatio,
      isBraking,
      car.isChangingLane,
      car.laneChangeDirection,
      isDistracted,
      distractionIntensity,
      car.state.stuckTime
    );
  }

  private drawCarShapeSimple(
    x: number,
    y: number,
    rotation: number,
    driverType: DriverType,
    config: SimulationConfig,
    alpha: number
  ): void {
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(rotation + Math.PI / 2);
    this.ctx.globalAlpha = alpha;

    const width = config.carLength;
    const height = config.carWidth;
    const colors = this.getDriverTypeColors(driverType, 0.8);

    this.ctx.beginPath();
    if (driverType === "B") {
      this.ctx.moveTo(width / 2, 0);
      this.ctx.lineTo(width / 4, -height / 2);
      this.ctx.lineTo(-width / 2, -height / 2);
      this.ctx.lineTo(-width / 2, height / 2);
      this.ctx.lineTo(width / 4, height / 2);
      this.ctx.closePath();
    } else {
      this.ctx.roundRect(-width / 2, -height / 2, width, height, 3);
    }
    this.ctx.fillStyle = colors.primary;
    this.ctx.fill();

    this.ctx.restore();
  }

  private drawCarShapeFull(
    x: number,
    y: number,
    rotation: number,
    driverType: DriverType,
    config: SimulationConfig,
    speedRatio: number,
    isBraking: boolean,
    isChangingLane: boolean,
    laneChangeDirection: "left" | "right" | null,
    isDistracted: boolean,
    distractionIntensity: number,
    stuckTime: number
  ): void {
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(rotation + Math.PI / 2);

    const width = config.carLength;
    const height = config.carWidth;

    if (isDistracted && driverType === "C") {
      this.drawThinkingDots(width, height, distractionIntensity);
    }

    let colors = this.getDriverTypeColors(driverType, speedRatio);
    if (driverType === "B" && stuckTime > 1) {
      const frustrationLevel = Math.min(stuckTime / 3, 1);
      const h = 15 - frustrationLevel * 15;
      const brightness = 0.6 + speedRatio * 0.4;
      colors = {
        primary: `hsl(${h}, 90%, ${50 * brightness}%)`,
        secondary: `hsl(${h}, 90%, ${35 * brightness}%)`,
        border: `hsl(${h}, 90%, ${60 * brightness}%)`,
      };
    }

    const gradient = this.ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
    gradient.addColorStop(0, colors.secondary);
    gradient.addColorStop(0.5, colors.primary);
    gradient.addColorStop(1, colors.secondary);

    this.ctx.beginPath();
    switch (driverType) {
      case "A":
        this.ctx.roundRect(-width / 2, -height / 2, width, height, 3);
        break;
      case "B":
        this.ctx.moveTo(width / 2, 0);
        this.ctx.lineTo(width / 4, -height / 2);
        this.ctx.lineTo(-width / 2, -height / 2);
        this.ctx.lineTo(-width / 2, height / 2);
        this.ctx.lineTo(width / 4, height / 2);
        this.ctx.closePath();
        break;
      case "C":
        this.ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
        break;
    }

    this.ctx.fillStyle = gradient;
    this.ctx.fill();
    this.ctx.strokeStyle = colors.border;
    this.ctx.lineWidth = 1;
    this.ctx.stroke();

    this.ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    this.ctx.beginPath();
    this.ctx.arc(width / 3, 0, 2, 0, Math.PI * 2);
    this.ctx.fill();

    if (isBraking) {
      this.ctx.fillStyle = "rgba(255, 50, 50, 0.9)";
      this.ctx.beginPath();
      this.ctx.arc(-width / 2 + 2, -height / 4, 2.5, 0, Math.PI * 2);
      this.ctx.arc(-width / 2 + 2, height / 4, 2.5, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.shadowColor = "#ff3333";
      this.ctx.shadowBlur = 8;
      this.ctx.beginPath();
      this.ctx.arc(-width / 2 + 2, 0, 3, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }

    if (isChangingLane && laneChangeDirection) {
      const blinkOn = Math.floor(performance.now() / 250) % 2 === 0;
      if (blinkOn) {
        this.ctx.fillStyle = "rgba(255, 180, 0, 0.9)";
        const signalY =
          laneChangeDirection === "right" ? -height / 2 - 2 : height / 2 + 2;
        this.ctx.beginPath();
        this.ctx.arc(width / 4, signalY, 2, 0, Math.PI * 2);
        this.ctx.arc(-width / 4, signalY, 2, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    this.ctx.restore();
  }

  private getDriverTypeColors(
    driverType: DriverType,
    speedRatio: number
  ): { primary: string; secondary: string; border: string } {
    const brightness = 0.6 + speedRatio * 0.4;

    switch (driverType) {
      case "A":
        return {
          primary: `hsl(210, 70%, ${50 * brightness}%)`,
          secondary: `hsl(210, 70%, ${35 * brightness}%)`,
          border: `hsl(210, 70%, ${60 * brightness}%)`,
        };
      case "B":
        return {
          primary: `hsl(15, 80%, ${50 * brightness}%)`,
          secondary: `hsl(15, 80%, ${35 * brightness}%)`,
          border: `hsl(15, 80%, ${60 * brightness}%)`,
        };
      case "C":
        return {
          primary: `hsl(145, 60%, ${45 * brightness}%)`,
          secondary: `hsl(145, 60%, ${30 * brightness}%)`,
          border: `hsl(145, 60%, ${55 * brightness}%)`,
        };
    }
  }

  private drawThinkingDots(
    width: number,
    _height: number,
    intensity: number
  ): void {
    const time = performance.now() * 0.004;
    const dotRadius = 1.5;
    const spacing = 4;
    const baseX = width / 2 + 8;

    for (let i = 0; i < 3; i++) {
      const phase = (time - i * 0.5) % (Math.PI * 2);
      const scale = 0.5 + Math.max(0, Math.sin(phase)) * 0.5;
      const alpha = 0.4 + scale * 0.6 * intensity;

      this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(
        baseX,
        i * spacing - spacing,
        dotRadius * scale + 0.5,
        0,
        Math.PI * 2
      );
      this.ctx.fill();
    }
  }

  getCanvasCenter(): { x: number; y: number } {
    return { x: this.centerX, y: this.centerY };
  }

  getOuterRadius(config: SimulationConfig): number {
    return config.baseRadius + (config.numLanes - 0.5) * config.laneWidth;
  }
}
