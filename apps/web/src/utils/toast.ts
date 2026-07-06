/**
 * Loads the toast UI only when a notification is actually shown.
 */
export async function showToast(message: string) {
  const { toast } = await import("sonner");

  toast(message);
}
