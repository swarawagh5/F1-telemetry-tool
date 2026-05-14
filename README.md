# 🏎️ F1 Telemetry Analysis Tool

**Built by:** Swara | Onyx Racing Formula Student  
**Stack:** Python · FastF1 · Matplotlib · Pandas · NumPy  
**Purpose:** Corner-by-corner telemetry comparison between F1 drivers using real official data.

---

## What This Does

This tool pulls **real F1 telemetry data** (speed, throttle, brake, gear, tyre life) 
from the official F1 timing feed via the FastF1 library and generates:

1. **Head-to-head telemetry panel** — 4-channel comparison (speed / throttle / brake / gear) aligned by distance
2. **Speed trace with delta shading** — visual fingerprint of where each driver is faster
3. **Tyre degradation model** — lap time vs tyre age with linear degradation rate (ms/lap) — Race sessions only

---

## Setup (do this once)

```bash
# 1. Clone or download this project
git clone https://github.com/YOUR_USERNAME/f1-telemetry-tool.git
cd f1-telemetry-tool

# 2. Create a virtual environment (keeps your system Python clean)
python -m venv venv
source venv/bin/activate        # Mac/Linux
# OR
venv\Scripts\activate           # Windows

# 3. Install dependencies
pip install -r requirements.txt
```

---

## Running It

```bash
cd src
python telemetry_analysis.py
```

First run takes ~30–60 seconds to download data. After that, FastF1 caches it locally
in `data_cache/` so subsequent runs are instant.

---

## Changing the Race / Drivers

Open `src/telemetry_analysis.py` and edit the **CONFIG block** at the top:

```python
YEAR        = 2024          # Any year from 2018 onwards
GRAND_PRIX  = "Bahrain"     # e.g. "Monaco", "Silverstone", "Monza"
SESSION     = "Q"           # Q=Qualifying, R=Race, FP1/FP2/FP3=Practice
DRIVER_1    = "VER"         # 3-letter codes: HAM, NOR, PIA, SAI, etc.
DRIVER_2    = "LEC"
```

---

## Output Files

All plots are saved to `outputs/` automatically:

| File | Description |
|------|-------------|
| `{YEAR}_{GP}_{SESSION}_{D1}_vs_{D2}_telemetry.png` | 4-channel telemetry panel |
| `{YEAR}_{GP}_{SESSION}_{D1}_vs_{D2}_speed.png` | Speed trace with delta shading |
| `{YEAR}_{GP}_R_{D1}_vs_{D2}_tyredeg.png` | Tyre degradation (race only) |

---

## Understanding the Code — Key Concepts

### FastF1 Data Pipeline
```
fastf1.get_session()  →  creates a Session object (no data yet)
session.load()        →  downloads telemetry, timing, weather
session.laps          →  pandas DataFrame of every lap from every driver
lap.get_telemetry()   →  pandas DataFrame of sensor data (~4Hz sampling rate)
```

### Telemetry Channels Available
| Column | Unit | Description |
|--------|------|-------------|
| Speed | km/h | GPS-derived vehicle speed |
| Throttle | % (0–100) | Accelerator pedal position |
| Brake | bool | Brake pedal pressed (True/False) |
| nGear | 1–8 | Current gear |
| RPM | rev/min | Engine RPM |
| DRS | 0/1/8/10/12/14 | DRS status (10+ = open) |
| X, Y, Z | metres | Track position coordinates |
| Distance | metres | Distance from lap start (added by `.add_distance()`) |

### Why We Align by Distance (not Time)
Two drivers don't cross the start line at the same moment, so you can't 
compare `Speed at T+30s` — it means different track positions for each.
Aligning by **distance** means `Speed at 1200m` is always Turn 4 for both drivers.

### Tyre Degradation Model
We use `np.polyfit(x, y, 1)` — this fits a straight line through the 
lap time vs tyre life data points. The slope of that line = degradation rate.
Example: slope of 0.08 = lap time increases by ~80ms per lap of tyre wear.

---

## Making It Your Own (How to Differentiate)

These extensions will make this project **unique on your CV**:

### Extension 1 — Formula Student Mode
Import your own team's CAN bus data (from the car's data logger) and 
plot the same channels. Now the tool works on real data you generated yourself.

### Extension 2 — Undercut Window Calculator
```python
# Pseudo-code
tyre_deg_rate = slope_from_polyfit          # seconds lost per lap
time_in_pits  = 22.5                         # average pit stop time (seconds)
undercut_window = time_in_pits / tyre_deg_rate
print(f"Undercut works if gap is under {undercut_window:.1f} laps of tyre deg")
```

### Extension 3 — Track Evolution
Plot lap time improvement over a qualifying session. Each driver should 
get faster as rubber goes down — unusual patterns reveal setup changes.

### Extension 4 — Interactive Dashboard (Project Layer 2)
Wrap this in a Streamlit or Dash web app so you can change drivers 
from a dropdown without touching code.

---

## CV Framing

**Project title:** F1 Telemetry Analysis Tool  
**One-liner:** Engineered a Python tool using official F1 timing data to perform lap-by-lap telemetry comparison and tyre degradation modelling across driver stints.  
**Tech keywords:** Python, FastF1, Pandas, NumPy, Matplotlib, data analysis, motorsport engineering

**Where to post:**
- GitHub (primary — link this in your CV)
- LinkedIn (post a screenshot of the speed trace plot, tag it #Formula1 #DataScience)
- Kaggle (upload as a notebook for community visibility)

---

## Driver Code Reference

| Code | Driver |
|------|--------|
| VER | Max Verstappen |
| NOR | Lando Norris |
| LEC | Charles Leclerc |
| HAM | Lewis Hamilton |
| PIA | Oscar Piastri |
| SAI | Carlos Sainz |
| RUS | George Russell |
| ALO | Fernando Alonso |
| STR | Lance Stroll |
| PER | Sergio Perez |

Full list: https://theoehrly.github.io/Fast-F1/driver_ids.html
