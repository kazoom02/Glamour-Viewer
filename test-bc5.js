import { decodeBC5 } from '@bis-toolkit/bcn';
const data = new DataView(new ArrayBuffer(16));
const rgba = decodeBC5(data, 4, 4);
console.log(rgba.slice(0, 4));
