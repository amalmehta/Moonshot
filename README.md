# Moonshot: How a Rocket Works

An unofficial, first-principles website that explains the whole SpaceX rocket system (engines, flight physics, hardware, flight software, Starlink and cost), simulates it live, flies you to the Moon, and checks every model against published figures.

![Home page](docs/images/home.png)

| 3D vehicles, to scale, with cutaway tanks | Fly to the Moon: integrated Earth–Moon trajectory |
|---|---|
| ![3D vehicles](docs/images/vehicles-3d.png) | ![Moon touchdown](docs/images/moon-touchdown.png) |
| **Starlink constellation and coverage** | **200 simulated booster landings** |
| ![Starlink globe](docs/images/starlink.png) | ![Landing Monte Carlo](docs/images/landing-monte-carlo.png) |

```mermaid
flowchart LR
  P[Propulsion<br/>Isp · nozzles · cycles] --> V[3D Vehicles<br/>stages · tanks]
  H[Hardware<br/>steel · buckling · heat] --> V
  V --> F[Flight Physics<br/>ascent · losses · orbits]
  V --> S[Software & AI<br/>Kalman · guidance · landing]
  F --> M[Moon Mission<br/>TLI · refill · land]
  F --> L[Starlink<br/>constellation · RF]
  S --> C[Cost<br/>reuse → $/kg]
  L --> C
```

**Checked against the real thing.** Every row on the [Validation page](docs/images/validation.png) compares a model with a published number (Falcon 9 payload, Merlin/Raptor Isp, Apollo TLI/LOI, Starlink orbits and latency, and more), and `npm test` runs the same checks.

## Links

- [Setup, run and use](docs/INSTRUCTIONS.md)
- [System design](docs/SYSTEM-DESIGN.md)
- [What’s where](docs/FILE-STRUCTURE.md)
- [Project brief](SpaceX.md)

<sub>Not affiliated with, endorsed by, or sponsored by SpaceX. Figures marked “est.” are public estimates.</sub>
