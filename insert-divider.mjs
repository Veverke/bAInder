import { readFileSync, writeFileSync } from 'fs';

const content = readFileSync('src/reader/reader.js', 'utf8');
const insert = `
    // Assembled-chat section divider (===) — marks where one chat ends, the next begins
    if (/^={3,}\\s*$/.test(line)) {
      flushPara(paraBuf); paraBuf = '';
      flushList();
      htmlParts.push(
        '<div class="chat-section-divider" role="separator" aria-label="Chat boundary">' +
          '<span class="chat-section-divider__label">next chat</span>' +
        '</div>'
      );
      i++;
      continue;
    }

`;
const idx = content.indexOf('    if (/^>');
const updated = content.slice(0, idx) + insert + content.slice(idx);
writeFileSync('src/reader/reader.js', updated, 'utf8');
console.log('done, inserted at', idx);
