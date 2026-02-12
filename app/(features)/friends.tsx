import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
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
} from "../../src/lib/friendsDb";
import {
  createGuardianAssignment,
  ensureDirectConversation,
  listGuardianAssignments,
  revokeGuardianAssignment
} from "../../src/lib/messagingDb";
import { supabase } from "../../src/lib/supabase";

function profileLabel(profile?: PublicProfile) {
  if (!profile) return "Profil";
  const username = String(profile.username ?? "").trim();
  if (username) return username;
  const fullName = `${String(profile.first_name ?? "").trim()} ${String(profile.last_name ?? "").trim()}`.trim();
  if (fullName) return fullName;
  return `ID ${profile.public_id}`;
}

export default function FriendsScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [me, setMe] = useState<PublicProfile | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [requests, setRequests] = useState<FriendRequestWithProfiles[]>([]);
  const [activeGuardianIds, setActiveGuardianIds] = useState<string[]>([]);
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
    setMe(myProfile);
    setFriends(friendRows);
    setRequests(requestRows);
    const ownerGuardianIds = guardians
      .filter((row) => row.owner_user_id === userId && row.status === "active")
      .map((row) => row.guardian_user_id);
    setActiveGuardianIds(ownerGuardianIds);
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

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

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
  const friendIds = useMemo(
    () => new Set(friends.map((friend) => friend.friend_user_id)),
    [friends]
  );

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
    try {
      setBusyAction(`send-${targetUserId}`);
      setErrorMessage("");
      setSuccessMessage("");
      await sendFriendRequest(targetUserId);
      await refresh();
      setSuccessMessage("Demande d ami envoyee.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d envoyer la demande.");
    } finally {
      setBusyAction(null);
    }
  };

  const respondRequest = async (requestId: string, accept: boolean) => {
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
      setErrorMessage(error?.message ?? "Impossible d ouvrir la conversation.");
    } finally {
      setBusyAction(null);
    }
  };

  const toggleGuardian = async (friendUserId: string) => {
    const isGuardian = activeGuardianIds.includes(friendUserId);
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

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <View className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#FAD4A6] opacity-70" />
      <View className="absolute top-32 -left-28 h-72 w-72 rounded-full bg-[#BFE9D6] opacity-60" />
      <View className="absolute bottom-24 -right-32 h-72 w-72 rounded-full bg-[#C7DDF8] opacity-40" />

      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="mt-6 flex-row items-center justify-between">
          <TouchableOpacity
            className="rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
            onPress={() => router.back()}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">Retour</Text>
          </TouchableOpacity>
          <View className="rounded-full bg-[#111827] px-3 py-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">Amis</Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Reseau proches</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Ajoute des amis, demarre une discussion et choisis qui peut etre garant.
        </Text>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Mon identifiant</Text>
          <Text className="mt-2 text-2xl font-extrabold text-[#0F172A]">{me?.public_id ?? "..."}</Text>
          <Text className="mt-1 text-sm text-slate-600">
            Partage cet ID ou laisse tes proches te trouver avec ton pseudo.
          </Text>
          <TouchableOpacity
            className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
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
              {refreshing ? "Actualisation..." : "Actualiser"}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Rechercher un profil</Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Pseudo ou ID public"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
          />
          <TouchableOpacity
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
              {searchResults.map((profile) => {
                const alreadyFriend = friendIds.has(profile.user_id);
                const outgoingPending = outgoingTargetIds.has(profile.user_id);
                const disabled = alreadyFriend || outgoingPending || busyAction === `send-${profile.user_id}`;
                return (
                  <View key={`result-${profile.user_id}`} className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                    <Text className="text-sm font-semibold text-slate-900">{profileLabel(profile)}</Text>
                    <Text className="mt-1 text-xs text-slate-500">ID {profile.public_id}</Text>
                    <TouchableOpacity
                      className={`mt-3 rounded-xl px-3 py-2 ${disabled ? "bg-slate-300" : "bg-[#0F766E]"}`}
                      onPress={() => sendRequest(profile.user_id)}
                      disabled={disabled}
                    >
                      <Text className="text-center text-xs font-semibold text-white">
                        {alreadyFriend ? "Deja ami" : outgoingPending ? "Demande en attente" : "Envoyer une demande"}
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
              return (
                <View key={`friend-${friend.id}`} className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <Text className="text-sm font-semibold text-slate-900">{profileLabel(friend.profile)}</Text>
                  <Text className="mt-1 text-xs text-slate-500">
                    ID {friend.profile?.public_id ?? friend.friend_user_id.slice(0, 8)}
                  </Text>
                  <View className="mt-3 flex-row gap-2">
                    <TouchableOpacity
                      className={`flex-1 rounded-xl px-3 py-2 ${
                        busyAction === `chat-${friend.friend_user_id}` ? "bg-slate-300" : "bg-[#111827]"
                      }`}
                      onPress={() => openChat(friend.friend_user_id)}
                      disabled={Boolean(busyAction)}
                    >
                      <Text className="text-center text-xs font-semibold text-white">Discuter</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className={`flex-1 rounded-xl px-3 py-2 ${
                        isGuardian ? "bg-amber-200" : "bg-[#0F766E]"
                      }`}
                      onPress={() => toggleGuardian(friend.friend_user_id)}
                      disabled={Boolean(busyAction)}
                    >
                      <Text className={`text-center text-xs font-semibold ${isGuardian ? "text-amber-900" : "text-white"}`}>
                        {isGuardian ? "Retirer garant" : "Definir garant"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {errorMessage ? <Text className="mt-4 text-sm text-red-600">{errorMessage}</Text> : null}
        {successMessage ? <Text className="mt-4 text-sm text-emerald-600">{successMessage}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
