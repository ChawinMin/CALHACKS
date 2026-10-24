import sys
import cv2

# DirectShow is more reliable than the default MSMF backend on Windows.
backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
cap = cv2.VideoCapture(1, backend)

if not cap.isOpened():
    print("Error: Could not open video device")
    sys.exit(1)

print("Press 'q' to close the webcam window")

while True:
    ret, frame = cap.read()

    if not ret:
        print("Error: could not read frame")
        break

    cv2.imshow("Webcam Feed", frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()
