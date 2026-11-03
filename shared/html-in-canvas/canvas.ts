export type CanvasMode = 'native' | 'dom';
export interface DrawableCanvas extends HTMLCanvasElement {
  content: string;
  requestPaint(): void;
  getElementTransform: (...args: unknown[]) => DOMMatrix;
  updateElementGeometry(element: Element, options?: { canvasTransform?: DOMMatrix; preserveHitTestOrder?: boolean }): void;
  clearElementGeometry(element: Element): void;
}
export interface DrawableContext extends CanvasRenderingContext2D {
  drawElementImage(element: Element, x: number, y: number, width?:number, height?:number): DOMMatrix | undefined;
}
export function supportsCanvas(): boolean {
  return typeof CanvasRenderingContext2D !== 'undefined' && typeof (CanvasRenderingContext2D.prototype as DrawableContext).drawElementImage === 'function' && typeof (HTMLCanvasElement.prototype as DrawableCanvas).requestPaint === 'function';
}
export function prepareCanvas(canvas: DrawableCanvas) {
  canvas.setAttribute('content' in canvas ? 'content' : 'layoutsubtree', 'content' in canvas ? 'drawable' : '');
}
const legacyGeometry = new WeakMap<DrawableCanvas, boolean>();
export function syncGeometry(canvas: DrawableCanvas, element: HTMLElement, result: DOMMatrix | undefined) {
  // Chrome 156 (CanvasDrawElement enabled, ElementCanvasTransform disabled):
  // drawElementImage returns a CSS transform; updateElementGeometry registers
  // the element in the canvas hit-test stack. BOTH are necessary. A returned
  // matrix alone is not evidence that pointer routing is aligned.
  if (result && !legacyGeometry.has(canvas)) {
    // Function.length includes runtime-disabled WebIDL overloads in Chrome 156.
    // Probe the one-argument overload itself instead of trusting its arity.
    try { canvas.getElementTransform(element); legacyGeometry.set(canvas, false); }
    catch { legacyGeometry.set(canvas, true); }
  }
  if (result && legacyGeometry.get(canvas)) {
    const transform = result.toString();
    if (element.style.transform !== transform) element.style.transform = transform;
    canvas.updateElementGeometry(element);
  }
  // New API automatically sets geometry in drawElementImage. Re-applying the
  // old CSS matrix would transform those elements twice.
}
export function syncGpuGeometry(canvas:DrawableCanvas,element:HTMLElement,cssTransform:DOMMatrix){
  if(!legacyGeometry.has(canvas)){try{canvas.getElementTransform(element);legacyGeometry.set(canvas,false);}catch{legacyGeometry.set(canvas,true);}}
  if(legacyGeometry.get(canvas)){const value=cssTransform.toString();if(element.style.transform!==value)element.style.transform=value;canvas.updateElementGeometry(element);}
  else canvas.updateElementGeometry(element,{canvasTransform:cssTransform});
}
