import { DataSource } from "typeorm";
import { Product } from "../entities/product.entity";
import { Variant } from "../entities/variant.entity";
import { ProductService } from "../service/product.service";

export async function updateAllProductPrices(dataSource: DataSource) {
    const productRepo = dataSource.getRepository(Product);
    const variantRepo = dataSource.getRepository(Variant);
    const productService = new ProductService(dataSource);

    const products = await productRepo.find({
        relations: ["variants", "deal"],
    });

    console.log(`Updating prices for ${products.length} products...`);

    for (const product of products) {

        console.log(product)

        if (!product.hasVariants && product.basePrice) {
            const priceAfterDiscount = productService.calculateFinalPrice(
                Number(product.basePrice),
                product.discount,
                product.discountType
            );

            const finalPrice = productService.applyDealPrice(
                priceAfterDiscount,
                product.deal
            );

            product.finalPrice = finalPrice;
        }

        if (product.hasVariants && product.variants?.length) {
            for (const variant of product.variants) {
                const variantFinalPrice = productService.calculateFinalPrice(
                    Number(variant.basePrice),
                    variant.discount,
                    variant.discountType
                );

                variant.finalPrice = variantFinalPrice;
            }

            await variantRepo.save(product.variants);
        }

        await productRepo.save(product);
    }

    console.log("✅ Product and variant prices updated successfully");
}
