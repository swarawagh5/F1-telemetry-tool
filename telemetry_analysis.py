"""
F1 Telemetry Analysis Tool
==========================
Built by: Swara | Onyx Racing Formula Student
Purpose : Analyse F1 driver telemetry corner-by-corner using real FastF1 data.
          Compare two drivers across speed, throttle, brake, and gear channels.

HOW IT WORKS (plain English):
  FastF1 is a Python library that pulls official F1 timing + telemetry data
  from the Ergast API and F1's own data feed. It gives you a dataframe (like
  an Excel table) of every telemetry sample recorded ~4x per second during a lap.
  We load that data, filter it for two drivers, and plot the comparison.
"""

# ── IMPORTS ───────────────────────────────────────────────────────────────────
# fastf1  → the library that talks to F1's data servers
# matplotlib → the plotting library (think: Python's Excel charts, but better)
# pandas  → for handling dataframes (tables of data)
# numpy   → for maths operations on arrays
# os      → to create folders if they don't exist

import fastf1                          # pip install fastf1
import fastf1.plotting                 # sub-module: sets up F1 team colours
import matplotlib.pyplot as plt        # main plotting engine
import matplotlib.gridspec as gridspec # lets us create multi-panel plots
from matplotlib.collections import LineCollection  # for coloured speed trace
import pandas as pd
import numpy as np
import os
import warnings
warnings.filterwarnings("ignore")      # suppress minor version warnings

# ── CONFIG ────────────────────────────────────────────────────────────────────
# Change these values to analyse any race/drivers you want.

YEAR        = 2024          # F1 season year
GRAND_PRIX  = "Bahrain"     # Race name — must match FastF1's naming exactly
SESSION     = "Q"           # Q = Qualifying | R = Race | FP1/FP2/FP3 = Practice
DRIVER_1    = "VER"         # 3-letter driver code (Verstappen)
DRIVER_2    = "LEC"         # 3-letter driver code (Leclerc)
CACHE_DIR   = "data_cache"  # FastF1 saves downloaded data here (saves re-downloading)
OUTPUT_DIR  = "outputs"     # Where we save our final plot images

# ── SETUP ─────────────────────────────────────────────────────────────────────
# Create output folder if it doesn't exist
os.makedirs(OUTPUT_DIR, exist_ok=True)   # exist_ok=True = no error if folder already there

# Enable FastF1's cache so data is saved locally after first download.
# Without this, every run re-downloads from the internet (slow).
fastf1.Cache.enable_cache(CACHE_DIR)

# ── LOAD SESSION DATA ─────────────────────────────────────────────────────────
print(f"\n[1/5] Loading {YEAR} {GRAND_PRIX} {SESSION} session...")

# get_session() creates a Session object — it hasn't downloaded data yet
session = fastf1.get_session(YEAR, GRAND_PRIX, SESSION)

# .load() actually downloads telemetry, timing, weather, tyre data
# laps=True      → lap-by-lap timing data
# telemetry=True → the high-frequency speed/throttle/brake sensor data
# weather=True   → air temp, track temp, rainfall
session.load(laps=True, telemetry=True, weather=True)

print(f"    ✓ Session loaded. {len(session.laps)} total laps found.")

# ── GET FASTEST LAPS ──────────────────────────────────────────────────────────
print(f"\n[2/5] Extracting fastest laps for {DRIVER_1} and {DRIVER_2}...")

# session.laps is a dataframe of ALL laps from ALL drivers.
# .pick_driver() filters it to just one driver's laps.
# .pick_fastest() then returns the single fastest lap row.
lap1 = session.laps.pick_driver(DRIVER_1).pick_fastest()
lap2 = session.laps.pick_driver(DRIVER_2).pick_fastest()

# .LapTime is a timedelta object — format it as mm:ss.sss for display
t1 = str(lap1["LapTime"])[7:16]  # slice removes "0:0" prefix from timedelta
t2 = str(lap2["LapTime"])[7:16]

print(f"    {DRIVER_1} fastest lap: {t1}")
print(f"    {DRIVER_2} fastest lap: {t2}")

# ── GET TELEMETRY ─────────────────────────────────────────────────────────────
print(f"\n[3/5] Pulling telemetry channels...")

# .get_telemetry() returns a dataframe with columns:
#   Time, RPM, Speed, Throttle, Brake, DRS, nGear, X, Y, Z (track position)
# add_distance=True adds a "Distance" column (metres from lap start)
# This is crucial — we align both drivers by distance, not time,
# because they don't start at the same millisecond.

tel1 = lap1.get_telemetry().add_distance()
tel2 = lap2.get_telemetry().add_distance()

print(f"    {DRIVER_1}: {len(tel1)} telemetry samples")
print(f"    {DRIVER_2}: {len(tel2)} telemetry samples")

# ── TYRE DEGRADATION ─────────────────────────────────────────────────────────
print(f"\n[4/5] Calculating tyre degradation...")

# Tyre degradation = how lap time increases as tyres wear over a stint.
# We filter all laps for each driver, then track lap time vs. lap number.
# This is a simplified model — real tyre deg also factors in fuel load,
# track evolution, and pace management.

