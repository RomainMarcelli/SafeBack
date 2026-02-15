// Définition et résolution des actions rapides exposées sur l'écran d'accueil.
export function formatQuickArrivalMessage(sentToGuardians: number): string {
  if (sentToGuardians <= 0) {
    return "Confirmation envoyée. Aucun garant actif a notifier.";
  }
  if (sentToGuardians === 1) {
    return "Confirmation envoyée a 1 garant.";
  }
  return `Confirmation envoyée a ${sentToGuardians} garants.`;
}
