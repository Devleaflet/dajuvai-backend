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
        return this.homecategoryRepo.find({
            relations: ["category", "category.subcategories"]
        })
    }
}