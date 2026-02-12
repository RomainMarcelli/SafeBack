export function formatQuickArrivalMessage(sentToGuardians: number): string {
  if (sentToGuardians <= 0) {
    return "Confirmation envoyee. Aucun garant actif a notifier.";
  }
  if (sentToGuardians === 1) {
    return "Confirmation envoyee a 1 garant.";
  }
  return `Confirmation envoyee a ${sentToGuardians} garants.`;
}
