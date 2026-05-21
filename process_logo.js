import fs from 'fs';
import path from 'path';

async function processLogo() {
  const inputPath = 'C:\\Users\\M Faizan\\.gemini\\antigravity-ide\\brain\\f8784037-9358-4961-92ed-428ec02af5a1\\media__1779279375892.png';
  const outputPath = 'f:\\Code\\Backgrond remove\\frontend\\public\\logo.png';

  console.log(`Copying original logo from: ${inputPath} to: ${outputPath}`);
  fs.copyFileSync(inputPath, outputPath);
  console.log('✅ Success: Original logo copied successfully!');
}

processLogo().catch((err) => {
  console.error('❌ Failed to process logo:', err);
});
