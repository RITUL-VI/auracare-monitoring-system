import { supabase } from "@/integrations/supabase/client";

export const EMERGENCY_CONTACT = {
  phone: "6260826042",
  email: "ritulvijayvargiya@gmail.com",
} as const;

export const ALERT_COPY = {
  tachycardia: "CRITICAL ALERT: Tachycardia Detected",
  bradypnea: "CRITICAL ALERT: Respiratory Depression Detected",
  distress: "CRITICAL ALERT: Patient Distress Signature Detected",
} as const;

export type AlertType = keyof typeof ALERT_COPY;

export type DispatchedAlert = {
  id: string;
  bed: string;
  alert_type: string;
  message: string;
  heart_rate: number | null;
  respiration_rate: number | null;
  signal_confidence: number | null;
  notified_phone: string | null;
  notified_email: string | null;
  dispatched_at: string;
};

export function alertSummary(kind: AlertType, bed: string, hr: number, rr: number) {
  return `${ALERT_COPY[kind]} | ${bed} | HR ${hr} bpm | RR ${rr.toFixed(0)} br/min`;
}

export async function saveDispatchedAlert(input: {
  bed: string;
  kind: AlertType;
  hr: number;
  rr: number;
  confidence: number;
}) {
  const { error } = await supabase.from("alerts").insert({
    bed: input.bed,
    alert_type: input.kind,
    message: alertSummary(input.kind, input.bed, input.hr, input.rr),
    heart_rate: input.hr,
    respiration_rate: input.rr,
    signal_confidence: input.confidence,
    notified_phone: EMERGENCY_CONTACT.phone,
    notified_email: EMERGENCY_CONTACT.email,
  });
  if (error) throw error;
}

export async function fetchDispatchedAlerts(): Promise<DispatchedAlert[]> {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .order("dispatched_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as DispatchedAlert[];
}
