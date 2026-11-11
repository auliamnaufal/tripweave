// Code 128 (subset B) encoder. Returns symbol values and module widths so the
// PDF builder can draw the barcode as plain rectangles; no barcode library.

/**
 * Bar/space widths (in modules) for symbol values 0-106. Each 6-digit entry is
 * bar, space, bar, space, bar, space and sums to 11; 106 (stop) has a 7th bar.
 */
export const CODE128_PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START_B = 104;
const STOP = 106;

export type Code128 = {
  /** Start B, data values, checksum, stop. */
  values: number[];
  /** Alternating bar/space widths in modules, starting with a bar. */
  widths: number[];
};

/** Encodes printable ASCII (32-126) as Code 128-B. Throws on anything else. */
export function encodeCode128B(text: string): Code128 {
  if (text.length === 0) throw new Error("Code 128 needs at least one character.");
  const data = [...text].map((char) => {
    const code = char.charCodeAt(0);
    if (char.length !== 1 || code < 32 || code > 126) throw new Error(`Code 128-B cannot encode ${JSON.stringify(char)}.`);
    return code - 32;
  });
  const checksum = data.reduce((sum, value, index) => sum + value * (index + 1), START_B) % 103;
  const values = [START_B, ...data, checksum, STOP];
  const widths = values.flatMap((value) => [...CODE128_PATTERNS[value]].map(Number));
  return { values, widths };
}

/** Total width in modules, quiet zones excluded (11 per symbol, 13 for stop). */
export function code128Modules(code: Code128): number {
  return code.widths.reduce((sum, width) => sum + width, 0);
}
