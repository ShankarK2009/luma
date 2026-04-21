import type {
  CandidateOutfit,
  OutfitGenerationContext,
  OutfitSlotMap,
  WardrobeItem,
} from "@/lib/types";
import { inferSlotFromItem, scoreItem } from "@/lib/outfits/rules";

export function buildOutfitSlotKey(slots: OutfitSlotMap) {
  return JSON.stringify({
    ...slots,
    accessories: slots.accessories?.slice().sort() ?? [],
  });
}

function sortItems(items: WardrobeItem[], context: OutfitGenerationContext) {
  return items
    .map((item) => ({
      item,
      score: scoreItem(item, context),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.item);
}

export function buildDeterministicCandidates(
  items: WardrobeItem[],
  context: OutfitGenerationContext,
) {
  const slots = {
    top: [] as WardrobeItem[],
    bottom: [] as WardrobeItem[],
    onePiece: [] as WardrobeItem[],
    outerwear: [] as WardrobeItem[],
    shoes: [] as WardrobeItem[],
    accessories: [] as WardrobeItem[],
  };

  for (const item of items) {
    const slot = inferSlotFromItem(item);

    if (!slot) continue;
    slots[slot].push(item);
  }

  const ranked = {
    top: sortItems(slots.top, context).slice(0, 4),
    bottom: sortItems(slots.bottom, context).slice(0, 4),
    onePiece: sortItems(slots.onePiece, context).slice(0, 2),
    outerwear: sortItems(slots.outerwear, context).slice(0, 3),
    shoes: sortItems(slots.shoes, context).slice(0, 3),
    accessories: sortItems(slots.accessories, context).slice(0, 3),
  };

  const candidates: CandidateOutfit[] = [];
  const seen = new Set<string>();

  for (const look of ranked.onePiece) {
    const slotsMap: OutfitSlotMap = {
      onePiece: look.id,
      outerwear: ranked.outerwear[0]?.id,
      shoes: ranked.shoes[0]?.id,
      accessories: ranked.accessories.slice(0, 2).map((item) => item.id),
    };
    const key = buildOutfitSlotKey(slotsMap);

    if (!seen.has(key)) {
      seen.add(key);
      candidates.push({
        id: `candidate-${candidates.length + 1}`,
        slots: slotsMap,
        score:
          scoreItem(look, context) +
          (ranked.outerwear[0] ? scoreItem(ranked.outerwear[0], context) : 0) +
          (ranked.shoes[0] ? scoreItem(ranked.shoes[0], context) : 0),
        notes: [
          "Single-piece base keeps the look fast and cohesive.",
          "Accessories stay minimal to keep the silhouette clean.",
        ],
        vibe: context.vibePrompt ?? "clean and composed",
      });
    }
  }

  for (const top of ranked.top) {
    for (const bottom of ranked.bottom) {
      const outerwear = ranked.outerwear.find((item) => item.id !== top.id);
      const shoes = ranked.shoes[0];
      const accessories = ranked.accessories
        .filter((item) => item.id !== shoes?.id)
        .slice(0, 2);

      const slotsMap: OutfitSlotMap = {
        top: top.id,
        bottom: bottom.id,
        outerwear: outerwear?.id,
        shoes: shoes?.id,
        accessories: accessories.map((item) => item.id),
      };
      const key = buildOutfitSlotKey(slotsMap);

      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        id: `candidate-${candidates.length + 1}`,
        slots: slotsMap,
        score:
          scoreItem(top, context) +
          scoreItem(bottom, context) +
          (outerwear ? scoreItem(outerwear, context) : 0) +
          (shoes ? scoreItem(shoes, context) : 0),
        notes: [
          "Balanced base built from your strongest top and bottom pairing.",
          "Outer layer is optional and can be removed by late afternoon.",
        ],
        vibe: context.vibePrompt ?? "polished and easy",
      });
    }
  }

  return candidates.sort((left, right) => right.score - left.score).slice(0, 6);
}
