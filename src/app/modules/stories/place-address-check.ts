/**
 * A map's marker is the provider's place for a name, and a name can match the
 * wrong building: a venue with two halls, a park with two entrances, a
 * homonym in the same town. When the slide's facts state a street address
 * ("Lieu : Domaine Trinity, 360, rue McGinnis"), the provider's address must
 * carry the same civic number and street before its map is shown. A source
 * that states no address cannot confirm or contradict the provider.
 */

const STREET_TYPES = [
  // French
  "rue", "boulevard", "boul", "bd", "avenue", "av", "chemin", "ch", "place", "route", "rang", "montee", "promenade",
  "allee", "impasse", "cote", "croissant", "terrasse", "carre", "quai", "square",
  // English
  "street", "st", "ave", "road", "rd", "drive", "dr", "lane", "ln", "way", "blvd", "parkway", "pkwy", "court", "ct",
  "pl", "highway", "hwy", "trail", "circle", "terrace",
  // Spanish
  "calle", "avenida", "carretera", "camino", "paseo", "plaza", "calzada",
];
const TYPE = STREET_TYPES.join("|");
/** Words that never identify a street on their own. */
const GENERIC = new Set([...STREET_TYPES, "de", "du", "des", "la", "le", "les", "d", "l", "of", "the", "del", "los", "las",
  "nord", "sud", "est", "ouest", "north", "south", "east", "west", "n", "s", "e", "o", "w", "secteur"]);

/** Plain lowercase words; commas and similar marks stay as a "," token, so a street name stops at them. */
const normalized = (value: string) =>
  value.normalize("NFKD").replace(/[̀-ͯ]/gu, "").toLowerCase().replace(/[’']/gu, " ")
    .replace(/[,;:()]/gu, " , ").replace(/[^a-z0-9,]+/gu, " ").replace(/\s+/gu, " ").trim();

export type StatedAddress = { number: string; words: string[] };

/** The civic addresses a text states: the number and the street's distinctive words. */
export function statedStreetAddresses(text: string): StatedAddress[] {
  const plain = normalized(text);
  const found: StatedAddress[] = [];
  const add = (number: string, name: string) => {
    const words = name.split(" ").filter((word) => word.length >= 3 && !GENERIC.has(word) && !/^\d+$/u.test(word));
    if (words.length) found.push({ number, words });
  };
  // "360, rue McGinnis", "30 boulevard du Séminaire Nord", "12 calle Mayor"
  for (const match of plain.matchAll(new RegExp(`\\b(\\d{1,5})(?: \\d{1,5})?(?: ,)? (?:${TYPE}) ((?:[a-z]+ ?){1,4})`, "gu"))) {
    add(match[1]!, match[2]!.trim());
  }
  // "1100 Congress Avenue"
  for (const match of plain.matchAll(new RegExp(`\\b(\\d{1,5}) ((?:[a-z]+ ){1,3})(?:${TYPE})\\b`, "gu"))) {
    add(match[1]!, match[2]!);
  }
  return found;
}

/**
 * true: the provider's address carries a stated number and street; false: the
 * facts state an address and the provider's is another; undefined: nothing to
 * compare.
 */
export function providerAddressMatchesStated(statedText: string, providerAddress: string): boolean | undefined {
  const stated = statedStreetAddresses(statedText);
  if (!stated.length) return undefined;
  const provider = ` ${normalized(providerAddress)} `;
  return stated.some((address) => provider.includes(` ${address.number} `) && address.words.some((word) => provider.includes(` ${word} `)));
}
