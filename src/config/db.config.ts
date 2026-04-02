

import { DataSource } from "typeorm";
import config from "./env.config";
import { User } from "../entities/user.entity"
import { Subcategory } from "../entities/subcategory.entity"
import { Category } from "../entities/category.entity"
import { Product } from "../entities/product.entity"
import { Vendor } from "../entities/vendor.entity"
import { Brand } from "../entities/brand.entity";
import { WishlistItem } from '../entities/wishlistItem.entity';
import { Wishlist } from "../entities/wishlist.entity";
import { CartItem } from "../entities/cartItem.entity";
import { Cart } from '../entities/cart.entity';
import { Review } from "../entities/reviews.entity";
import { Deal } from "../entities/deal.entity";
import { Address } from "../entities/address.entity";
import { Order } from "../entities/order.entity";
import { OrderItem } from "../entities/orderItems.entity";
import { Banner } from "../entities/banner.entity";
import { Contact } from "../entities/contact.entity";
import { District } from "../entities/district.entity";
import { HomePageSection } from "../entities/homePage.entity";
import { Promo } from "../entities/promo.entity";
import { Variant } from "../entities/variant.entity";
import { HomeCategory } from "../entities/home.category";
import { Notification } from "../entities/notification.entity";
import { VendorPaymentOption } from "../entities/vendorPaymentOption";





// const AppDataSource = new DataSource({
//   type: "postgres",
//   url: config.DATABASE_URL,
//   synchronize: false,
//   logging: false,
//   entities: [User, Category, Subcategory, Product, Vendor, Brand, Cart, CartItem, Wishlist, WishlistItem, Review, Deal, Address, Order, OrderItem,
//     Banner, Contact, District, HomePageSection, Promo, Variant, HomeCategory, Notification, VendorPaymentOption],
//   migrations: ['src/migrations/*.ts'],
//   ssl: false,
// });

const AppDataSource = new DataSource({
    type: "postgres",
    host: "localhost",
    port: 5432,
    username: "postgres",
    password: "admin",
    database: "dajuvai",
    entities: ["src/entities/**/*.ts"],
    // synchronize: true,
    // synchronize: process.env.NODE_ENV === "development",
    logging: true,
});

export default AppDataSource;
export { AppDataSource };