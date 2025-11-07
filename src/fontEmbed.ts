import fs from 'fs';
import path from 'path';

function toDataURL(buffer: Buffer, mime = 'font/ttf') {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export function buildFontCSS(fontsDir = './fonts') {
  const files = {
    montBold: fs.readFileSync(path.join(fontsDir, 'Montserrat-Bold.ttf')),
    montExtraBold: fs.readFileSync(path.join(fontsDir, 'Montserrat-ExtraBold.ttf')),
    montBlack: fs.readFileSync(path.join(fontsDir, 'Montserrat-Black.ttf')),
    interRegular: fs.readFileSync(path.join(fontsDir, 'Inter-Regular.ttf')),
    interMedium: fs.readFileSync(path.join(fontsDir, 'Inter-Medium.ttf')),
    interSemiBold: fs.readFileSync(path.join(fontsDir, 'Inter-SemiBold.ttf')),
  };

  return `
  @font-face { font-family: 'Montserrat'; font-weight: 700; src: url('${toDataURL(files.montBold)}') format('truetype'); }
  @font-face { font-family: 'Montserrat'; font-weight: 800; src: url('${toDataURL(files.montExtraBold)}') format('truetype'); }
  @font-face { font-family: 'Montserrat'; font-weight: 900; src: url('${toDataURL(files.montBlack)}') format('truetype'); }
  @font-face { font-family: 'Inter'; font-weight: 400; src: url('${toDataURL(files.interRegular)}') format('truetype'); }
  @font-face { font-family: 'Inter'; font-weight: 500; src: url('${toDataURL(files.interMedium)}') format('truetype'); }
  @font-face { font-family: 'Inter'; font-weight: 600; src: url('${toDataURL(files.interSemiBold)}') format('truetype'); }
  * { font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial; }
  `.trim();
}
