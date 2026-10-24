import sys
import cv2
import mediapipe as mp

# Initialize MediaPipe Hands and the landmark drawing helpers.
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

# video mode, up to two hands; raise these if tracking flickers, lower if hands are missed.
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7,
)

# DirectShow is more reliable than the default MSMF backend on Windows.
backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
cap = cv2.VideoCapture(1, backend)

# Check if the video device is opened
if not cap.isOpened():
    print("Error: Could not open video device")
    sys.exit(1)

print("Press 'q' to close the webcam window")

# Main loop
while True: 

    # Read the frame from the video device
    ret, frame = cap.read()

    # Check if the frame is read successfully
    if not ret:
        print("Error: could not read frame")
        break

    # MediaPipe expects RGB; OpenCV captures BGR.
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    # Run hand detection and tracking on this frame.
    results = hands.process(rgb)

    # Draw 21 joint landmarks and bone connections for each detected hand.
    if results.multi_hand_landmarks:
        for hand_landmarks in results.multi_hand_landmarks:
            mp_drawing.draw_landmarks(
                frame,
                hand_landmarks,
                mp_hands.HAND_CONNECTIONS,
                mp_drawing_styles.get_default_hand_landmarks_style(),
                mp_drawing_styles.get_default_hand_connections_style(),
            )

    # Show the frame in a window
    cv2.imshow("Webcam Feed", frame)

    # Check if the user pressed the 'q' key
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

# Release the MediaPipe model, video device, and window
hands.close()
cap.release()
cv2.destroyAllWindows()
