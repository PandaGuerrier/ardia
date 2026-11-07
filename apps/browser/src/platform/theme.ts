import { holdThemedWindowsKeyLook as setNativeKeyLookHold } from "@ardia/shaders";

let keyLookHolders = 0;

export function holdThemedWindowsKeyLook(on: boolean) {
  const before = keyLookHolders;
  keyLookHolders = Math.max(0, keyLookHolders + (on ? 1 : -1));
  if ((before > 0) !== (keyLookHolders > 0)) setNativeKeyLookHold(keyLookHolders > 0);
}
