import sharp from 'sharp';
import path from 'path';

type Blend = 'over'|'multiply'|'screen';
interface CompositeLayer { input: Buffer | string; top: number; left: number; blend?: Blend; }

export class DogonautsCompositor {
  constructor(private assetsPath: string = './assets') {}

  private rectBuffer(w: number, h: number, hex: string) {
    const { r, g, b } = hexToRgb(hex);
    return sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } }).png().toBuffer();
  }

  async createProductPost(productImagePath: string) {
    const canvas = sharp({ create: { width: 1080, height: 1080, channels: 3, background: { r:255, g:255, b:255 } } });
    const footer = await this.rectBuffer(1080, 360, '#2C4356');
    const logoBadge = await sharp(path.join(this.assetsPath, 'dogonauts-badge-500.png'))
      .resize(100, 100, { fit: 'contain' }).toBuffer();
    const product = await sharp(productImagePath).resize(600, 520, { fit: 'contain' }).toBuffer();

    const composite: CompositeLayer[] = [
      { input: footer, top: 720, left: 0 },
      { input: logoBadge, top: 760, left: 60 },
      { input: product, top: 100, left: 240 }
    ];
    return canvas.composite(composite).jpeg({ quality: 95 }).toBuffer();
  }
}
function hexToRgb(hex: string) {
  const m = hex.replace('#','').match(/.{1,2}/g);
  if (!m) return { r:0, g:0, b:0 };
  const [r,g,b] = m.map(x => parseInt(x,16));
  return { r, g, b };
}
