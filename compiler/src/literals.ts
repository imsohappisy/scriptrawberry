/**
 * Parse a ScriptRowberry numeric literal string and extract the numeric value and optional type info.
 * Handles:
 *  - Bit-suffixed literals: `5b3` (value=5, bitWidth=3)
 *  - Hex literals: `0xFF`, `0xFF_u8`
 *  - Binary literals: `0b1010`, `0b1010_u4`  
 *  - Plain integers: `42` (inferred as i32)
 *  - Edge case: `0b3` = value 0 with u3 type (NOT binary 0b3)
 */
export function parseLiteral(raw: string): { value: number; bitWidth?: number } {
  const str = raw.replace(/_/g, ''); // strip underscores

  // Check for bit-suffix pattern: <digits>b<digits>
  // e.g. 5b3, 0b3, 12b4
  // Must distinguish from binary prefix 0b1010.
  // Key insight: in `NbW` format, N is a decimal integer and W is a bit width.
  // Binary prefix 0b is always followed by only 0s and 1s.
  const bitSuffixMatch = str.match(/^(\d+)b(\d+)$/);
  if (bitSuffixMatch) {
    const numPart = bitSuffixMatch[1];
    const widthPart = bitSuffixMatch[2];
    const width = parseInt(widthPart, 10);
    const value = parseInt(numPart, 10);
    
    // If numPart is "0" and width could be confused with binary,
    // check if this is really a binary literal: 0b followed by only 0/1
    // 0b3 -> 3 is not a valid binary digit, so this IS a bit suffix (value=0, width=3)
    // 0b10 -> 10 are valid binary digits AND could be bit suffix. 
    // We resolve by convention: if it looks like 0bXXXX where X is 0 or 1, treat as binary.
    if (numPart === '0' && /^[01]+$/.test(widthPart)) {
      // This is ambiguous: 0b10 could be binary 2 or bit-suffix 0 in u10.
      // Treat as binary prefix (0b1010 = 10 decimal)
      const value = parseInt(widthPart, 2);
      return { value };
    }
    
    return { value, bitWidth: width };
  }

  // Hex literal: 0xFF or 0xFFu8
  if (str.startsWith('0x') || str.startsWith('0X')) {
    const hexPart = str.replace(/^0[xX]/, '');
    const value = parseInt(hexPart, 16);
    return { value };
  }

  // Binary literal: 0b1010 or 0B1010
  if (str.startsWith('0b') || str.startsWith('0B')) {
    const binPart = str.replace(/^0[bB]/, '');
    const value = parseInt(binPart, 2);
    return { value };
  }

  // Plain integer
  const value = parseInt(str, 10);
  return { value };
}