def get_tyre_deg(session, driver_code):
    """
    Returns a dataframe of [LapNumber, LapTimeSeconds, Compound, TyreLife]
    for a given driver in this session. Filters out outlier laps (pit laps,
    VSC laps, etc.) using FastF1's IsAccurate flag.
    """
    driver_laps = session.laps.pick_driver(driver_code)

    # IsAccurate=True means FastF1 has flagged this lap as a clean, representative lap
    # (not an in-lap, out-lap, SC lap, or lap with data issues)
    clean_laps = driver_laps[driver_laps["IsAccurate"] == True].copy()

    if clean_laps.empty:
        return None

    # Convert LapTime (timedelta) to seconds (float) for maths
    clean_laps["LapTimeSeconds"] = clean_laps["LapTime"].dt.total_seconds()

    return clean_laps[["LapNumber", "LapTimeSeconds", "Compound", "TyreLife"]].reset_index(drop=True)

deg1 = get_tyre_deg(session, DRIVER_1)
deg2 = get_tyre_deg(session, DRIVER_2)

# ── PLOTTING ──────────────────────────────────────────────────────────────────
print(f"\n[5/5] Generating plots...")

# Use FastF1's plotting style — dark background, team colours
fastf1.plotting.setup_mpl(mpl_timedelta_support=True, misc_mpl_mods=False)

# Get team colours for each driver from FastF1's database
color1 = fastf1.plotting.get_driver_color(DRIVER_1, session)
color2 = fastf1.plotting.get_driver_color(DRIVER_2, session)

# ═══════════════════════════════════════════════════════════════
# PLOT 1: HEAD-TO-HEAD TELEMETRY COMPARISON
# ═══════════════════════════════════════════════════════════════
# GridSpec lets us create a grid of subplots with custom sizing.
# Here: 4 rows (Speed, Throttle, Brake, Gear), 1 column
# hspace=0.08 = tight vertical spacing between panels

fig1, axes = plt.subplots(4, 1, figsize=(16, 10), sharex=True)
fig1.patch.set_facecolor("#0f0f0f")      # dark background for whole figure
fig1.suptitle(
    f"{YEAR} {GRAND_PRIX} {SESSION} — {DRIVER_1} ({t1}) vs {DRIVER_2} ({t2})\nFastest Lap Telemetry Comparison",
    color="white", fontsize=14, fontweight="bold", y=0.98
)

channels = [
    ("Speed",    "Speed (km/h)",  False),
    ("Throttle", "Throttle (%)",  False),
    ("Brake",    "Brake",         True),   # True = fill area (boolean channel)
    ("nGear",    "Gear",          False),
]

for ax, (channel, ylabel, is_bool) in zip(axes, channels):
    ax.set_facecolor("#1a1a1a")    # dark subplot background

    if is_bool:
        # Brake is a boolean (True/False on/off) — fill looks better than a line
        ax.fill_between(tel1["Distance"], tel1[channel].astype(int),
                        alpha=0.7, color=color1, label=DRIVER_1, step="post")
        ax.fill_between(tel2["Distance"], tel2[channel].astype(int),
                        alpha=0.4, color=color2, label=DRIVER_2, step="post")
    else:
        ax.plot(tel1["Distance"], tel1[channel], color=color1, lw=1.5, label=DRIVER_1)
        ax.plot(tel2["Distance"], tel2[channel], color=color2, lw=1.5, label=DRIVER_2, alpha=0.85)

    ax.set_ylabel(ylabel, color="white", fontsize=9)
    ax.tick_params(colors="white", labelsize=8)
    ax.spines[["top","right","left","bottom"]].set_visible(False)
    ax.grid(axis="x", color="#333333", lw=0.5)
    ax.legend(loc="upper right", fontsize=8, framealpha=0.2)

axes[-1].set_xlabel("Distance (m)", color="white", fontsize=10)

# Delta time trace (who's ahead at each point of the lap)
# ── DELTA ────────────────────────────────────────────────────────────────────
# We can't directly plot delta here without interpolation — added as bonus below
# in the README. For now, the 4 channels give a clear picture.

plt.tight_layout(rect=[0, 0, 1, 0.95])
plot1_path = os.path.join(OUTPUT_DIR, f"{YEAR}_{GRAND_PRIX}_{SESSION}_{DRIVER_1}_vs_{DRIVER_2}_telemetry.png")
plt.savefig(plot1_path, dpi=150, bbox_inches="tight", facecolor=fig1.get_facecolor())
print(f"    ✓ Saved: {plot1_path}")

# ═══════════════════════════════════════════════════════════════
# PLOT 2: SPEED TRACE COLOURED BY DRIVER (track map style)
# ═══════════════════════════════════════════════════════════════
# Instead of a time-series, we plot Speed vs Distance as a thick coloured line.
# This gives a visual "fingerprint" of the lap.

