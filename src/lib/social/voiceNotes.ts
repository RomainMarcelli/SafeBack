// Outils vocaux: enregistrement local + upload Supabase Storage pour lecture multi-appareils.
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { supabase } from "../core/supabase";

const VOICE_NOTES_BUCKET = "voice-notes";

export type VoiceDraft = {
  uri: string;
  durationMs: number;
};

async function requireUserId(): Promise<string> {
  const session = await supabase.auth.getSession();
  const userId = session.data.session?.user.id;
  if (!userId) throw new Error("Utilisateur non authentifié.");
  return userId;
}

export async function startVoiceRecording(): Promise<Audio.Recording> {
  const permission = await Audio.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Microphone refusé. Active la permission pour envoyer un vocal.");
  }

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false
  });

  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  await recording.startAsync();
  return recording;
}

export async function stopVoiceRecording(recording: Audio.Recording): Promise<VoiceDraft> {
  // Certains appareils remontent une durée à 0 après `stopAndUnloadAsync`.
  // On lit d'abord l'état avant l'arrêt pour conserver une durée fiable.
  const statusBeforeStop = await recording.getStatusAsync();
  await recording.stopAndUnloadAsync();
  const statusAfterStop = await recording.getStatusAsync();
  const uri = recording.getURI();
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false
  });
  if (!uri) {
    throw new Error("Enregistrement invalide. Réessaie.");
  }
  return {
    uri,
    durationMs:
      statusBeforeStop.durationMillis ??
      statusAfterStop.durationMillis ??
      0
  };
}

export async function uploadVoiceDraft(params: {
  uri: string;
  conversationId: string;
  durationMs: number;
}): Promise<{ voiceUrl: string; durationMs: number }> {
  const userId = await requireUserId();
  const extension = params.uri.split(".").pop()?.toLowerCase() || "m4a";
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const path = `${userId}/${params.conversationId}/${fileName}`;

  const response = await fetch(params.uri);
  const blob = await response.blob();

  const { error: uploadError } = await supabase.storage.from(VOICE_NOTES_BUCKET).upload(path, blob, {
    contentType: "audio/mp4",
    upsert: false
  });
  if (uploadError) {
    throw new Error(
      "Upload du vocal impossible. Vérifie la configuration Storage (bucket voice-notes)."
    );
  }

  const { data } = supabase.storage.from(VOICE_NOTES_BUCKET).getPublicUrl(path);
  const voiceUrl = String(data.publicUrl ?? "").trim();
  if (!voiceUrl) {
    throw new Error("URL du vocal introuvable après upload.");
  }
  return {
    voiceUrl,
    durationMs: Math.max(1, Math.round(params.durationMs))
  };
}
