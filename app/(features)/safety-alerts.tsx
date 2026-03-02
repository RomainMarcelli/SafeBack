import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { Modal, ScrollView, Switch, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getProfile, upsertProfile } from "../../src/lib/core/db";
import {
  DEFAULT_SAFETY_ESCALATION_CONFIG,
  formatSafetyDelay,
  getSafetyEscalationConfig,
  resetSafetyEscalationConfig,
  SAFETY_ESCALATION_MODES,
  SAFETY_STAGE_ONE_OPTIONS,
  SAFETY_STAGE_THREE_OPTIONS,
  SAFETY_STAGE_TWO_OPTIONS,
  type SafetyEscalationMode,
  setSafetyEscalationConfig
} from "../../src/lib/safety/safetyEscalation";
import {
  getOnboardingAssistantSession,
  getNextOnboardingStepId,
  getOnboardingStepRoute,
  markOnboardingManualStep,
  setOnboardingAssistantStep
} from "../../src/lib/home/onboarding";
import { confirmAction, confirmSensitiveAction } from "../../src/lib/privacy/confirmAction";
import { logPrivacyEvent } from "../../src/lib/privacy/privacyCenter";
import { supabase } from "../../src/lib/core/supabase";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";

const STAGE_MODE_LABELS: Record<SafetyEscalationMode, string> = {
  in_app: "In-app",
  push: "Push",
  sms: "SMS"
};

const SECURE_ARRIVAL_MIN_TRIP_OPTIONS = [0, 2, 3, 5, 10] as const;

