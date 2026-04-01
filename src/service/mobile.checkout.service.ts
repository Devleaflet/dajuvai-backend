import { Repository } from 'typeorm';
import { Cart } from '../entities/cart.entity';
import { User } from '../entities/user.entity';
import AppDataSource from '../config/db.config';
import { APIError } from '../utils/ApiError.utils';
import { PaymentMethod } from '../entities/order.entity';

export class MobileCheckoutService {
    private cartRepository: Repository<Cart>;
    private userRepository: Repository<User>;

    constructor() {
        this.cartRepository = AppDataSource.getRepository(Cart);
        this.userRepository = AppDataSource.getRepository(User);
    }

    async getMobileCheckoutDetails(userId: number) {
        const user = await this.userRepository.findOne({
            where: { id: userId },
            relations: ['address'],
        });
        if (!user) throw new APIError(404, 'User not found');

        const cart = await this.cartRepository.findOne({
            where: { userId },
            relations: [
                'items',
                'items.product',
                'items.product.vendor',
                'items.product.vendor.district',
                'items.variant',
            ],
        });

        const userProfile = {
            id: user.id,
            fullName: user.fullName,
            username: user.username,
            email: user.email,
            phoneNumber: user.phoneNumber,
            role: user.role,
            address: user.address
                ? {
                      province: user.address.province,
                      district: user.address.district,
                      city: user.address.city,
                      localAddress: user.address.localAddress,
                      landmark: user.address.landmark,
                  }
                : null,
        };

        const cartData = cart
            ? {
                  id: cart.id,
                  total: cart.total,
                  items: cart.items.map((item) => {
                      const vendor = item.product?.vendor;
                      return {
                          id: item.id,
                          productId: item.product?.id ?? null,
                          name: item.name,
                          price: item.price,
                          quantity: item.quantity,
                          image: item.image,
                          variantId: item.variantId ?? null,
                          vendor: vendor
                              ? {
                                    id: vendor.id,
                                    businessName: vendor.businessName,
                                    email: vendor.email,
                                    phoneNumber: vendor.phoneNumber,
                                    districtId: vendor.districtId,
                                    district: vendor.district
                                        ? { id: vendor.district.id, name: vendor.district.name }
                                        : null,
                                }
                              : null,
                      };
                  }),
              }
            : { id: null, total: 0, items: [] };

        return {
            user: userProfile,
            cart: cartData,
        };
    }
}
