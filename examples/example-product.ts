// examples/example-product.ts
import fs from 'fs';
import { DogonautsCompositor } from '../src/sharpCompositor';

(async () => {
  const comp = new DogonautsCompositor('./assets');
  const buf = await comp.createProductPost('./assets/sample-product.jpg');
  fs.writeFileSync('./out/product-spotlight.jpg', buf);
  console.log('✔ product-spotlight.jpg listo');
})();
