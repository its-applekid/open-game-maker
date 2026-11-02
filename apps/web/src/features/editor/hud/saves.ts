import type { SaveData, SaveSlot } from '@ogm/contracts/browser';

export const SAVE_SLOT_IDS = ['auto', '1', '2', '3'] as const satisfies readonly SaveSlot['slotId'][];
export type SaveSlotId = (typeof SAVE_SLOT_IDS)[number];
export type SaveWrite = (
  gameId: string,
  slotId: SaveSlotId,
  payload: SaveData<unknown>,
  headRevision?: number,
) => Promise<unknown>;

export function saveSlotOptions(slots: readonly SaveSlot[]): Array<{ id: SaveSlotId; slot?: SaveSlot }> {
  const byId = new Map(slots.map((slot) => [slot.slotId, slot]));
  return SAVE_SLOT_IDS.map((id) => ({ id, slot: byId.get(id) }));
}

export function storeSaveWrite(
  gameId: string,
  slotId: SaveSlotId,
  payload: SaveData<unknown>,
  slots: readonly SaveSlot[],
  write: SaveWrite,
): Promise<unknown> {
  const headRevision = slots.find((slot) => slot.slotId === slotId)?.headRevision;
  return write(gameId, slotId, payload, headRevision);
}

export function saveSlotLabel(slotId: SaveSlotId): string {
  return slotId === 'auto' ? 'Auto save' : `Save slot ${slotId}`;
}
