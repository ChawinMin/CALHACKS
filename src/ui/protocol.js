// VisionER guide content.
// Steps follow AHA lay-rescuer and Stop the Bleed guidance. NOT clinician-reviewed yet:
// medical review is the first step after the hackathon (see protocols/README.md).

window.VISIONER_DATA = window.VISIONER_DATA || {};

// Every emergency the product targets. Only `limb-bleeding` is functional at Cal Hacks.
window.VISIONER_DATA.EMERGENCIES = [
  {
    id: "limb-bleeding",
    title: "Severe bleeding",
    sub: "Limb wound · gauze",
    shows: "Where the source is, where to press, how long to hold",
    supplies: ["Gloves", "Gauze", "Trauma pad"],
    live: true,
  },
  {
    id: "cpr",
    title: "Cardiac arrest",
    sub: "CPR",
    shows: "Hand placement, 100–120/min beat, compression count",
    supplies: ["Gloves", "Face shield"],
  },
  {
    id: "aed",
    title: "AED use",
    sub: "Defibrillator",
    shows: "Pad placement, stand clear, resume CPR",
    supplies: ["AED", "Pads"],
  },
  {
    id: "tourniquet",
    title: "Tourniquet",
    sub: "Life-threatening limb bleed",
    shows: "Placement 2–3 in above wound, tightening, time applied",
    supplies: ["Tourniquet"],
  },
  {
    id: "deep-wound",
    title: "Gunshot / deep wound",
    sub: "Wound packing",
    shows: "Which wounds to pack vs press, 3-minute hold",
    supplies: ["Packing gauze"],
  },
  {
    id: "minor-wound",
    title: "Minor wound",
    sub: "Cleaning & dressing",
    shows: "Rinsing, keeping alcohol off the cut, dressing",
    supplies: ["Gauze", "Ointment", "Bandage"],
  },
  {
    id: "overdose",
    title: "Opioid overdose",
    sub: "Naloxone",
    shows: "Signs to check, nostril placement, second dose",
    supplies: ["Naloxone spray"],
  },
];

// Kit items VisionER recognises as the wearer picks them up.
window.VISIONER_DATA.KIT = [
  { id: "gloves", label: "Gloves" },
  { id: "gauze", label: "Gauze" },
  { id: "trauma_pad", label: "Trauma pad" },
  { id: "bandage", label: "Bandage" },
];

// The Cal Hacks demo procedure. `overlay` picks the hologram drawn on the target.
// `advanceOn` is a human-readable note shown in the operator console.
window.VISIONER_DATA.LIMB_BLEEDING = {
  id: "limb-bleeding",
  title: "Control bleeding · limb wound",
  holdSeconds: 180,
  steps: [
    {
      id: "gloves-911",
      title: "Put on gloves. Call 911.",
      detail: "Grab gloves from the kit. Call 911 on speaker, or point at someone and say “You, call 911.”",
      speak: "Put on gloves from the kit. Call 9 1 1 now, or point at someone and tell them to call.",
      overlay: "none",
      advanceOn: "gloves detected + 911 confirmed",
    },
    {
      id: "find-wound",
      title: "Find the wound.",
      detail: "Expose the injured arm or leg and look straight at it. Hold still while VisionER locks on.",
      speak: "Expose the injured limb and look straight at it. Hold still while I find the source of the bleeding.",
      overlay: "scan",
      advanceOn: "wound target locked",
    },
    {
      id: "place-gauze",
      title: "Place gauze on the wound.",
      detail: "Put the pad directly on the bleeding, covering all of it. Use the trauma pad if the wound is bigger.",
      speak: "Place the gauze directly on the wound, where the outline shows. Cover all of it.",
      overlay: "gauze",
      advanceOn: "gauze detected on wound",
    },
    {
      id: "press-hold",
      title: "Press hard. Hold.",
      detail: "Both hands on the gauze, arms straight, lean your body weight in. Hold for at least 3 minutes.",
      speak: "Press down hard with both hands and lean in. Hold for at least three minutes. Do not lift the gauze to check.",
      overlay: "press",
      warning: "Don’t lift the gauze to check. Keep pressing.",
      advanceOn: "3:00 held",
    },
    {
      id: "wrap",
      title: "Wrap with a bandage.",
      detail: "Wrap tightly over the gauze to keep pressure on. Don’t remove the gauze underneath.",
      speak: "Wrap the bandage tightly over the gauze to keep the pressure on. Do not remove the gauze.",
      overlay: "wrap",
      advanceOn: "bandage detected",
    },
  ],
  // Branches that temporarily replace the current instruction.
  soak: {
    title: "Blood soaking through.",
    detail: "Add new gauze on top. Don’t remove the first layer. Keep pressing.",
    speak: "Blood is soaking through. Add more gauze on top. Do not remove the first layer. Keep pressing.",
  },
  released: {
    speak: "Keep pressing. Do not lift to check.",
  },
  stay: {
    title: "Stay with them.",
    detail: "Keep them warm and still. If blood soaks through the bandage, press on top. Wait for EMS.",
    speak: "Good. Stay with the person and keep them warm until E M S arrives. If blood soaks through, press on top.",
  },
  holdDone: {
    speak: "Three minutes held. Keep pressure on and get the bandage ready.",
  },
};
