export type Matrix = [number, number, number, number, number, number];
export function inverse(t: Matrix): Matrix {
  const [a, b, c, d, e, f] = t,
    det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-10)
    throw Error("不可逆的頁面座標矩陣");
  return [
    d / det,
    -b / det,
    -c / det,
    a / det,
    (c * f - d * e) / det,
    (b * e - a * f) / det,
  ];
}
export function point(t: Matrix, x: number, y: number) {
  return { x: t[0] * x + t[2] * y + t[4], y: t[1] * x + t[3] * y + t[5] };
}
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
