# Agar.io & Sigmally Physics & Mathematical Specification

This specification documents the mathematical models, server-authoritative physics simulations, collision algorithms, and timing curves for high-performance Agar.io and Sigmally-style competitive arena games.

---

## 1. Dimensionality, Mass, & Radius

### 1.1 Spatial Coordinate System
- **Map Dimensions**: $W \times H = 10,000 \times 10,000$ units (or competitive standard $14,142 \times 14,142$ units for FFA maps).
- **Coordinate System**: Euclidean 2D space with origin $(0, 0)$ at the top-left boundary and $(W, H)$ at the bottom-right boundary.
- **Boundary Clamping**: Every entity with radius $R$ is constrained such that:
  $$\forall \text{cell}: \quad x \in [R, W - R], \quad y \in [R, H - R]$$

### 1.2 Mass to Radius Transformation
In 2D cell-growth mechanics, cell visual area is proportional to cell mass:
$$\text{Area} \propto \text{Mass} \implies \pi R^2 = k_0 \cdot M \implies R(M) = k \sqrt{M}$$

In standard competitive configurations:
$$R(M) = \sqrt{M \times 100} = 10 \sqrt{M}$$
For a starting mass $M = 50$:
$$R(50) = \sqrt{5000} \approx 70.71 \text{ units}$$
For a virus with $M = 100$:
$$R(100) = \sqrt{10000} = 100.0 \text{ units}$$

### 1.3 Radius Interpolation
To avoid jarring visual popping during rapid mass acquisition (eating food or viruses), radius expands smoothly via exponential easing:
$$R_{t + \Delta t} = R_t + (R_{\text{target}} - R_t) \cdot \min(1, \lambda_r \Delta t), \quad \text{where } \lambda_r = 5.0\text{ s}^{-1}$$

---

## 2. Velocity, Agility, & Movement Curves

### 2.1 Velocity Scaling Curve
Small cells must be agile and nimble, whereas giant cells are heavy, powerful, and sluggish. The speed curve follows a power-law decay:
$$v(M) = \max\left(v_{\min}, \; \frac{v_0}{M^p}\right)$$

| Parameter | Standard Value | Description |
| :--- | :--- | :--- |
| $v_0$ (Base Speed) | $960$ | Base speed scalar |
| $p$ (Velocity Exponent) | $0.38$ | Rate of speed decay with mass |
| $v_{\min}$ (Floor Speed) | $72 \text{ px/s}$ | Prevents massive cells from stalling |

#### Velocity Profiles Across Mass Tiers
- **$M = 10$**: $v(10) = \max(72, 960 / 10^{0.38}) \approx 400.1 \text{ px/s}$ (High agility)
- **$M = 50$**: $v(50) = \max(72, 960 / 50^{0.38}) \approx 217.3 \text{ px/s}$ (Standard combat speed)
- **$M = 100$**: $v(100) = \max(72, 960 / 100^{0.38}) \approx 166.8 \text{ px/s}$
- **$M = 500$**: $v(500) = \max(72, 960 / 500^{0.38}) \approx 90.6 \text{ px/s}$
- **$M = 1,000$**: $v(1000) = \max(72, 960 / 1000^{0.38}) \approx 72.0 \text{ px/s}$ (Cap reached)

### 2.2 Target-Driven Cursor Steering
Movement is governed by the vector between the cell's center $(x_c, y_c)$ and the cursor's world position $(x_m, y_m)$:
$$\vec{D} = (x_m - x_c, \; y_m - y_c), \quad d = \|\vec{D}\| = \sqrt{(x_m - x_c)^2 + (y_m - y_c)^2}$$

If $d > 15 \text{ units}$ (outside the deadzone):
$$\hat{u} = \frac{\vec{D}}{d}, \quad \vec{v}_{\text{target}} = \hat{u} \cdot v(M)$$
$$\vec{v}_{t + \Delta t} = \vec{v}_t + (\vec{v}_{\text{target}} - \vec{v}_t) \cdot \min(1, \lambda_s \Delta t), \quad \text{where } \lambda_s = 9.0\text{ s}^{-1}$$

---

## 3. Splitting Dynamics & Impulse Vectoring

### 3.1 Split Mass Partitioning
Splitting is permissible when cell mass $M \ge M_{\text{split\_min}} = 36$:
$$M_{\text{parent}} = \lfloor M / 2 \rfloor, \quad M_{\text{child}} = \lfloor M / 2 \rfloor$$
The maximum simultaneous split piece count per player is capped at:
$$N_{\max} = 16 \text{ cells}$$

### 3.2 Directional Angle & Spawn Placement
Splitting is strictly directional along the cursor heading vector:
$$\theta = \text{atan2}(y_m - y_c, \; x_m - x_c)$$

The child cell is placed immediately in front of the parent cell to prevent spatial clipping:
$$\vec{p}_{\text{child}} = \vec{p}_{\text{parent}} + \begin{pmatrix} \cos\theta \\ \sin\theta \end{pmatrix} \cdot (R_{\text{parent}} + 6)$$