export default function SafetyAlertsScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(DEFAULT_SAFETY_ESCALATION_CONFIG.enabled);
  const [stageOneDelayMinutes, setStageOneDelayMinutes] = useState(
    DEFAULT_SAFETY_ESCALATION_CONFIG.stageOneDelayMinutes
  );
  const [stageTwoDelayMinutes, setStageTwoDelayMinutes] = useState(
    DEFAULT_SAFETY_ESCALATION_CONFIG.stageTwoDelayMinutes
  );
  const [stageThreeDelayMinutes, setStageThreeDelayMinutes] = useState(
    DEFAULT_SAFETY_ESCALATION_CONFIG.stageThreeDelayMinutes
  );
  const [stageOneMode, setStageOneMode] = useState<SafetyEscalationMode>(
    DEFAULT_SAFETY_ESCALATION_CONFIG.stageOneMode
  );
  const [stageTwoMode, setStageTwoMode] = useState<SafetyEscalationMode>(
    DEFAULT_SAFETY_ESCALATION_CONFIG.stageTwoMode
  );
  const [stageThreeMode, setStageThreeMode] = useState<SafetyEscalationMode>(
    DEFAULT_SAFETY_ESCALATION_CONFIG.stageThreeMode
  );

  const [secureArrivalEnabled, setSecureArrivalEnabled] = useState(
    DEFAULT_SAFETY_ESCALATION_CONFIG.secureArrivalEnabled
  );
  const [secureArrivalRequireLocation, setSecureArrivalRequireLocation] = useState(
    DEFAULT_SAFETY_ESCALATION_CONFIG.secureArrivalRequireLocation
  );
  const [secureArrivalRequireCharging, setSecureArrivalRequireCharging] = useState(
    DEFAULT_SAFETY_ESCALATION_CONFIG.secureArrivalRequireCharging
  );
  const [secureArrivalMinTripMinutes, setSecureArrivalMinTripMinutes] = useState(
    DEFAULT_SAFETY_ESCALATION_CONFIG.secureArrivalMinTripMinutes
  );

  const [allowGuardianCheckRequests, setAllowGuardianCheckRequests] = useState(false);

  const [initialEnabled, setInitialEnabled] = useState(DEFAULT_SAFETY_ESCALATION_CONFIG.enabled);
  const [initialGuardianChecks, setInitialGuardianChecks] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [guideActive, setGuideActive] = useState(false);
  const [showGuideHint, setShowGuideHint] = useState(false);
  const [guideTransitioning, setGuideTransitioning] = useState(false);

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

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [config, profile] = await Promise.all([getSafetyEscalationConfig(), getProfile()]);
        setEnabled(config.enabled);
        setStageOneDelayMinutes(config.stageOneDelayMinutes);
        setStageTwoDelayMinutes(config.stageTwoDelayMinutes);
        setStageThreeDelayMinutes(config.stageThreeDelayMinutes);
        setStageOneMode(config.stageOneMode);
        setStageTwoMode(config.stageTwoMode);
        setStageThreeMode(config.stageThreeMode);
        setSecureArrivalEnabled(config.secureArrivalEnabled);
        setSecureArrivalRequireLocation(config.secureArrivalRequireLocation);
        setSecureArrivalRequireCharging(config.secureArrivalRequireCharging);
        setSecureArrivalMinTripMinutes(config.secureArrivalMinTripMinutes);
        setInitialEnabled(config.enabled);

        const guardianEnabled = Boolean(profile?.allow_guardian_check_requests);
        setAllowGuardianCheckRequests(guardianEnabled);
        setInitialGuardianChecks(guardianEnabled);
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const assistant = await getOnboardingAssistantSession(userId);
        const shouldGuide = assistant.active && assistant.stepId === "safety_review";
        setGuideActive(shouldGuide);
        setShowGuideHint(shouldGuide);
      } catch {
        setGuideActive(false);
        setShowGuideHint(false);
      }
    })();
  }, [userId]);

  const summaryLabel = useMemo(() => {
    if (!enabled) return "Aucune relance automatique";
    return [
      `T+${stageOneDelayMinutes} min (${STAGE_MODE_LABELS[stageOneMode]})`,
      `T+${stageTwoDelayMinutes} min (${STAGE_MODE_LABELS[stageTwoMode]})`,
      `T+${stageThreeDelayMinutes} min (${STAGE_MODE_LABELS[stageThreeMode]})`
    ].join("  ·  ");
  }, [
    enabled,
    stageOneDelayMinutes,
    stageOneMode,
    stageTwoDelayMinutes,
    stageTwoMode,
    stageThreeDelayMinutes,
    stageThreeMode
  ]);

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

  const save = async () => {
    if (!enabled && initialEnabled) {
      const confirmDisableAlerts = await confirmSensitiveAction({
        firstTitle: "Désactiver l'escalade sécurité ?",
        firstMessage: "Tu ne recevras plus de relances automatiques en cas de retard.",
        secondTitle: "Confirmer la désactivation",
        secondMessage: "Cette action peut réduire la protection en cas d'oubli de confirmation.",
        secondConfirmLabel: "Désactiver"
      });
      if (!confirmDisableAlerts) return;
    }

    if (allowGuardianCheckRequests && !initialGuardianChecks) {
      const confirmEnableGuardianChecks = await confirmAction({
        title: "Autoriser les demandes des garants ?",
        message:
          "Tes garants pourront te demander une confirmation d'arrivée quand aucun trajet n'est programmé.",
        confirmLabel: "Autoriser"
      });
      if (!confirmEnableGuardianChecks) return;
    }

    if (!allowGuardianCheckRequests && initialGuardianChecks) {
      const confirmDisableGuardianChecks = await confirmAction({
        title: "Bloquer les demandes des garants ?",
        message:
          "Tes garants ne pourront plus te demander de confirmation rapide depuis l'application.",
        confirmLabel: "Bloquer"
      });
      if (!confirmDisableGuardianChecks) return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      await setSafetyEscalationConfig({
        enabled,
        reminderDelayMinutes: stageOneDelayMinutes,
        closeContactsDelayMinutes: stageTwoDelayMinutes,
        stageOneDelayMinutes,
        stageTwoDelayMinutes,
        stageThreeDelayMinutes,
        stageOneMode,
        stageTwoMode,
        stageThreeMode,
        secureArrivalEnabled,
        secureArrivalRequireLocation,
        secureArrivalRequireCharging,
        secureArrivalMinTripMinutes
      });

      // Conserve aussi la préférence côté profil pour les contrôles serveur.
      await upsertProfile({ allow_guardian_check_requests: allowGuardianCheckRequests });

      setInitialEnabled(enabled);
      setInitialGuardianChecks(allowGuardianCheckRequests);

      await logPrivacyEvent({
        type: allowGuardianCheckRequests ? "guardian_check_enabled" : "guardian_check_disabled",
        message: allowGuardianCheckRequests
          ? "Demande de nouvelles par garant activée."
          : "Demande de nouvelles par garant désactivée."
      });

      if (guideActive && userId && !guideTransitioning) {
        setGuideTransitioning(true);
        await markOnboardingManualStep(userId, "safety_review");
        const nextStep = getNextOnboardingStepId("safety_review") ?? "first_trip";
        await setOnboardingAssistantStep(userId, nextStep);
        setGuideActive(false);
        setShowGuideHint(false);
        setSuccessMessage("Réglages enregistrés. On passe à l'étape suivante.");
        router.push(getOnboardingStepRoute(nextStep));
      } else {
        setSuccessMessage("Réglages enregistrés.");
      }
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur de sauvegarde.");
    } finally {
      setSaving(false);
      setGuideTransitioning(false);
    }
  };

  const reset = async () => {
    const confirmed = await confirmSensitiveAction({
      firstTitle: "Réinitialiser les réglages sécurité ?",
      firstMessage: "Tu vas restaurer l'escalade par défaut.",
      secondTitle: "Confirmer la réinitialisation",
      secondMessage: "Les délais personnalisés seront remplacés par les valeurs standard.",
      secondConfirmLabel: "Réinitialiser"
    });
    if (!confirmed) return;

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");
      await resetSafetyEscalationConfig();

      const defaults = DEFAULT_SAFETY_ESCALATION_CONFIG;
      setEnabled(defaults.enabled);
      setStageOneDelayMinutes(defaults.stageOneDelayMinutes);
      setStageTwoDelayMinutes(defaults.stageTwoDelayMinutes);
      setStageThreeDelayMinutes(defaults.stageThreeDelayMinutes);
      setStageOneMode(defaults.stageOneMode);
      setStageTwoMode(defaults.stageTwoMode);
      setStageThreeMode(defaults.stageThreeMode);
      setSecureArrivalEnabled(defaults.secureArrivalEnabled);
      setSecureArrivalRequireLocation(defaults.secureArrivalRequireLocation);
      setSecureArrivalRequireCharging(defaults.secureArrivalRequireCharging);
      setSecureArrivalMinTripMinutes(defaults.secureArrivalMinTripMinutes);

      setSuccessMessage("Réglages par défaut restaurés.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur de réinitialisation.");
    } finally {
      setSaving(false);
    }
  };

  const busy = loading || saving;

  const StageCard = (props: {
    title: string;
    delayMinutes: number;
    setDelayMinutes: (value: number) => void;
    delayOptions: readonly number[];
    mode: SafetyEscalationMode;
    setMode: (value: SafetyEscalationMode) => void;
    minDelayMinutes: number;
  }) => (
    <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
      <Text className="text-xs uppercase tracking-widest text-slate-500">{props.title}</Text>
      <View className="mt-3 flex-row flex-wrap gap-2">
        {props.delayOptions.map((value) => {
          const active = props.delayMinutes === value;
          const disabled = value < props.minDelayMinutes;
          return (
            <TouchableOpacity
              key={`${props.title}-delay-${value}`}
              className={`rounded-full px-4 py-2 ${
                active ? "bg-amber-500" : "border border-slate-200 bg-white"
              } ${disabled ? "opacity-40" : ""}`}
              onPress={() => {
                if (disabled) return;
                props.setDelayMinutes(value);
              }}
            >
              <Text className={`text-sm font-semibold ${active ? "text-white" : "text-slate-700"}`}>
                {formatSafetyDelay(value)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">Canal</Text>
      <View className="mt-2 flex-row gap-2">
        {SAFETY_ESCALATION_MODES.map((mode) => {
          const active = props.mode === mode;
          return (
            <TouchableOpacity
              key={`${props.title}-mode-${mode}`}
              className={`flex-1 rounded-2xl px-3 py-3 ${
                active ? "bg-[#111827]" : "border border-slate-200 bg-white"
              }`}
              onPress={() => props.setMode(mode)}
            >
              <Text className={`text-center text-sm font-semibold ${active ? "text-white" : "text-slate-700"}`}>
                {STAGE_MODE_LABELS[mode]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

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
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">Sécurité</Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Escalade multi-niveau</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Configure les relances de retard, les canaux et la preuve d'arrivée sécurisée.
        </Text>

        <View className="mt-6 rounded-3xl bg-[#111827] px-5 py-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-300">Résumé</Text>
          <Text className="mt-2 text-2xl font-extrabold text-white">{enabled ? "Actif" : "Désactivé"}</Text>
          <Text className="mt-2 text-sm text-slate-300">{summaryLabel}</Text>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Activation</Text>
          <View className="mt-3 flex-row gap-2">
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                enabled ? "bg-emerald-600" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setEnabled(true)}
            >
              <Text className={`text-center text-sm font-semibold ${enabled ? "text-white" : "text-slate-700"}`}>
                Activée
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                !enabled ? "bg-rose-600" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setEnabled(false)}
            >
              <Text className={`text-center text-sm font-semibold ${!enabled ? "text-white" : "text-slate-700"}`}>
                Désactivée
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <StageCard
          title="Niveau 1"
          delayMinutes={stageOneDelayMinutes}
          setDelayMinutes={(value) => {
            setStageOneDelayMinutes(value);
            if (stageTwoDelayMinutes < value) {
              setStageTwoDelayMinutes(value);
            }
            if (stageThreeDelayMinutes < value) {
              setStageThreeDelayMinutes(value);
            }
          }}
          delayOptions={SAFETY_STAGE_ONE_OPTIONS}
          mode={stageOneMode}
          setMode={setStageOneMode}
          minDelayMinutes={1}
        />

        <StageCard
          title="Niveau 2"
          delayMinutes={stageTwoDelayMinutes}
          setDelayMinutes={(value) => {
            setStageTwoDelayMinutes(value);
            if (stageThreeDelayMinutes < value) {
              setStageThreeDelayMinutes(value);
            }
          }}
          delayOptions={SAFETY_STAGE_TWO_OPTIONS}
          mode={stageTwoMode}
          setMode={setStageTwoMode}
          minDelayMinutes={stageOneDelayMinutes}
        />

        <StageCard
          title="Niveau 3"
          delayMinutes={stageThreeDelayMinutes}
          setDelayMinutes={setStageThreeDelayMinutes}
          delayOptions={SAFETY_STAGE_THREE_OPTIONS}
          mode={stageThreeMode}
          setMode={setStageThreeMode}
          minDelayMinutes={stageTwoDelayMinutes}
        />

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Preuve d'arrivée sécurisée</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Ajoute des conditions avant de valider "Je suis bien'arrivé".
          </Text>
          <View className="mt-3 flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-slate-800">Activer la preuve renforcée</Text>
            <Switch value={secureArrivalEnabled} onValueChange={setSecureArrivalEnabled} />
          </View>

          {secureArrivalEnabled ? (
            <View className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-slate-700">Exiger la position proche de l'arrivée</Text>
                <Switch value={secureArrivalRequireLocation} onValueChange={setSecureArrivalRequireLocation} />
              </View>
              <View className="mt-3 flex-row items-center justify-between">
                <Text className="text-sm text-slate-700">Exiger le téléphone en charge</Text>
                <Switch value={secureArrivalRequireCharging} onValueChange={setSecureArrivalRequireCharging} />
              </View>
              <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">Durée mini du trajet</Text>
              <View className="mt-2 flex-row flex-wrap gap-2">
                {SECURE_ARRIVAL_MIN_TRIP_OPTIONS.map((value) => {
                  const active = secureArrivalMinTripMinutes === value;
                  return (
                    <TouchableOpacity
                      key={`secure-min-trip-${value}`}
                      className={`rounded-full px-4 py-2 ${
                        active ? "bg-cyan-700" : "border border-slate-200 bg-white"
                      }`}
                      onPress={() => setSecureArrivalMinTripMinutes(value)}
                    >
                      <Text className={`text-sm font-semibold ${active ? "text-white" : "text-slate-700"}`}>
                        {value === 0 ? "Aucun" : `${value} min`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Vérification par les garants</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Autorise tes garants à demander des nouvelles quand aucun trajet n'est programmé.
          </Text>
          <View className="mt-3 flex-row gap-2">
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                allowGuardianCheckRequests ? "bg-[#0F766E]" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setAllowGuardianCheckRequests(true)}
            >
              <Text
                className={`text-center text-sm font-semibold ${
                  allowGuardianCheckRequests ? "text-white" : "text-slate-700"
                }`}
              >
                Activer
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                !allowGuardianCheckRequests ? "bg-rose-600" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setAllowGuardianCheckRequests(false)}
            >
              <Text
                className={`text-center text-sm font-semibold ${
                  !allowGuardianCheckRequests ? "text-white" : "text-slate-700"
                }`}
              >
                Désactiver
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {errorMessage ? <FeedbackMessage kind="error" message={errorMessage} compact /> : null}
        {successMessage ? <FeedbackMessage kind="success" message={successMessage} compact /> : null}

        <TouchableOpacity
          className={`mt-4 rounded-2xl px-4 py-3 ${busy ? "bg-slate-300" : "bg-[#0F766E]"}`}
          onPress={save}
          disabled={busy}
        >
          <Text className="text-center text-sm font-semibold text-white">
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
          onPress={reset}
          disabled={busy}
        >
          <Text className="text-center text-sm font-semibold text-amber-800">Réinitialiser les réglages</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal transparent visible={showGuideHint && guideActive} animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/45 px-6">
          <View className="w-full rounded-3xl border border-cyan-200 bg-[#F0FDFF] p-5 shadow-lg">
            <Text className="text-[11px] font-semibold uppercase tracking-[2px] text-cyan-700">
              Assistant · Étape 4
            </Text>
            <Text className="mt-2 text-xl font-extrabold text-cyan-950">Règle tes alertes de retard</Text>
            <Text className="mt-2 text-sm text-cyan-900/80">
              Choisis les délais d'escalade puis touche "Enregistrer". Une fois fait, on t'envoie
              directement sur le premier trajet.
            </Text>
            <TouchableOpacity
              className="mt-4 rounded-2xl bg-cyan-700 px-4 py-3"
              onPress={() => setShowGuideHint(false)}
            >
              <Text className="text-center text-sm font-semibold text-white">Compris</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
