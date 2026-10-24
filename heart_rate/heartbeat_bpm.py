
import time
from collections import deque

import numpy as np
import serial
from scipy.signal import butter, sosfiltfilt, find_peaks

# -------- SETTINGS --------
PORT = "COM11"       # Change to your ESP32-S3 port
BAUD = 115200
FS = 100            # Sampling frequency (Hz)
WINDOW = 10         # Analysis window (seconds)

times = deque(maxlen=FS * WINDOW * 2)
signals = deque(maxlen=FS * WINDOW * 2)

# Heartbeat-related frequencies: 0.7 to 3.5 Hz
sos = butter(
    3,
    [0.7, 3.5],
    btype="bandpass",
    fs=FS,
    output="sos"
)


def calculate_bpm():
    if len(times) < FS * 5:
        return None

    t = np.array(times, dtype=float)
    y = np.array(signals, dtype=float)

    # Use the most recent analysis window
    valid = t >= t[-1] - WINDOW
    t = t[valid]
    y = y[valid]

    # Ignore duplicate timestamps
    t, unique_indices = np.unique(t, return_index=True)
    y = y[unique_indices]

    if len(t) < 200 or t[-1] - t[0] < 5:
        return None

    # Resample to a uniform time grid
    uniform_t = np.arange(t[0], t[-1], 1 / FS)
    uniform_y = np.interp(uniform_t, t, y)

    # Reject saturated or nearly flat input
    if np.mean((uniform_y <= 5) | (uniform_y >= 4090)) > 0.05:
        return None

    if np.std(uniform_y) < 2:
        return None

    # Filter the waveform
    filtered = sosfiltfilt(sos, uniform_y)

    # Detect pulse peaks
    peaks, _ = find_peaks(
        filtered,
        distance=int(FS * 0.4),
        prominence=max(np.std(filtered) * 0.7, 1)
    )

    if len(peaks) < 4:
        return None

    # Find intervals between detected peaks
    beat_times = uniform_t[peaks]
    intervals = np.diff(beat_times)

    # Accept intervals corresponding to 40-150 BPM
    valid_intervals = intervals[
        (intervals >= 0.4) &
        (intervals <= 1.5)
    ]

    if len(valid_intervals) < 3:
        return None

    # Reject inconsistent timing
    median_interval = np.median(valid_intervals)

    if np.median(
        np.abs(valid_intervals - median_interval)
    ) > 0.15 * median_interval:
        return None

    bpm = 60.0 / median_interval
    return round(bpm, 1)


print("Connecting to ESP32-S3...")

with serial.Serial(PORT, BAUD, timeout=0.1) as esp:
    time.sleep(2)
    esp.reset_input_buffer()

    print("Connected! Collecting heartbeat data...")

    last_report = time.monotonic()

    try:
        while True:
            raw = esp.readline().decode(
                "utf-8", errors="ignore"
            ).strip()

            try:
                timestamp, adc = raw.split(",")
                timestamp = int(timestamp) / 1000.0
                adc = int(adc)
            except ValueError:
                continue

            times.append(timestamp)
            signals.append(adc)

            if time.monotonic() - last_report >= 1:
                bpm = calculate_bpm()

                if bpm is None:
                    print("BPM: -- (waiting for stable signal)")
                else:
                    print(f"Estimated BPM: {bpm:.1f}")

                last_report = time.monotonic()

    except KeyboardInterrupt:
        print("\nMonitoring stopped.")
