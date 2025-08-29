import AppDataSource from "../config/db.config";
import { Category } from "../entities/category.entity";
import { HomeCategory } from "../entities/home.category";

export class HomeCategoryService {
    private homecategoryRepo = AppDataSource.getRepository(HomeCategory);

    async handleCreateHomeCategory(id: number[]) {
        await this.homecategoryRepo.clear();

        const newHomeCategories = id.map((id) =>
            this.homecategoryRepo.create({
                category: { id }
            })
        );

        return this.homecategoryRepo.save(newHomeCategories);
    }


    async getHomeCategory() {
        const categories = await this.homecategoryRepo
            .createQueryBuilder("homeCategory")
            .leftJoinAndSelect("homeCategory.category", "category")
            .leftJoinAndSelect("category.subcategories", "subcategory")
            .select([
                "homeCategory.id",
                "category.id",
                "category.name",
                "category.image",
                "subcategory.id",
                "subcategory.name",
                "subcategory.image"
            ])
            .getMany();

        return categories;
    }

}