### 3.3 Reactable Impulse Velocity Curve
Rather than an instantaneous position teleport, the launched child inherits a forward impulse velocity $\vec{v}_{\text{boost}}$ that smoothly decelerates via exponential friction:
$$\vec{v}_{\text{boost}}(0) = \begin{pmatrix} \cos\theta \\ \sin\theta \end{pmatrix} \cdot v_{\text{impulse}}, \quad \text{where } v_{\text{impulse}} = 820 \text{ px/s}$$

Over time step $\Delta t$:
$$\vec{p}(t + \Delta t) = \vec{p}(t) + \vec{v}_{\text{boost}}(t) \cdot \Delta t$$
$$\vec{v}_{\text{boost}}(t + \Delta t) = \vec{v}_{\text{boost}}(t) \cdot e^{-\lambda_d \Delta t}, \quad \text{where } \lambda_d = 4.2 \text{ s}^{-1}$$

This exponential decay provides crisp, visible motion over $\approx 0.5 - 0.7$ seconds, allowing opponents sufficient reaction time to dodge or counter-split.

---

## 4. Recombination & Sibling Cell Mechanics

### 4.1 Recombination Delay Timer
Each split cell maintains an independent countdown timer before merging is permitted:
$$t_{\text{merge}}(M) = \max(8, \; 12 + 0.018 \cdot M) \text{ seconds}$$
- $M = 50 \implies t_{\text{merge}} = 12.9 \text{ s}$
- $M = 500 \implies t_{\text{merge}} = 21.0 \text{ s}$
- $M = 2,000 \implies t_{\text{merge}} = 48.0 \text{ s}$

### 4.2 Sibling Separation Force ($t_{\text{merge}} > 0$)
While either sibling cell's merge timer is active, an overlap repulsion force prevents cells from glitching inside one another:
$$\text{overlap} = (R_1 + R_2) - \|\vec{p}_1 - \vec{p}_2\|$$
If $\text{overlap} > 0$:
$$\vec{F}_{\text{repulse}} = \frac{\vec{p}_2 - \vec{p}_1}{\|\vec{p}_2 - \vec{p}_1\|} \cdot (\text{overlap} \cdot 0.45)$$
$$\vec{p}_1 \mathrel{-}= \vec{F}_{\text{repulse}} \cdot 0.5, \quad \vec{p}_2 \mathrel{+}= \vec{F}_{\text{repulse}} \cdot 0.5$$

### 4.3 Smooth Magnetic Merging ($t_{\text{merge}} \le 0$)
When both sibling cells satisfy $t_{\text{merge}} \le 0$, they do not snap instantly into one. Instead, they gently pull toward their mutual center of mass:
$$\vec{p}_{\text{com}} = \frac{\vec{p}_1 M_1 + \vec{p}_2 M_2}{M_1 + M_2}$$
$$\vec{p}_i(t + \Delta t) = \vec{p}_i(t) + (\vec{p}_{\text{com}} - \vec{p}_i(t)) \cdot \min(1, \; 2.8 \Delta t)$$

When the distance between centers falls below the merge threshold:
$$\|\vec{p}_1 - \vec{p}_2\| < \max\left(16, \; 0.45 \cdot \max(R_1, R_2)\right)$$
The merge is executed:
$$M_{\text{merged}} = M_1 + M_2, \quad \vec{p}_{\text{merged}} = \vec{p}_{\text{com}}$$

---

## 5. Virus Consumption & Spiky Mechanics

### 5.1 Stationary Viruses
- **Virus Mass**: $M_v = 100$
- **Virus Radius**: $R_v = \sqrt{100 \times 100} = 100 \text{ units}$
- **Spike Count**: 16 alternating inner/outer vertices ($r_{\text{inner}} = 0.86 R_v, \; r_{\text{outer}} = R_v$)

### 5.2 Sub-Virus Cell Hiding
If a cell touches a virus and $R_{\text{cell}} \le 1.02 \cdot R_v$:
- **Outcome**: The cell slides safely underneath the virus without taking damage or triggering collisions. Smaller cells utilize this mechanic for tactical protection against giant predators.

### 5.3 Virus Consumption & Explosion
If a cell touches a virus and $R_{\text{cell}} > 1.02 \cdot R_v$:
1. **Mass Absorption**: The virus is **consumed**. Its mass is transferred to the colliding cell:
   $$M_{\text{cell}} \leftarrow M_{\text{cell}} + M_v$$
2. **Virus Despawn & Respawn**: The consumed virus is removed immediately and respawned elsewhere in the arena.
3. **Maximum Splitting Rule**: The cell explodes into as many fragments as possible up to $N_{\max} = 16$:
   $$K_{\text{pieces}} = \min(16 - N_{\text{current}}, \; 15)$$
   If the player is already at 16 pieces, the player **safely absorbs the virus for +100 mass without splitting** (competitive "virus farming").
4. **Radial Fragment Burst**: Fragments are distributed evenly across full 360-degree radial angles:
   $$\theta_i = \frac{2\pi \cdot i}{K}, \quad \vec{v}_{\text{burst}, i} = \begin{pmatrix} \cos\theta_i \\ \sin\theta_i \end{pmatrix} \cdot (460 + \text{rand}(120)) \text{ px/s}$$

