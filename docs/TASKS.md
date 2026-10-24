# Task Board

Claim a task by putting your name in **Owner**. Tick items when merged to `main`.

## Phase 1 – Core MVP

### Task 1: Computer Vision — Owner: _TBD_
- [ ] Set up webcam using OpenCV
- [ ] Implement human body detection and pose estimation
- [ ] Implement hand and finger tracking using MediaPipe
- [ ] Detect visible injuries and emergency-related objects
- [ ] Track user movements during first-aid procedures
- [ ] Develop real-time visual feedback

### Task 2: AI & Emergency Classification — Owner: _TBD_
- [ ] Integrate an AI model for understanding user descriptions
- [ ] Develop emergency scenario classification using reported symptoms and observations
- [ ] Create predefined, medically reviewed emergency response protocols
- [ ] Implement a decision-making workflow for selecting appropriate instructions
- [ ] Handle uncertain predictions and unknown emergency scenarios
- [ ] Prioritize emergency calls and dispatcher instructions

### Task 3: Voice Assistant — Owner: _TBD_
- [ ] Implement speech-to-text recognition
- [ ] Integrate text-to-speech for verbal instructions
- [ ] Enable hands-free voice commands
- [ ] Allow users to ask questions during procedures
- [ ] Develop real-time verbal feedback

### Task 5: Emergency Procedure Guidance — Owner: _TBD_
*(Start with CPR for the MVP.)*
- [ ] Develop CPR training workflow
- [ ] Develop severe bleeding response workflow
- [ ] Develop stroke warning-sign assessment workflow
- [ ] Develop choking response workflow
- [ ] Develop seizure first-aid workflow
- [ ] Develop allergic reaction response workflow
- [ ] Implement step-by-step visual and verbal guidance
- [ ] Track observable procedural actions and request user confirmation when needed

## Phase 2 – Hardware Integration

### Task 4: Hardware & Biomedical Sensors — Owner: _TBD_
- [ ] Set up ESP32 microcontroller
- [ ] Connect MPU6050 accelerometer and gyroscope
- [ ] Integrate experimental heartbeat detection module
- [ ] Transmit sensor data to Python
- [ ] Synchronize sensor readings with computer vision
- [ ] Develop a live sensor monitoring dashboard

### Task 7: System Integration — Owner: _TBD_
- [ ] Connect computer vision to the AI workflow engine
- [ ] Integrate voice assistant with emergency protocols
- [ ] Connect ESP32 sensors to the main application
- [ ] Synchronize camera, audio, and sensor inputs
- [ ] Implement offline fallback instructions
- [ ] Ensure AI cannot override medically reviewed safety procedures

## Phase 3 – Final Application

### Task 6: User Interface — Owner: _TBD_
- [ ] Create an emergency activation button
- [ ] Display real-time camera footage
- [ ] Display AI observations and workflow status
- [ ] Show step-by-step emergency instructions
- [ ] Implement visual and audio feedback
- [ ] Display timers and relevant sensor readings
- [ ] Create an emergency handoff summary

### Task 8: Testing & Validation — Owner: _All_
- [ ] Test body and hand tracking accuracy
- [ ] Test voice recognition in noisy environments
- [ ] Test CPR movements using a training mannequin
- [ ] Test simulated emergency scenarios
- [ ] Evaluate AI response latency
- [ ] Test missing sensors and camera failures
- [ ] Verify emergency escalation and safety behavior
- [ ] Prepare the final demonstration
