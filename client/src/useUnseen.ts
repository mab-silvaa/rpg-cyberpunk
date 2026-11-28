import { useState } from "react";

/** Quantas rolagens chegaram enquanto a aba não estava aberta (zera ao abrir). */
export function useUnseen(rolls: { id: number }[], viewing: boolean): number {
  const latest = rolls.at(-1)?.id ?? 0;
  const [seenId, setSeenId] = useState(latest);
  if (viewing && seenId !== latest) setSeenId(latest);
  return viewing ? 0 : rolls.filter((r) => r.id > seenId).length;
}
