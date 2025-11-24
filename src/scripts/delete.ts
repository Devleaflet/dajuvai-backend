import AppDataSource from "../config/db.config";
import { Order } from "../entities/order.entity";

const clearAllOrders = async () => {
    await AppDataSource.initialize(); 
    const orderRepo = AppDataSource.getRepository(Order);
    await orderRepo.delete({});
    console.log("All orders and related order items deleted successfully");
    await AppDataSource.destroy(); 
};

clearAllOrders().catch((err) => console.error(err));
