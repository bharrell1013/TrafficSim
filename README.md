# Traffic Flow Laboratory 🚗💨

A high-performance traffic simulation experiment built with TypeScript and HTML5 Canvas. This project models realistic traffic flow on a circular highway using advanced traffic physics models to simulate emergent behaviors like traffic waves, tailgating, and lane-change dynamics.

**[Live Demo](https://bharrell1013.github.io/TrafficSim/)**

## 🏗️ Project Architecture

The project is structured to separate core simulation logic from physics models and UI rendering:

```
src/
├── core/              # Main simulation engine
│   ├── Simulation.ts  # The heart - manages cars, ramps, collisions
│   ├── Renderer.ts    # Canvas rendering
│   └── SpatialHash.ts # Efficient neighbor lookups
├── physics/           # Traffic models
│   ├── IDM.ts         # Car-following acceleration
│   └── MOBIL.ts       # Lane-change decisions
├── models/            # Data structures
│   ├── Car.ts         # Car entity with individual state & behavior
│   └── types.ts       # TypeScript types + driver profiles
└── ui/                # User interface
    ├── Controls.ts    # Simulation controls (speed, lanes, spawn rate)
    └── Dashboard.ts   # Real-time metrics display
```

## 🧠 Physics Models

### IDM (Intelligent Driver Model)

The **IDM** (`src/physics/IDM.ts`) governs how cars accelerate and brake. It calculates acceleration based on:

- Current speed vs. desired speed
- Gap to the car ahead
- Velocity difference (approaching rate)
- Driver-specific parameters (acceleration, braking comfort)

This creates realistic following behaviors, including smooth braking and "elastic" gap maintenance.

### MOBIL (Minimizing Overall Braking Induced by Lane changes)

The **MOBIL** model (`src/physics/MOBIL.ts`) determines when a car should change lanes. It evaluates:

1.  **Self-benefit**: "Will I go faster?"
2.  **Safety**: "Is there a safe gap in the target lane?"
3.  **Politeness**: "Will I force the new follower to brake hard?"
4.  **Incentive**: Lane density logic encourages cars to move to less crowded lanes.

## 🎭 Driver Personalities

The simulation features three distinct driver profiles to create diverse traffic dynamics:

### Type A - "Normal Driver" 🚙

- **Behavior**: Balanced and predictable.
- **Speed**: Adheres effectively to the speed limit.
- **Lane Changes**: Standard safety checks and politeness.
- **Representation**: Standard car visual.

### Type B - "Aggressive Driver" 🏎️

- **Behavior**: Tailgates, weaves through traffic, and pushes for speed.
- **Speed**: Desires 40% _above_ the speed limit.
- **Politeness**: **Negative** (doesn't care if they cut you off).
- **Gap Acceptance**: Squeezes into very small gaps.
- **Representation**: Sporty, distinct visual.

### Type C - "Distracted / Sunday Driver" 📱🐢

- **Behavior**: Erratic speed, slow acceleration, delayed reactions.
- **Distraction Mechanic**: Periodically gets "distracted" (simulating phone use), causing random speed oscillations and sudden braking, which often triggers phantom traffic jams.
- **Speed**: Drives significantly below the speed limit (~55%).
- **Representation**: Boxier, slower-looking vehicle.

## 🛣️ Features

- **Circular Highway**: Infinite road loop allowing for continuous flow analysis.
- **Dynamic Infrastructure**:
  - Add/Remove Lanes on the fly.
  - Place Entrance and Exit Ramps dynamically.
- **Real-time Metrics**:
  - Throughput (cars/min)
  - Average Speed
  - Density
- **Spatial Hashing**: Optimized collision detection and neighbor lookups for high-performance rendering (60fps+).

## Deployment

Deployed via GitHub Actions to GitHub Pages.
