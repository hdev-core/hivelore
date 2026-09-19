import { prisma } from '../lib/prisma.js';
import { rebuildSearchIndex } from '../lib/search-index.js';

const result = await rebuildSearchIndex(prisma);

console.log(
  `Rebuilt search index for ${result.worlds} worlds and ${result.loreEntries} canon lore entries.`,
);

await prisma.$disconnect();
