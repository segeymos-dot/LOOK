/** Compose display full name from first + last (trim, collapse spaces). */
export function composeFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
}
