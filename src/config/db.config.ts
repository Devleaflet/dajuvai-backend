

import { DataSource } from "typeorm";
import { config } from "dotenv"
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





config()




const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  synchronize: true,
  logging: true,
  entities: [User, Category, Subcategory, Product, Vendor, Brand, Cart, CartItem, Wishlist, WishlistItem, Review, Deal, Address, Order, OrderItem,
    Banner, Contact, District, HomePageSection, Promo, Variant, HomeCategory],
  migrations: [],
  ssl: false,
  // ssl: {
  //   rejectUnauthorized: false, // Required for Render's managed Postgres
  // },
});

export default AppDataSource;