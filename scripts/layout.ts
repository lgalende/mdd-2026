// Prints the storage layout of several contracts side by side, read from the build-info.
//
//   npx hardhat build && npx hardhat run scripts/layout.ts
//   LAYOUT_CONTRACTS=VaultUUPSV1B,VaultUUPSV2 npx hardhat run scripts/layout.ts
//
// Requires `storageLayout` in the solc outputSelection (see hardhat.config.ts).
import { readFile } from "node:fs/promises";
import path from "node:path";
import hre from "hardhat";

type StorageEntry = { label: string; slot: string; offset: number; type: string };
type StorageLayout = { storage: StorageEntry[]; types: Record<string, { label: string; numberOfBytes: string }> | null };

// Use a fully qualified name ("path/File.sol:Name") when two contracts share a name, like the two VaultV1.
const DEFAULT = "contracts/upgradeability/02-storage-collision/VaultV1.sol:VaultV1,VaultV2Broken";
const names = (process.env.LAYOUT_CONTRACTS ?? DEFAULT).split(",").map((n) => n.trim());
const labels = names.map((n) => n.split(":").pop()!);

async function readLayout(name: string): Promise<StorageLayout> {
  const artifact = await hre.artifacts.readArtifact(name);
  if (artifact.buildInfoId === undefined || artifact.inputSourceName === undefined) {
    throw new Error(`No build-info for ${name}, run \`npx hardhat build\``);
  }
  // Hardhat 3 stores solc output in artifacts/build-info/<id>.output.json
  const file = path.join(hre.config.paths.artifacts, "build-info", `${artifact.buildInfoId}.output.json`);
  const { output } = JSON.parse(await readFile(file, "utf8"));
  const layout = output.contracts[artifact.inputSourceName][artifact.contractName].storageLayout;
  if (layout === undefined) throw new Error(`storageLayout missing for ${name}, check outputSelection`);
  return layout;
}

const layouts = await Promise.all(names.map(readLayout));

// One row per (slot, offset) present in any contract.
const keys = new Map<string, { slot: bigint; offset: number }>();
for (const layout of layouts) {
  for (const e of layout.storage) keys.set(`${e.slot}:${e.offset}`, { slot: BigInt(e.slot), offset: e.offset });
}
const sorted = [...keys.values()].sort((a, b) => (a.slot === b.slot ? a.offset - b.offset : a.slot < b.slot ? -1 : 1));

const rows = sorted.map(({ slot, offset }) => {
  const row: Record<string, string> = { slot: offset === 0 ? `${slot}` : `${slot} (+${offset})` };
  layouts.forEach((layout, i) => {
    const e = layout.storage.find((s) => BigInt(s.slot) === slot && s.offset === offset);
    row[labels[i]] = e === undefined ? "" : `${e.label}: ${layout.types?.[e.type]?.label ?? e.type}`;
  });
  return row;
});

console.table(rows);

// Flag every variable of the first contract that moved or changed type in a later one.
const base = layouts[0].storage;
layouts.slice(1).forEach((layout, i) => {
  const broken = base.filter((b) => {
    const e = layout.storage.find((s) => s.slot === b.slot && s.offset === b.offset);
    return e === undefined || e.label !== b.label || e.type !== b.type;
  });
  const status = broken.length === 0 ? "OK" : `BROKEN (${broken.map((b) => `${b.label}@${b.slot}`).join(", ")})`;
  console.log(`${labels[0]} -> ${labels[i + 1]}: ${status}`);
});
