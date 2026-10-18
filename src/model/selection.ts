// 選択した要素の扱い(グループへの広げ方・複製・整列の単位)。ストアと画面で共有する純粋な関数
import type { Element } from "./deck";
import { newId } from "./ids";

/** 選択をグループ単位に広げる(グループのどれか 1 つを選んだら、そのグループ全体。位置を固定した要素は加えない)。inside のグループは広げない */
export function expandToGroups(elements: Element[], ids: string[], inside?: string): string[] {
  const groups = new Set(elements.filter((e) => ids.includes(e.id) && e.group && e.group !== inside).map((e) => e.group));
  if (!groups.size) return ids;
  const out = new Set(ids);
  for (const e of elements) if (e.group && groups.has(e.group) && !e.locked) out.add(e.id);
  // スライド上の重ね順で返す(Moveable のグループ枠が安定する)
  return elements.filter((e) => out.has(e.id)).map((e) => e.id);
}

/** 要素を複製用にコピーする。id を振り直し、グループも新しい名前に付け替える */
export function cloneElements(els: Element[], dx: number, dy: number): Element[] {
  const groupMap = new Map<string, string>();
  return els.map((el) => {
    const copy = structuredClone(el) as Element;
    copy.id = newId(el.type);
    copy.x = el.x + dx;
    copy.y = el.y + dy;
    if (el.group) {
      if (!groupMap.has(el.group)) groupMap.set(el.group, newId("g"));
      copy.group = groupMap.get(el.group);
    }
    return copy;
  });
}

/** 整列・等間隔の単位。グループは 1 つの塊として扱う */
export interface Unit {
  ids: string[];
  x: number;
  y: number;
  w: number;
  h: number;
}

export function unitsOf(elements: Element[], ids: string[]): Unit[] {
  const units = new Map<string, Unit>();
  for (const e of elements) {
    if (!ids.includes(e.id)) continue;
    const key = e.group ? `g:${e.group}` : `e:${e.id}`;
    const u = units.get(key);
    if (!u) {
      units.set(key, { ids: [e.id], x: e.x, y: e.y, w: e.w, h: e.h });
    } else {
      const x2 = Math.max(u.x + u.w, e.x + e.w);
      const y2 = Math.max(u.y + u.h, e.y + e.h);
      u.x = Math.min(u.x, e.x);
      u.y = Math.min(u.y, e.y);
      u.w = x2 - u.x;
      u.h = y2 - u.y;
      u.ids.push(e.id);
    }
  }
  return [...units.values()];
}
