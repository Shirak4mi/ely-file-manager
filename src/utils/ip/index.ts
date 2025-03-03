/**
 * Validates if a string is a valid IPv4 address (e.g., "192.168.1.1").
 * Optimized for speed: single-pass parsing, no regex, minimal allocations.
 *
 * @param {string} ip - Potential IPv4 address to validate
 * @returns {boolean} True if valid IPv4, false otherwise
 */
export function isValidIPv4(ip: string): boolean {
  const len = ip.length;
  if (len < 7 || len > 15) return false; // Quick filter: "0.0.0.0" to "255.255.255.255"

  let dots = 0;
  let num = 0;
  let start = 0;

  for (let i = 0; i <= len; i++) {
    if (i === len || ip[i] === ".") {
      if (i - start > 3 || i === start) return false; // Too long or empty octet
      num = 0;
      for (let j = start; j < i; j++) {
        const char = ip[j];
        if (char < "0" || char > "9") return false; // Non-digit
        num = num * 10 + (char.charCodeAt(0) - 48); // Fast parse
        if (num > 255) return false; // Early overflow check
      }
      if (ip[start] === "0" && i - start > 1) return false; // Leading zero check
      dots++;
      start = i + 1;
    }
  }

  return dots === 4; // Must have exactly 4 octets
}

/**
 * Converts an IPv6 address to IPv4 if it’s an IPv4-mapped or compatible address.
 * Optimized for speed: minimal string ops, fast prefix checks, and early exits.
 * Returns null if conversion fails or input isn’t valid.
 *
 * @param {string} ipv6 - IPv6 address (e.g., "::ffff:192.168.1.1" or "::192.168.1.1")
 * @returns {string | null} IPv4 address if valid, null otherwise
 */
export function convertIPv6ToIPv4(ipv6: string): string | null {
  const len = ipv6.length;
  if (len < 7 || len > 21) return null; // Quick length filter: "::1.2.3.4" to "::ffff:255.255.255.255"

  // Fast prefix checks instead of full regex
  const lower = ipv6.toLowerCase().trim(); // Single normalization
  let ipv4Start: number;

  // Check IPv4-mapped (::ffff:IPv4)
  if (lower.startsWith("::ffff:") && len >= 13) {
    ipv4Start = 7; // Skip "::ffff:"
  }
  // Check IPv4-compatible (::IPv4, deprecated)
  else if (lower.startsWith("::") && lower[2] !== "f" && len >= 9) {
    ipv4Start = 2; // Skip "::"
  } else {
    return null; // Early exit for non-matching prefixes
  }

  const ipv4 = lower.substring(ipv4Start);
  return isValidIPv4(ipv4) ? ipv4 : null; // Validate and return
}
