import AppDataSource from "../config/db.config";
import { ProductSearchIndexer } from "../service/product-search-indexer.service";

const BATCH_SIZE = 300;

async function run(): Promise<void> {
  await AppDataSource.initialize();
  const indexer = new ProductSearchIndexer(AppDataSource);
  let cursor = 0;
  let processed = 0;

  try {
    while (true) {
      const ids = await indexer.refreshProductsAfterId(cursor, BATCH_SIZE);
      if (ids.length === 0) break;
      cursor = ids.at(-1) ?? cursor;
      processed += ids.length;
      console.log(`Indexed ${processed} products`);
    }
    console.log(`Product search backfill complete: ${processed} products`);
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((error) => {
  console.error("Product search backfill failed", error);
  process.exitCode = 1;
});
