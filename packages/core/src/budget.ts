/**
 * Parse Indian budget phrases: "1.2 Cr", "80L", "80 lakhs - 1 crore", "90,00,000", "₹ 1.1-1.3 Cr", "under 1 cr".
 */
const CRORE = 1e7;
const LAKH = 1e5;

function unitMultiplier(u: string | undefined): number | null {
  if (!u) return null;
  const s = u.toLowerCase();
  if (/^(cr|crore|crores|c)$/.test(s)) return CRORE;
  if (/^(l|lac|lacs|lakh|lakhs|lk)$/.test(s)) return LAKH;
  if (/^(k|thousand)$/.test(s)) return 1e3;
  return null;
}

export function parseBudgetInr(text: string | null | undefined): { min?: number; max?: number } | null {
  if (!text) return null;
  const s = text.replace(/₹|\brs\.?|\binr\b/gi, ' ').replace(/(\d),(?=\d)/g, '$1').toLowerCase();
  const re = /(\d+(?:\.\d+)?)\s*(cr(?:ores?)?|crore|lakhs?|lacs?|lac|lk|l|k)?\b/g;
  const nums: Array<{ v: number; unit: number | null; rangeStart: boolean }> = [];
  for (const m of s.matchAll(re)) {
    const v = Number(m[1]);
    if (!Number.isFinite(v)) continue;
    const after = s.slice((m.index ?? 0) + m[0].length);
    nums.push({ v, unit: unitMultiplier(m[2]), rangeStart: /^\s*(-|–|to)\s*\d/.test(after) });
  }
  if (!nums.length) return null;
  // "1.1-1.3 Cr": a bare number that starts a range inherits the unit of the number after it.
  // Bare numbers elsewhere ("3 BHK") are ignored unless they are full rupee amounts.
  const values = nums
    .map((n, i) => {
      const unit = n.unit ?? (n.v >= 1e5 ? 1 : n.rangeStart ? (nums[i + 1]?.unit ?? null) : null);
      return unit ? n.v * unit : null;
    })
    .filter((v): v is number => v !== null && v >= 5e5 && v <= 1e10);
  if (!values.length) return null;
  if (/under|below|upto|up to|less than|max/.test(s)) return { max: Math.max(...values) };
  if (/above|over|more than|min|at least|\+/.test(s) && values.length === 1) return { min: values[0] };
  if (values.length === 1) {
    const v = values[0]!;
    return { min: Math.round(v * 0.9), max: Math.round(v * 1.1) };
  }
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** "3BHK", "2/3 BHK", "2.5 bhk", "2 or 3 bedroom" -> [3] / [2,3] / [2.5]. A bare "3" reply is accepted too. */
export function parseBhk(text: string | null | undefined): number[] | null {
  if (!text) return null;
  const s = text.toLowerCase();
  const out: number[] = [];
  const re = /((?:\d(?:\.5)?\s*(?:\/|,|or|&|and|-|to)\s*)*\d(?:\.5)?)\s*(?:bhk|bed(?:room)?s?\b|br\b)/g;
  for (const m of s.matchAll(re)) {
    for (const n of m[1]!.match(/\d(?:\.5)?/g) ?? []) out.push(Number(n));
  }
  if (!out.length && /^\s*\d(\.5)?\s*$/.test(s)) out.push(Number(s.trim()));
  const valid = [...new Set(out.filter((n) => n >= 1 && n <= 6))].sort((a, b) => a - b);
  return valid.length ? valid : null;
}
