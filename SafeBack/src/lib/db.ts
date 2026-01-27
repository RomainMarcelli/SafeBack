import { supabase } from "./supabase";
import type { Contact, FavoriteAddress, Session } from "../types/db";

export async function createFavoriteAddress(payload: {
  label: string;
  address: string;
}): Promise<FavoriteAddress> {
  const { data, error } = await supabase
    .from("favorite_addresses")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data as FavoriteAddress;
}

export async function createContact(payload: {
  name: string;
  channel: Contact["channel"];
  phone?: string;
}): Promise<Contact> {
  const { data, error } = await supabase
    .from("contacts")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data as Contact;
}

export async function createSessionWithContacts(payload: {
  from_address: string;
  to_address: string;
  contactIds: string[];
}): Promise<Session> {
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      from_address: payload.from_address,
      to_address: payload.to_address
    })
    .select()
    .single();

  if (error) throw error;

  if (payload.contactIds.length > 0) {
    const links = payload.contactIds.map((contactId) => ({
      session_id: data.id,
      contact_id: contactId
    }));
    const { error: linkError } = await supabase
      .from("session_contacts")
      .insert(links);
    if (linkError) throw linkError;
  }

  return data as Session;
}
