import { upsertProfile } from "../core/db";
import { supabase } from "../core/supabase";

export type SignupProfilePayload = {
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
};

export async function signInWithCredentials(params: {
  identifier: string;
  password: string;
}): Promise<void> {
  // La stratégie d'auth actuelle utilise directement email/mot de passe.
  // Garder ce helper isolé facilite une future migration vers la recherche par pseudo.
  const email = params.identifier.trim();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: params.password
  });
  if (error) throw error;
}

export async function signUpAndMaybeCreateProfile(params: {
  email: string;
  password: string;
  profile: SignupProfilePayload;
}): Promise<void> {
  const { data, error } = await supabase.auth.signUp({
    email: params.email.trim(),
    password: params.password
  });
  if (error) throw error;

  // Supabase peut renvoyér un utilisateur sans session quand la confirmation email est activée.
  // Dans ce cas, on ignore l'upsert du profil pour éviter les erreurs RLS liées à auth.uid().
  if (!data.session?.user?.id) {
    return;
  }

  await upsertProfile({
    username: params.profile.username?.trim() || null,
    first_name: params.profile.first_name?.trim() || null,
    last_name: params.profile.last_name?.trim() || null,
    phone: params.profile.phone?.trim() || null
  });
}
