// Types applicatifs partagés pour structurer les données persistées côté base.
export type FavoriteAddress = {
  id: string;
  label: string;
  address: string;
  created_at?: string;
};

export type Contact = {
  id: string;
  name: string;
  channel: "sms" | "whatsapp" | "call";
  phone?: string;
  email?: string | null;
  contact_group?: "family" | "colleagues" | "friends" | null;
  created_at?: string;
};

export type Session = {
  id: string;
  from_address: string;
  to_address: string;
  expected_arrival_time?: string;
  share_live?: boolean;
  share_token?: string | null;
  created_at?: string;
};

export type LocationPoint = {
  id: string;
  session_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  recorded_at?: string;
};

export type Profile = {
  user_id: string;
  public_id?: string | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  allow_guardian_check_requests?: boolean | null;
  map_share_enabled?: boolean | null;
  map_avatar?: string | null;
  consent_location?: boolean | null;
  consent_presence?: boolean | null;
  consent_notifications?: boolean | null;
  consent_live_share?: boolean | null;
  consent_updated_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type IncidentReport = {
  id: string;
  user_id: string;
  session_id?: string | null;
  incident_type: "sos" | "delay" | "other";
  severity: "low" | "medium" | "high";
  occurred_at: string;
  location_label?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  details: string;
  created_at?: string;
  updated_at?: string;
};