fig2, ax2 = plt.subplots(figsize=(16, 4))
fig2.patch.set_facecolor("#0f0f0f")
ax2.set_facecolor("#1a1a1a")
ax2.set_title(f"Speed Trace Comparison — {DRIVER_1} vs {DRIVER_2} | {YEAR} {GRAND_PRIX}",
              color="white", fontsize=12, pad=10)

ax2.plot(tel1["Distance"], tel1["Speed"], color=color1, lw=2, label=f"{DRIVER_1} — {t1}")
ax2.plot(tel2["Distance"], tel2["Speed"], color=color2, lw=2, label=f"{DRIVER_2} — {t2}", alpha=0.85)
ax2.fill_between(tel1["Distance"], tel1["Speed"], tel2["Speed"].reindex(tel1.index, method="nearest"),
                 where=(tel1["Speed"] > tel2["Speed"].reindex(tel1.index, method="nearest")),
                 alpha=0.15, color=color1, interpolate=True)
ax2.fill_between(tel1["Distance"], tel1["Speed"], tel2["Speed"].reindex(tel1.index, method="nearest"),
                 where=(tel1["Speed"] < tel2["Speed"].reindex(tel1.index, method="nearest")),
                 alpha=0.15, color=color2, interpolate=True)

ax2.set_xlabel("Distance (m)", color="white")
ax2.set_ylabel("Speed (km/h)", color="white")
ax2.tick_params(colors="white")
ax2.spines[["top","right"]].set_visible(False)
ax2.legend(fontsize=10, framealpha=0.2)
ax2.grid(color="#2a2a2a", lw=0.5)

plt.tight_layout()
plot2_path = os.path.join(OUTPUT_DIR, f"{YEAR}_{GRAND_PRIX}_{SESSION}_{DRIVER_1}_vs_{DRIVER_2}_speed.png")
plt.savefig(plot2_path, dpi=150, bbox_inches="tight", facecolor=fig2.get_facecolor())
print(f"    ✓ Saved: {plot2_path}")

# ═══════════════════════════════════════════════════════════════
# PLOT 3: TYRE DEGRADATION (Race sessions only)
# ═══════════════════════════════════════════════════════════════
# Only makes sense for Race or Practice — skip for Qualifying (only 1 hot lap)

if SESSION == "R" and deg1 is not None and deg2 is not None:
    fig3, ax3 = plt.subplots(figsize=(12, 5))
    fig3.patch.set_facecolor("#0f0f0f")
    ax3.set_facecolor("#1a1a1a")
    ax3.set_title(f"Tyre Degradation — {DRIVER_1} vs {DRIVER_2} | {YEAR} {GRAND_PRIX} Race",
                  color="white", fontsize=12, pad=10)

    for driver_code, deg_data, color in [(DRIVER_1, deg1, color1), (DRIVER_2, deg2, color2)]:
        # Group by tyre stint (compound + whether TyreLife resets = new stint)
        # TyreLife is a running count of how old the tyre is in laps
        for compound, group in deg_data.groupby("Compound"):
            ax3.scatter(group["TyreLife"], group["LapTimeSeconds"],
                        label=f"{driver_code} ({compound})", color=color,
                        alpha=0.7, s=40,
                        marker="o" if driver_code == DRIVER_1 else "^")

            # Fit a linear trend line — slope = degradation rate (seconds/lap)
            # np.polyfit(x, y, 1) returns [slope, intercept]
            if len(group) > 2:
                z = np.polyfit(group["TyreLife"], group["LapTimeSeconds"], 1)
                p = np.poly1d(z)   # creates a function from the coefficients
                x_line = np.linspace(group["TyreLife"].min(), group["TyreLife"].max(), 100)
                ax3.plot(x_line, p(x_line), "--", color=color, alpha=0.5, lw=1.5)
                # Annotate with degradation rate
                ax3.annotate(f"{z[0]*1000:.1f} ms/lap",
                             xy=(x_line[-1], p(x_line[-1])),
                             color=color, fontsize=8)

    ax3.set_xlabel("Tyre Life (laps)", color="white")
    ax3.set_ylabel("Lap Time (seconds)", color="white")
    ax3.tick_params(colors="white")
    ax3.spines[["top","right"]].set_visible(False)
    ax3.legend(fontsize=9, framealpha=0.2)
    ax3.grid(color="#2a2a2a", lw=0.5)
    ax3.invert_yaxis()   # Lower time = faster, so put fastest at top

    plt.tight_layout()
    plot3_path = os.path.join(OUTPUT_DIR, f"{YEAR}_{GRAND_PRIX}_R_{DRIVER_1}_vs_{DRIVER_2}_tyredeg.png")
    plt.savefig(plot3_path, dpi=150, bbox_inches="tight", facecolor=fig3.get_facecolor())
    print(f"    ✓ Saved: {plot3_path}")
else:
    if SESSION != "R":
        print(f"    ⚠ Tyre degradation plot skipped (only available for Race sessions).")

# ── DONE ──────────────────────────────────────────────────────────────────────
print(f"\n✅ All done! Check your '{OUTPUT_DIR}/' folder for the plots.")
print(f"\nTo analyse a different race/drivers, edit the CONFIG section at the top of this file.")
