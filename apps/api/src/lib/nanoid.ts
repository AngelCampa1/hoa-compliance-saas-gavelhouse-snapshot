import { customAlphabet } from "nanoid";

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const _nanoid = customAlphabet(ALPHABET, 21);

export function nanoid(size?: number): string {
  return _nanoid(size);
}
