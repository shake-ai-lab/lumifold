let seq = 0;

/** 要素・スライド・グループの id を振る。同じミリ秒でも重ならないよう連番を足す */
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}${seq.toString(36)}`;
}
