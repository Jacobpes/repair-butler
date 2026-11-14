import type { Intake } from "@/lib/types";

export type Example = Intake & {
  id: string;
  label: string;
  blurb: string;
};

export const EXAMPLES: Example[] = [
  {
    id: "siemens-hmi",
    label: "Siemens TP177B",
    blurb: "Black screen",
    manufacturer: "Siemens",
    partNumber: "6AV6643-0CD01-1AX1",
    symptom:
      "TP177B 6 inch color PN/DP HMI. Black screen, backlight dead. The unit powers on but the display stays dark.",
    country: "FI",
    urgency: "emergency",
  },
  {
    id: "ab-plc",
    label: "Allen-Bradley 1756-L71",
    blurb: "Controller fault",
    manufacturer: "Allen-Bradley",
    partNumber: "1756-L71",
    symptom:
      "ControlLogix 5571 controller. OK LED is solid red, major fault, will not go to Run. A program backup is available.",
    country: "FI",
    urgency: "this-week",
  },
  {
    id: "yaskawa-drive",
    label: "Yaskawa V1000",
    blurb: "Overcurrent trip",
    manufacturer: "Yaskawa",
    partNumber: "CIMR-VU4A0018FAA",
    symptom:
      "V1000 frequency inverter. Trips on OC (overcurrent) at start and the fan is noisy. The motor meggered good.",
    country: "FI",
    urgency: "planned",
  },
];
