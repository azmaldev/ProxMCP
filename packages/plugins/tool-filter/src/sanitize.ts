const patterns: RegExp[] = [
  /\bignore\s+(previous|all)\s+instructions?\b/gi,
  /\bsystem\s+prompt\b/gi,
  /[A-Z][A-Z\s\d]{19,}/g,
]

export function sanitizeDescription(description: string): string {
  let result = description
  for (const pattern of patterns) {
    result = result.replace(pattern, '[...]')
  }
  return result
}
