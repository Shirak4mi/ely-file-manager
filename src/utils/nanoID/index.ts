/**
 * Generates a cryptographically secure random ID with exceptional performance
 *
 * @param {number} size - Length of the generated ID (default: 21)
 * @returns {string} A cryptographically secure unique random ID
 *
 * @example
 * // Default usage (21 character ID with URL-safe alphabet)
 * import generateId from './nanoid';
 * const id = generateNanoId();
 * // => "JVxF3bDr9SHbmv6FLkM5c"
 *
 * @example
 * // Custom length (10 characters)
 * const shortId = generateNanoId(10);
 * // => "X1c5DwMj9r"
 *
 * @throws {Error} If size is not a positive integer
 */
export default function generateNanoID(size: number = 21): string {
  const Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

  // Input validation
  if (size <= 0 || !Number.isInteger(size)) {
    throw new Error("Size must be a positive integer");
  }

  // Calculate the bitmask based on the alphabet length
  // This is crucial for unbiased random sampling
  const len = Alphabet.length;

  // Find the closest power of 2 greater than alphabet length
  // Using Math.clz32 for fast bit manipulation
  const mask = (2 << (31 - Math.clz32((len - 1) | 1))) - 1;

  // Optimize step size to reduce number of random generations needed
  // The 1.6 factor has been empirically determined for optimal performance
  const step = Math.ceil((1.6 * mask * size) / len);

  // Pre-allocate arrays for better performance
  const result = new Array(size);

  // Use typed arrays for better performance with the Web Crypto API
  const bytes = new Uint8Array(step);

  let i = 0; // Position in result
  let j = 0; // Position in random bytes

  // Generate random bytes in bulk (much faster than one-by-one)
  crypto.getRandomValues(bytes);

  // Main loop with unbiased sampling algorithm
  while (i < size) {
    // If we're out of random bytes, generate more
    if (j >= bytes.length) {
      crypto.getRandomValues(bytes);
      j = 0;
    }

    // Apply mask to get unbiased random value
    const r = bytes[j] & mask;
    j++;

    // Skip values outside our alphabet range (crucial for unbiased distribution)
    if (r >= len) continue;

    // Add character to result
    result[i] = Alphabet[r];
    i++;
  }

  // Join at the end (faster than string concatenation in a loop)
  return result.join("");
}
