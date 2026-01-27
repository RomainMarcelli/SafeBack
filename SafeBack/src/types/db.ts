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
  created_at?: string;
};
