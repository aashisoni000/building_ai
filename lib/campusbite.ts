export const CURRENT_STUDENT_ID = "S001";

export function formatSlot(time: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(time);
  if (!match) throw new Error(`Invalid pickup time: ${time}`);

  const hour = Number(match[1]);
  const minute = match[2];
  const period = hour < 12 ? "am" : "pm";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${period}`;
}
