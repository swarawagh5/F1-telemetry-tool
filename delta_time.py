"""
BONUS: Delta Lap Time Calculator
=================================
This is the most important telemetry metric in real F1 pit walls.
Delta time = "At every point on the track, who is ahead and by how much?"

A positive delta means Driver 1 is LOSING time to Driver 2 at that sector.
A negative delta means Driver 1 is GAINING.

HOW IT WORKS:
  Both drivers have telemetry sampled at different distances (FastF1 doesn't
  guarantee equal spacing). We use numpy.interp() to resample both onto
  the SAME distance grid, then compute the cumulative time difference.
"""

import fastf1
import fastf1.plotting
import matplotlib.pyplot as plt
import numpy as np
import os

# ── CONFIG ────────────────────────────────────────────────────────────────────
YEAR        = 2024
GRAND_PRIX  = "Bahrain"
SESSION     = "Q"
DRIVER_1    = "VER"
DRIVER_2    = "LEC"
CACHE_DIR   = "data_cache"
OUTPUT_DIR  = "outputs"

os.makedirs(OUTPUT_DIR, exist_ok=True)
fastf1.Cache.enable_cache(CACHE_DIR)
fastf1.plotting.setup_mpl(mpl_timedelta_support=True, misc_mpl_mods=False)

# ── LOAD & EXTRACT ────────────────────────────────────────────────────────────
print("Loading session...")
session = fastf1.get_session(YEAR, GRAND_PRIX, SESSION)
session.load(laps=True, telemetry=True)

lap1 = session.laps.pick_driver(DRIVER_1).pick_fastest()
lap2 = session.laps.pick_driver(DRIVER_2).pick_fastest()

tel1 = lap1.get_telemetry().add_distance()
tel2 = lap2.get_telemetry().add_distance()

# ── DELTA CALCULATION ─────────────────────────────────────────────────────────
# Step 1: Create a common distance grid
#   Both telemetry traces end at roughly the same total distance (one lap)
#   but may have slightly different lengths due to GPS drift.
#   We create a grid from 0 to the shorter of the two, in 10m steps.

max_dist = min(tel1["Distance"].max(), tel2["Distance"].max())

# np.arange(start, stop, step) — like range() but for floats
distance_grid = np.arange(0, max_dist, 10)   # every 10 metres

# Step 2: Resample each driver's time onto the common distance grid
#   np.interp(x_new, x_old, y_old) = interpolates y values at new x positions
#   We're asking: "at exactly 1000m, what was Driver 1's elapsed lap time?"

time1 = np.interp(distance_grid, tel1["Distance"].values, tel1["Time"].dt.total_seconds().values)
time2 = np.interp(distance_grid, tel2["Distance"].values, tel2["Time"].dt.total_seconds().values)

# Step 3: Delta = Driver1_time - Driver2_time
#   Positive = Driver 1 is slower (losing time)
#   Negative = Driver 1 is faster (gaining time)
delta = time1 - time2

# ── PLOT ──────────────────────────────────────────────────────────────────────
color1 = fastf1.plotting.driver_color(DRIVER_1)
color2 = fastf1.plotting.driver_color(DRIVER_2)

fig, ax = plt.subplots(figsize=(16, 4))
fig.patch.set_facecolor("#0f0f0f")
ax.set_facecolor("#1a1a1a")

t1_str = str(lap1["LapTime"])[7:16]
t2_str = str(lap2["LapTime"])[7:16]
ax.set_title(
    f"Lap Time Delta — {DRIVER_1} vs {DRIVER_2} | {YEAR} {GRAND_PRIX} {SESSION}\n"
    f"Positive = {DRIVER_1} losing time | {DRIVER_1}: {t1_str} | {DRIVER_2}: {t2_str}",
    color="white", fontsize=11
)

# Fill green where Driver 1 is faster, red where Driver 1 is slower
ax.fill_between(distance_grid, delta, 0,
                where=(delta < 0), interpolate=True,
                color=color1, alpha=0.6, label=f"{DRIVER_1} faster")
ax.fill_between(distance_grid, delta, 0,
                where=(delta > 0), interpolate=True,
                color=color2, alpha=0.6, label=f"{DRIVER_2} faster")

ax.plot(distance_grid, delta, color="white", lw=0.8, alpha=0.5)
ax.axhline(0, color="#555555", lw=1, linestyle="--")   # zero reference line

ax.set_xlabel("Distance (m)", color="white")
ax.set_ylabel(f"Delta (s) — {DRIVER_1} ref", color="white")
ax.tick_params(colors="white")
ax.spines[["top","right"]].set_visible(False)
ax.legend(fontsize=9, framealpha=0.2)
ax.grid(color="#2a2a2a", lw=0.5)

# Annotate final delta (overall lap time difference)
final_delta = delta[-1]
ax.annotate(
    f"Final Δ: {final_delta:+.3f}s",
    xy=(distance_grid[-1], final_delta),
    xytext=(-120, 20), textcoords="offset points",
    color="white", fontsize=10,
    arrowprops=dict(arrowstyle="->", color="white", lw=1)
)

plt.tight_layout()
out_path = os.path.join(OUTPUT_DIR, f"{YEAR}_{GRAND_PRIX}_{SESSION}_{DRIVER_1}_vs_{DRIVER_2}_delta.png")
plt.savefig(out_path, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
print(f"✅ Delta plot saved: {out_path}")
