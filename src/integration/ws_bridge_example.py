"""Minimal bridge from the vision pipeline to the VisionER UI.

    pip install websockets
    python src/integration/ws_bridge_example.py
    open http://localhost:5173/?ws=ws://localhost:8765

Replace `fake_detections` with real webcam detections. The UI tells us which
step it is on, so we only run the detector that step needs.
"""
import asyncio
import json

import websockets

current_step = {"id": "gloves-911"}


async def fake_detections(ws):
    """Stand-in for the vision team: send what step the UI is waiting on."""
    while True:
        await asyncio.sleep(3)
        step = current_step["id"]
        if step == "gloves-911":
            await ws.send(json.dumps({"type": "detected", "label": "gloves", "confidence": 0.9}))
        elif step == "find-wound":
            box = {"x": 0.5, "y": 0.56, "w": 0.13, "h": 0.12}  # normalized frame coords
            await ws.send(json.dumps({"type": "target", "box": box, "confidence": 0.92}))
        elif step == "place-gauze":
            await ws.send(json.dumps({"type": "detected", "label": "gauze", "confidence": 0.88}))
        elif step == "wrap":
            await ws.send(json.dumps({"type": "detected", "label": "bandage", "confidence": 0.85}))


async def handler(ws):
    sender = asyncio.create_task(fake_detections(ws))
    try:
        async for raw in ws:
            msg = json.loads(raw)
            if msg.get("type") == "step":
                current_step["id"] = msg["id"]
                print("UI is on step", msg["step"], msg["id"])
    finally:
        sender.cancel()


async def main():
    async with websockets.serve(handler, "localhost", 8765):
        print("VisionER bridge on ws://localhost:8765")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
