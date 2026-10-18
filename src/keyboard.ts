/** 文字を入力する場所(入力欄・選択欄・編集中の文字や表のセル)か。そこでのキーはアプリの操作に使わない */
export function isTypingTarget(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  // isContentEditable は contenteditable="plaintext-only"(表のセル)も含む
  return !!t && (!!t.closest?.("input, textarea, select") || !!t.isContentEditable);
}
