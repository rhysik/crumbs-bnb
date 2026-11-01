const physicalKeys: Record<string, number> = {
  KeyW: 1,
  ArrowUp: 1,
  KeyS: 2,
  ArrowDown: 2,
  KeyA: 4,
  ArrowLeft: 4,
  KeyD: 8,
  ArrowRight: 8,
  Space: 16,
};
const fallbackKeys: Record<string, number> = {
  w: 1,
  ц: 1,
  ArrowUp: 1,
  s: 2,
  ы: 2,
  ArrowDown: 2,
  a: 4,
  ф: 4,
  ArrowLeft: 4,
  d: 8,
  в: 8,
  ArrowRight: 8,
  " ": 16,
};
export function keyBit(event: Pick<KeyboardEvent, "code" | "key">) {
  return (
    physicalKeys[event.code] ||
    fallbackKeys[event.key] ||
    fallbackKeys[event.key.toLowerCase()] ||
    0
  );
}
