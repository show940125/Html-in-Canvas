export type Rect = { x: number; y: number; width: number; height: number };
export type Run = {
  text: string;
  family: string;
  size: number;
  rgba: number;
  sourceIndex?: number;
  bold?: boolean;
  italic?: boolean;
  renderMode?: number;
  [key: string]: unknown;
};
export type PageObject = Rect & {
  id: string;
  kind: "text" | "image" | "path" | "form";
  engineId: number;
  index?: number;
  editable: boolean;
  reason?: string;
  text?: string;
  runs?: Run[];
  format?: any;
  raw?: any;
};
export type PageView = {
  page: number;
  count: number;
  width: number;
  height: number;
  objects: PageObject[];
  image: { width: number; height: number; data: Uint8ClampedArray };
  generation: number;
  info: any;
};
export type ScanBlock = Rect & {
  id: string;
  page: number;
  source: string;
  original: string;
  translation: string;
  score: number;
  detScore?: number;
  order: number;
  mode: "search" | "rebuild";
  fill: string;
  size: number;
  mask: Rect;
  rotation: number;
  needsReview: boolean;
};
export type Job = {
  id: string;
  inputHash: string;
  status: "submitted" | "complete" | "failed" | "cancelled" | "unknown";
  kind: "ocr" | "translation";
  message?: string;
  started: number;
  finished?: number;
  diagnostic?: unknown;
};
export type Project = {
  schema: 1;
  id: string;
  name: string;
  source: Uint8Array;
  sourceHash: string;
  bytes: Uint8Array;
  revision: number;
  page: number;
  scans: ScanBlock[];
  jobs: Job[];
  groups: Record<string, string[]>;
  translations?: Record<string, string>;
  signatureCount?: number;
  identities?: Record<number, import("./identity").ObjectIdentity[]>;
  updated: number;
};
export const defaultFormat = {
  align: 0,
  lineSpacing: 1.2,
  charSpacing: 0,
  paraSpacing: 0,
  wordSpacing: 0,
  firstIndent: 0,
  hangIndent: 0,
  dir: 0,
  listLevel: 0,
};
// A distinct provider key prevents reusing a source PDF's incompatible CJK font.
export const fontFamily = "Canvas PDF TC";
