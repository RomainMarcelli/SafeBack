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
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  created_at?: string;
  updated_at?: string;
};
