// Helpers to read raw storage. Used by the upgradeability tests and handy in the console.
import { getAddress, id, toBeHex, toBigInt, zeroPadValue } from "ethers";

type StorageReader = { getStorage(address: string, slot: bigint | string): Promise<string> };

/** EIP-1967: keccak256(label) - 1, so nobody knows a preimage that hashes to the slot. */
export function eip1967Slot(label: string): string {
  return toBeHex(toBigInt(id(label)) - 1n, 32);
}

export const IMPLEMENTATION_SLOT = eip1967Slot("eip1967.proxy.implementation");
export const ADMIN_SLOT = eip1967Slot("eip1967.proxy.admin");
export const BEACON_SLOT = eip1967Slot("eip1967.proxy.beacon");

/** Raw 32-byte word stored at `slot`. */
export async function readSlot(provider: StorageReader, address: string, slot: bigint | string): Promise<string> {
  return zeroPadValue(await provider.getStorage(address, slot), 32);
}

/** Interprets the lowest 20 bytes of the slot as an address. */
export async function readAddressSlot(provider: StorageReader, address: string, slot: bigint | string): Promise<string> {
  const word = await readSlot(provider, address, slot);
  return getAddress("0x" + word.slice(-40));
}

export async function readUintSlot(provider: StorageReader, address: string, slot: bigint | string): Promise<bigint> {
  return toBigInt(await readSlot(provider, address, slot));
}

/** Prints slots [0, count) plus the EIP-1967 slots. Useful while live-coding. */
export async function dumpSlots(provider: StorageReader, address: string, count = 4): Promise<void> {
  const rows: Record<string, string> = {};
  for (let i = 0n; i < BigInt(count); i++) rows[`slot ${i}`] = await readSlot(provider, address, i);
  rows["eip1967.implementation"] = await readSlot(provider, address, IMPLEMENTATION_SLOT);
  rows["eip1967.admin"] = await readSlot(provider, address, ADMIN_SLOT);
  rows["eip1967.beacon"] = await readSlot(provider, address, BEACON_SLOT);
  console.table(rows);
}
