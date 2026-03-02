// Écran réseau social : demandes d'amis, garants, ping d'arrivée et accès carte des proches.
import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ensureMyPublicProfile,
  listFriendRequests,
  listFriends,
  respondToFriendRequest,
  searchPublicProfiles,
  sendFriendRequest,
  type FriendRequestWithProfiles,
  type FriendWithProfile,
  type PublicProfile
} from "../../src/lib/social/friendsDb";
import {
  createGuardianAssignment,
  ensureDirectConversation,
  listGuardianAssignments,
  requestGuardianWellbeingCheck,
  revokeGuardianAssignment,
  sendFriendWellbeingPing
} from "../../src/lib/social/messagingDb";
import {
  getFriendOnlineState,
  listFriendMapPresence,
  type FriendMapPresence
} from "../../src/lib/social/friendMap";
import { buildFriendInviteMessage } from "../../src/lib/social/friendInvite";
import { confirmAction } from "../../src/lib/privacy/confirmAction";
import { supabase } from "../../src/lib/core/supabase";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";

function profileLabel(profile?: PublicProfile) {
  if (!profile) return "Profil";
  const username = String(profile.username ?? "").trim();
  if (username) return username;
  const fullName = `${String(profile.first_name ?? "").trim()} ${String(profile.last_name ?? "").trim()}`.trim();
  if (fullName) return fullName;
  return `ID ${profile.public_id}`;
}

