import { supabase } from "./supabase";
import type { Contact, FavoriteAddress, LocationPoint, Profile, Session } from "../types/db";

export async function listFavoriteAddresses(): Promise<FavoriteAddress[]> {
  const { data, error } = await supabase
    .from("favorite_addresses")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as FavoriteAddress[];
}

export async function listContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Contact[];
}

export async function getProfile(): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function upsertProfile(payload: {
  user_id?: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
}): Promise<Profile> {
  const session = await supabase.auth.getSession();
  const userId = payload.user_id ?? session.data.session?.user.id;
  if (!userId) {
    throw new Error("Utilisateur non authentifie.");
  }
  const { data, error } = await supabase
    .from("profiles")
    .upsert({
      user_id: userId,
      ...payload,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();
  if (error) throw error;
  return data as Profile;
}

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

export async function deleteFavoriteAddress(id: string) {
  const { error } = await supabase.from("favorite_addresses").delete().eq("id", id);
  if (error) throw error;
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

export async function deleteContact(id: string) {
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) throw error;
}

export async function createSessionWithContacts(payload: {
  from_address: string;
  to_address: string;
  contactIds: string[];
  expected_arrival_time?: string | null;
}): Promise<Session> {
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      from_address: payload.from_address,
      to_address: payload.to_address,
      expected_arrival_time: payload.expected_arrival_time ?? null
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

export async function getSessionById(id: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Session | null;
}

export async function listSessions(): Promise<Session[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Session[];
}

export async function deleteAllSessions() {
  const { error } = await supabase.from("sessions").delete().neq("id", "");
  if (error) throw error;
}

export async function deleteSession(id: string) {
  const { error } = await supabase.from("sessions").delete().eq("id", id);
  if (error) throw error;
}

export async function insertLocationPoint(payload: {
  session_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}): Promise<LocationPoint> {
  const { data, error } = await supabase
    .from("locations")
    .insert({
      session_id: payload.session_id,
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracy: payload.accuracy ?? null
    })
    .select()
    .single();
  if (error) throw error;
  return data as LocationPoint;
}
