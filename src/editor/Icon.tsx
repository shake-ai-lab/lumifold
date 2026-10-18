import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical,
  AlignStartHorizontal, AlignStartVertical, ArrowDown, ArrowLeft, ArrowRight, ArrowUp,
  Bold, BringToFront, Check, ChevronDown, Clipboard, Copy, Download, Eye, FilePlus2,
  FolderOpen, Fullscreen, Heading1, Image, Italic, Maximize2, MessageSquare, Minimize2,
  MousePointer2, Move, Package, PanelLeft, PanelRight, Paperclip, Pencil, Pin, PinOff,
  Presentation, Radical, Redo2, RotateCcw, Save, SendToBack, Shapes,
  SlidersHorizontal, SquarePlus, Table2, TextCursorInput, Trash2, Type, Undo2,
  Columns3, Rows3, ArrowUpFromLine, ArrowDownToLine, CopyPlus, BookOpen, Columns2, RectangleVertical, Volume2, VolumeX,
} from "lucide-react";

// One palette of decorative, tree-shaken icons. The button owns its accessible name.
const icons = {
  text: Type, heading: Heading1, math: Radical, shapes: Shapes, image: Image, table: Table2,
  widget: SlidersHorizontal, undo: Undo2, redo: Redo2, copy: Copy, paste: Clipboard,
  duplicate: CopyPlus, delete: Trash2, comment: MessageSquare,
  left: AlignStartVertical, hcenter: AlignCenterVertical, right: AlignEndVertical,
  top: AlignStartHorizontal, vmiddle: AlignCenterHorizontal, bottom: AlignEndHorizontal,
  distributeH: Columns3, distributeV: Rows3, front: BringToFront, back: SendToBack,
  forward: ArrowUpFromLine, backward: ArrowDownToLine,
  move: Move, interact: MousePointer2, pin: Pin, unpin: PinOff,
  new: FilePlus2, open: FolderOpen, save: Save, package: Package, export: Download,
  slides: PanelLeft, properties: PanelRight, present: Presentation, presenter: Eye,
  addSlide: SquarePlus, up: ArrowUp, down: ArrowDown, previous: ArrowLeft, next: ArrowRight,
  fullscreen: Fullscreen, exitFullscreen: Minimize2, edit: Pencil, chevron: ChevronDown,
  fitFrame: Maximize2, fitText: TextCursorInput, attach: Paperclip,
  check: Check, reset: RotateCcw, bold: Bold, italic: Italic,
  read: BookOpen, spread: Columns2, singlePage: RectangleVertical, sound: Volume2, mute: VolumeX,
} as const;

export type IconName = keyof typeof icons;

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const Glyph = icons[name];
  return <Glyph className={`control-icon ${className}`} size={18} strokeWidth={1.75} aria-hidden="true" focusable="false" />;
}