### 5.4 Virus Sniping (Ejected Mass Feeding)
- Ejecting mass into a virus via `W` increases its feed counter: $F \leftarrow F + 1$.
- Upon receiving $F = 7$ pellets, the virus emits an authoritative clone virus projectile along the ejection angle at $900 \text{ px/s}$, detonating the first enemy cell larger than 100 mass it collides with.

---

## 6. Predation & Inter-Player Eating

A cell $C_1$ can eat cell $C_2$ if and only if two conditions are satisfied:
1. **Mass Superiority**:
   $$M_1 > \beta \cdot M_2, \quad \text{where } \beta = 1.15 \text{ (or } 1.50 \text{ for clanmates)}$$
2. **Geometric Center Enclosure**:
   The smaller cell's center must overlap significantly inside the predator's perimeter:
   $$\|\vec{p}_1 - \vec{p}_2\| < R_1 - 0.35 \cdot R_2$$

---

## 7. Passive Mass Decay

To prevent perpetual stagnation by dominant giant cells, mass decay applies continuously to mass exceeding $M_{\text{base}} = 50$:
$$\frac{dM}{dt} = -0.0016 \cdot M$$
$$M(t + \Delta t) = M(t) - (M(t) \cdot 0.0016) \cdot \Delta t$$

---

## 8. Spatial Hash Grid Partitioning

To maintain a consistent 60 FPS update rate with $>2,500$ food pellets, viruses, and multiple split players, arena space is partitioned into a uniform 2D grid bucket with cell dimension:
$$S_{\text{bucket}} = 400 \text{ units}$$
Hash key generation using bitwise packing:
$$\text{Key}(\text{col}, \text{row}) = (\text{col} \ll 16) \;|\; (\text{row} \ \& \ 0\text{xFFFF})$$
Broad-phase queries bound search complexity from $O(N^2)$ to $O(N + K)$, eliminating stutter during multi-player 16-piece tricksplit collisions.

---

## 9. Competitive Multi-Agent AI & Teaming Systems

### 9.1 Player Archetypes & Skill Coefficients
Autonomous bots simulate diverse competitive human playstyles across varying skill tiers ($S \in [0.65, 0.99]$):

| Archetype | Skill $S$ | Reaction Window | Primary Behaviors |
| :--- | :--- | :--- | :--- |
| **`CRACKED_PRO`** | $0.93 - 0.99$ | $50 - 110\text{ ms}$ | Target-leading split-kills, double splits, offensive virus sniping, emergency virus hiding |
| **`TEAM_DUO`** | $0.90 - 0.98$ | $80 - 150\text{ ms}$ | Mutual clan tagging (`[OG]`, `[VOID]`, `[4K]`), cooperative 'W' feeding, bodyguard defense |
| **`AGGRESSIVE_RUSHER`** | $0.82 - 0.88$ | $120 - 200\text{ ms}$ | High-momentum hunting, rapid double splits, golden super-orb dominance |
| **`CAUTIOUS_SURVIVOR`** | $0.66 - 0.74$ | $180 - 300\text{ ms}$ | Perimeter foraging, defensive virus lurking, evasive steering |

### 9.2 Human-Simulated Mouse Heading Smoothing
Rather than telepathically snapping target vectors, bot cursor heading simulates physical human hand tracking:
$$\vec{p}_{\text{cursor}}(t + \Delta t) = \vec{p}_{\text{cursor}}(t) + (\vec{p}_{\text{desired}} - \vec{p}_{\text{cursor}}(t)) \cdot \min(1, \; (8.0 + 8.0 \cdot S) \Delta t)$$

### 9.3 Teammate Mass Transfer ('W' Feeding)
In cooperative clan pairs (`TEAM_DUO`), when partner cell $C_{\text{partner}}$ satisfies:
$$M_{\text{partner}} < 0.70 \cdot M_{\text{self}} \quad \text{and} \quad \|\vec{p}_{\text{partner}} - \vec{p}_{\text{self}}\| < 450 \text{ units}$$
The bot rotates its cursor directly towards the partner's centroid and rapid-fires ejected mass pellets at 12–15 Hz until mass parity or tactical split threshold is reached.

### 9.4 Offensive Virus Sniping Geometry
When an enemy giant cell $C_{\text{giant}}$ ($M > 130$) is in proximity to a virus $V$ ($d(C_{\text{giant}}, V) < 420$), a cracked bot $B$ evaluates the feed alignment angle:
$$\theta_{\text{feed}} = \text{atan2}(y_V - y_B, \; x_V - x_B), \quad \theta_{\text{target}} = \text{atan2}(y_{\text{giant}} - y_V, \; x_{\text{giant}} - x_V)$$
$$\Delta\theta = |\theta_{\text{feed}} - \theta_{\text{target}}|$$
If $\Delta\theta < 0.65 \text{ rad}$, the bot positions behind the virus and ejects mass into it, launching a clone virus directly into the predator.

