#!/bin/bash

echo "Ì¥ß Fixing ESM imports..."

# Encontrar todos los archivos .ts (excepto .d.ts)
find src/ -name "*.ts" -not -name "*.d.ts" | while read file; do
  echo "Processing: $file"
  
  # Reemplazar imports relativos sin .js
  # Patr√≥n: from './algo' o from "../algo"
  sed -i -E "s|from '(\.\./[^']+)'|from '\1.js'|g" "$file"
  sed -i -E 's|from "(\.\./[^"]+)"|from "\1.js"|g' "$file"
  sed -i -E "s|from '(\./[^']+)'|from '\1.js'|g" "$file"
  sed -i -E 's|from "(\./[^"]+)"|from "\1.js"|g' "$file"
  
  # Limpiar dobles .js.js
  sed -i 's|\.js\.js|.js|g' "$file"
  
  # Tambi√©n imports de tipo: import type {} from './algo'
  sed -i -E "s|from '(\.\./[^']+)' assert|from '\1.js' assert|g" "$file"
  sed -i -E 's|from "(\.\./[^"]+)" assert|from "\1.js" assert|g' "$file"
done

echo "‚úÖ Done!"