function formatLastSeen(value?: string | null): string {
  if (!value) return "jamais";
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month} ${hours}:${minutes}`;
}

export default function FriendsScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [me, setMe] = useState<PublicProfile | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [requestMessage, setRequestMessage] = useState("Salut, on se connecte sur SafeBack ?");
  const [inviteNote, setInviteNote] = useState("");
  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [requests, setRequests] = useState<FriendRequestWithProfiles[]>([]);
  const [activeGuardianIds, setActiveGuardianIds] = useState<string[]>([]);
  const [ownersWhoAssignedMe, setOwnersWhoAssignedMe] = useState<string[]>([]);
  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, FriendMapPresence>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const refresh = async () => {
    const [myProfile, friendRows, requestRows, guardians] = await Promise.all([
      ensureMyPublicProfile(),
      listFriends(),
      listFriendRequests(),
      listGuardianAssignments()
    ]);

    const presenceRows = await listFriendMapPresence(friendRows.map((row) => row.friend_user_id));
    const nextPresenceById: Record<string, FriendMapPresence> = {};
    for (const row of presenceRows) {
      nextPresenceById[row.user_id] = row;
    }

    setMe(myProfile);
    setFriends(friendRows);
    setRequests(requestRows);
    setPresenceByUserId(nextPresenceById);

    const ownerGuardianIds = guardians
      .filter((row) => row.owner_user_id === userId && row.status === "active")
      .map((row) => row.guardian_user_id);
    setActiveGuardianIds(ownerGuardianIds);

    const guardianOwnerIds = guardians
      .filter((row) => row.guardian_user_id === userId && row.status === "active")
      .map((row) => row.owner_user_id);
    setOwnersWhoAssignedMe([...new Set(guardianOwnerIds)]);
  };

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setLoading(true);
        setErrorMessage("");
        await refresh();
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement des amis.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const shouldRedirectToAuth = !checking && !userId;

  const incomingRequests = useMemo(
    () => requests.filter((request) => request.direction === "incoming"),
    [requests]
  );

  const outgoingTargetIds = useMemo(
    () =>
      new Set(
        requests
          .filter((request) => request.direction === "outgoing")
          .map((request) => request.target_user_id)
      ),
    [requests]
  );

  const friendIds = useMemo(() => new Set(friends.map((friend) => friend.friend_user_id)), [friends]);

  const onSearch = async () => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }
    try {
      setSearching(true);
      setErrorMessage("");
      const rows = await searchPublicProfiles(query, 20);
      setSearchResults(rows);
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible de lancer la recherche.");
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async (targetUserId: string) => {
    const confirmed = await confirmAction({
      title: "Envoyer cette demande d'ami ?",
      message:
        "Ton profil public et ton message seront visibles par cette personne. Tu confirmes l'envoi ?",
      confirmLabel: "Envoyer"
    });
    if (!confirmed) return;

    try {
      setBusyAction(`send-${targetUserId}`);
      setErrorMessage("");
      setSuccessMessage("");

      const normalizedMessage = requestMessage.trim();
      await sendFriendRequest(targetUserId, normalizedMessage ? normalizedMessage : undefined);
      await refresh();
      setSuccessMessage("Demande d'ami envoyée.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d'envoyér la demande.");
    } finally {
      setBusyAction(null);
    }
  };

  const shareMyProfile = async () => {
    const confirmed = await confirmAction({
      title: "Partager ton identifiant ?",
      message:
        "Le message peut etre transmis hors de l'application. Vérifie que tu fais confiance au destinataire.",
      confirmLabel: "Partager"
    });
    if (!confirmed) return;

    try {
      setBusyAction("share-id");
      setErrorMessage("");
      const message = buildFriendInviteMessage({
        publicId: me?.public_id ?? "",
        note: inviteNote
      });
      await Share.share({
        title: "Invitation SafeBack",
        message
      });
      setSuccessMessage("Message de partage pret et envoyé.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d'ouvrir le partage.");
    } finally {
      setBusyAction(null);
    }
  };

  const respondRequest = async (requestId: string, accept: boolean) => {
    const confirmed = await confirmAction({
      title: accept ? "Accepter cette demande ?" : "Refuser cette demande ?",
      message: accept
        ? "Cette personne deviendra ton ami et pourra te contacter plus rapidement."
        : "La demande sera refusee. Tu pourras toujours la rechercher plus tard.",
      confirmLabel: accept ? "Accepter" : "Refuser"
    });
    if (!confirmed) return;

    try {
      setBusyAction(`${accept ? "accept" : "reject"}-${requestId}`);
      setErrorMessage("");
      setSuccessMessage("");
      await respondToFriendRequest({ requestId, accept, autoOpenConversation: accept });
      await refresh();
      setSuccessMessage(accept ? "Demande acceptee, conversation prete." : "Demande refusee.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible de traiter la demande.");
    } finally {
      setBusyAction(null);
    }
  };

  const openChat = async (otherUserId: string) => {
    try {
      setBusyAction(`chat-${otherUserId}`);
      setErrorMessage("");
      await ensureDirectConversation(otherUserId);
      router.push("/messages");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d'ouvrir la conversation.");
    } finally {
      setBusyAction(null);
    }
  };

  const toggleGuardian = async (friendUserId: string) => {
    const isGuardian = activeGuardianIds.includes(friendUserId);
    const confirmed = await confirmAction({
      title: isGuardian ? "Retirer ce garant ?" : "Definir ce garant ?",
      message: isGuardian
        ? "Ce proche ne recevra plus tes alertes de trajet."
        : "Ce proche recevra tes infos de sécurité (depart, retards, SOS).",
      confirmLabel: isGuardian ? "Retirer" : "Definir"
    });
    if (!confirmed) return;

    try {
      setBusyAction(`guardian-${friendUserId}`);
      setErrorMessage("");
      setSuccessMessage("");
      if (isGuardian) {
        await revokeGuardianAssignment(friendUserId);
      } else {
        await createGuardianAssignment(friendUserId);
      }
      await refresh();
      setSuccessMessage(isGuardian ? "Garant retire." : "Garant ajoute pour tes trajets.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible de mettre a jour le garant.");
    } finally {
      setBusyAction(null);
    }
  };

  const requestCheck = async (ownerUserId: string) => {
    const confirmed = await confirmAction({
      title: "Envoyer une vérification ?",
      message: "SafeBack enverra une demande de confirmation rapide a ce proche.",
      confirmLabel: "Envoyer"
    });
    if (!confirmed) return;

    try {
      setBusyAction(`check-${ownerUserId}`);
      setErrorMessage("");
      setSuccessMessage("");
      const result = await requestGuardianWellbeingCheck(ownerUserId);
      if (result.status === "disabled") {
        setSuccessMessage("Ce proche a désactive cette fonctionnalite.");
        return;
      }
      if (result.status === "not_guardian") {
        setErrorMessage("Tu n'es pas configure comme garant actif pour ce proche.");
        return;
      }
      setSuccessMessage(
        result.has_recent_trip_24h
          ? "Demande envoyée. Un trajet recent existe déjà."
          : "Demande envoyée. Aucun trajet recent detecte."
      );
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d'envoyér la demande.");
    } finally {
      setBusyAction(null);
    }
  };

  const pingArrival = async (friendUserId: string) => {
    const confirmed = await confirmAction({
      title: "Lancer le ping d'arrivée ?",
      message:
        "Ton proche recevra une notification avec reponse Oui/Non. Tu seras informe automatiquement.",
      confirmLabel: "Envoyer"
    });
    if (!confirmed) return;

    try {
      setBusyAction(`ping-${friendUserId}`);
      setErrorMessage("");
      setSuccessMessage("");
      const result = await sendFriendWellbeingPing(friendUserId);
      if (result.status === "already_pending") {
        setSuccessMessage("Une vérification est déjà en attente pour ce proche.");
        return;
      }
      setSuccessMessage("Demande de reassurance envoyée en 1 clic.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d'envoyér le ping d'arrivée.");
    } finally {
      setBusyAction(null);
    }
  };

  const ownerAsGuardianSet = useMemo(() => new Set(ownersWhoAssignedMe), [ownersWhoAssignedMe]);

  if (shouldRedirectToAuth) {
    return <Redirect href="/auth" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <View className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#FAD4A6] opacity-70" />
      <View className="absolute top-32 -left-28 h-72 w-72 rounded-full bg-[#BFE9D6] opacity-60" />
      <View className="absolute bottom-24 -right-32 h-72 w-72 rounded-full bg-[#C7DDF8] opacity-40" />

      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="mt-6 flex-row items-center justify-between">
          <TouchableOpacity
            testID="friends-back-button"
            className="h-9 rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
            onPress={() => router.back()}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">Retour</Text>
          </TouchableOpacity>
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              testID="friends-open-map-button"
              className="h-9 justify-center rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
              onPress={() => router.push("/friends-map")}
            >
              <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">Carte live</Text>
            </TouchableOpacity>
            <View className="h-9 items-center justify-center rounded-full bg-[#111827] px-3">
              <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">Amis</Text>
            </View>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Reseau proches</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Ajoute des amis, discute, active tes garants et fais une vérification'arrivée en 1 clic.
        </Text>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Mon identifiant premium</Text>
          <Text className="mt-2 text-2xl font-extrabold text-[#0F172A]">{me?.public_id ?? "..."}</Text>
          <Text className="mt-1 text-sm text-slate-600">
            Envoie une invitation lisible avec ton ID + mode d'emploi, plutot qu'un texte brut.
          </Text>

          <View className="mt-3 rounded-2xl border border-[#E7E0D7] bg-[#F8FAFC] px-4 py-3">
            <Text className="text-xs uppercase tracking-widest text-slate-500">Apercu message</Text>
            <Text className="mt-2 text-sm text-slate-700">
              {buildFriendInviteMessage({
                publicId: me?.public_id ?? "",
                note: inviteNote
              })}
            </Text>
          </View>

          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
            value={inviteNote}
            onChangeText={setInviteNote}
            placeholder="Ajoute une phrase perso (optionnel)"
            placeholderTextColor="#94a3b8"
            maxLength={120}
          />

          <View className="mt-3 flex-row gap-2">
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-4 py-3 ${busyAction === "share-id" ? "bg-slate-300" : "bg-[#0F766E]"}`}
              onPress={shareMyProfile}
              disabled={Boolean(busyAction)}
            >
              <Text className="text-center text-sm font-semibold text-white">Partager mon ID</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              onPress={async () => {
                try {
                  setRefreshing(true);
                  await refresh();
                } finally {
                  setRefreshing(false);
                }
              }}
              disabled={refreshing || loading}
            >
              <Text className="text-center text-sm font-semibold text-slate-700">
                {refreshing ? "..." : "Actualiser"}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            className="mt-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3"
            onPress={() => router.push("/scan-friend-qr")}
          >
            <Text className="text-center text-sm font-semibold text-cyan-800">
              Scanner un QR ami (caméra/photos)
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Rechercher un profil</Text>
          <TextInput
            testID="friends-search-input"
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Pseudo ou ID public"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
          />
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
            value={requestMessage}
            onChangeText={setRequestMessage}
            placeholder="Message avec la demande d'ami"
            placeholderTextColor="#94a3b8"
            maxLength={120}
          />
          <TouchableOpacity
            testID="friends-search-button"
            className={`mt-3 rounded-2xl px-4 py-3 ${
              searchQuery.trim().length > 0 && !searching ? "bg-[#111827]" : "bg-slate-300"
            }`}
            onPress={onSearch}
            disabled={!searchQuery.trim() || searching}
          >
            <Text className="text-center text-sm font-semibold text-white">
              {searching ? "Recherche..." : "Lancer la recherche"}
            </Text>
          </TouchableOpacity>

          {searchResults.length > 0 ? (
            <View className="mt-3">
              {searchResults.map((profile, index) => {
                const alreadyFriend = friendIds.has(profile.user_id);
                const outgoingPending = outgoingTargetIds.has(profile.user_id);
                const disabled = alreadyFriend || outgoingPending || busyAction === `send-${profile.user_id}`;
                return (
                  <View key={`result-${profile.user_id}`} className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                    <Text className="text-sm font-semibold text-slate-900">{profileLabel(profile)}</Text>
                    <Text className="mt-1 text-xs text-slate-500">ID {profile.public_id}</Text>
                    <TouchableOpacity
                      testID={`friends-send-request-${index}`}
                      className={`mt-3 rounded-xl px-3 py-2 ${disabled ? "bg-slate-300" : "bg-[#0F766E]"}`}
                      onPress={() => sendRequest(profile.user_id)}
                      disabled={disabled}
                    >
                      <Text className="text-center text-xs font-semibold text-white">
                        {alreadyFriend ? "Déjà ami" : outgoingPending ? "Demande en attente" : "Envoyer une demande"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Demandes recues</Text>
          {loading ? (
            <View className="mt-4 flex-row items-center">
              <ActivityIndicator size="small" color="#334155" />
              <Text className="ml-2 text-sm text-slate-600">Chargement...</Text>
            </View>
          ) : incomingRequests.length === 0 ? (
            <Text className="mt-3 text-sm text-slate-500">Aucune demande en attente.</Text>
          ) : (
            incomingRequests.map((request) => (
              <View key={`request-${request.id}`} className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                <Text className="text-sm font-semibold text-slate-900">{profileLabel(request.requesterProfile)}</Text>
                <Text className="mt-1 text-xs text-slate-500">
                  ID {request.requesterProfile?.public_id ?? request.requester_user_id.slice(0, 8)}
                </Text>
                <View className="mt-3 flex-row gap-2">
                  <TouchableOpacity
                    className={`flex-1 rounded-xl px-3 py-2 ${
                      busyAction === `accept-${request.id}` ? "bg-slate-300" : "bg-emerald-600"
                    }`}
                    onPress={() => respondRequest(request.id, true)}
                    disabled={Boolean(busyAction)}
                  >
                    <Text className="text-center text-xs font-semibold text-white">Accepter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className={`flex-1 rounded-xl border border-slate-200 px-3 py-2 ${
                      busyAction === `reject-${request.id}` ? "bg-slate-200" : "bg-white"
                    }`}
                    onPress={() => respondRequest(request.id, false)}
                    disabled={Boolean(busyAction)}
                  >
                    <Text className="text-center text-xs font-semibold text-slate-700">Refuser</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Mes amis</Text>
          {loading ? (
            <View className="mt-4 flex-row items-center">
              <ActivityIndicator size="small" color="#334155" />
              <Text className="ml-2 text-sm text-slate-600">Chargement...</Text>
            </View>
          ) : friends.length === 0 ? (
            <Text className="mt-3 text-sm text-slate-500">Aucun ami pour le moment.</Text>
          ) : (
            friends.map((friend) => {
              const isGuardian = activeGuardianIds.includes(friend.friend_user_id);
              const canAskForCheck = ownerAsGuardianSet.has(friend.friend_user_id);
              const presence = presenceByUserId[friend.friend_user_id];
              const onlineState = getFriendOnlineState({
                network_connected: presence?.network_connected,
                updated_at: presence?.updated_at
              });
              const tone =
                onlineState === "online"
                  ? "bg-emerald-50 text-emerald-700"
                  : onlineState === "recently_offline"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-slate-100 text-slate-700";
              const stateLabel =
                onlineState === "online"
                  ? "En ligne"
                  : onlineState === "recently_offline"
                    ? "Connexion recente"
                    : "Hors ligne";

              return (
                <View key={`friend-${friend.id}`} className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-slate-900">{profileLabel(friend.profile)}</Text>
                    <View className={`rounded-full px-3 py-1 ${tone}`}>
                      <Text className="text-[11px] font-semibold uppercase tracking-wider">{stateLabel}</Text>
                    </View>
                  </View>
                  <Text className="mt-1 text-xs text-slate-500">
                    ID {friend.profile?.public_id ?? friend.friend_user_id.slice(0, 8)}
                  </Text>
                  <Text className="mt-1 text-xs text-slate-500">
                    Derniere activite: {formatLastSeen(presence?.updated_at)}
                  </Text>

                  <View className="mt-3 flex-row gap-2">
                    <TouchableOpacity
                      testID={`friends-chat-${friend.friend_user_id}`}
                      className={`flex-1 rounded-xl px-3 py-2 ${
                        busyAction === `chat-${friend.friend_user_id}` ? "bg-slate-300" : "bg-[#111827]"
                      }`}
                      onPress={() => openChat(friend.friend_user_id)}
                      disabled={Boolean(busyAction)}
                    >
                      <Text className="text-center text-xs font-semibold text-white">Discuter</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`friends-toggle-guardian-${friend.friend_user_id}`}
                      className={`flex-1 rounded-xl px-3 py-2 ${isGuardian ? "bg-amber-200" : "bg-[#0F766E]"}`}
                      onPress={() => toggleGuardian(friend.friend_user_id)}
                      disabled={Boolean(busyAction)}
                    >
                      <Text className={`text-center text-xs font-semibold ${isGuardian ? "text-amber-900" : "text-white"}`}>
                        {isGuardian ? "Retirer garant" : "Definir garant"}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    testID={`friends-ping-arrival-${friend.friend_user_id}`}
                    className={`mt-2 rounded-xl px-3 py-2 ${
                      busyAction === `ping-${friend.friend_user_id}` ? "bg-slate-300" : "bg-[#0284C7]"
                    }`}
                    onPress={() => pingArrival(friend.friend_user_id)}
                    disabled={Boolean(busyAction)}
                  >
                    <Text className="text-center text-xs font-semibold text-white">Ping arrivée (1 clic)</Text>
                  </TouchableOpacity>

                  {canAskForCheck ? (
                    <TouchableOpacity
                      testID={`friends-request-check-${friend.friend_user_id}`}
                      className={`mt-2 rounded-xl px-3 py-2 ${
                        busyAction === `check-${friend.friend_user_id}` ? "bg-slate-300" : "bg-sky-600"
                      }`}
                      onPress={() => requestCheck(friend.friend_user_id)}
                      disabled={Boolean(busyAction)}
                    >
                      <Text className="text-center text-xs font-semibold text-white">
                        Demander s'il est bien rentré
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        {errorMessage ? <FeedbackMessage kind="error" message={errorMessage} /> : null}
        {successMessage ? <FeedbackMessage kind="success" message={successMessage} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
