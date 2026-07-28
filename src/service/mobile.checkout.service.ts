import { Repository } from 'typeorm';
import { Cart } from '../entities/cart.entity';
import { User } from '../entities/user.entity';
import AppDataSource from '../config/db.config';
import { APIError } from '../utils/ApiError.utils';
import { PaymentMethod } from '../entities/order.entity';
import { OrderService } from './order.service';
import { IShippingAddressRequest } from '../interface/order.interface';

export class MobileCheckoutService {
    private cartRepository: Repository<Cart>;
    private userRepository: Repository<User>;
    private orderService: OrderService;

    constructor() {
        this.cartRepository = AppDataSource.getRepository(Cart);
        this.userRepository = AppDataSource.getRepository(User);
        this.orderService = new OrderService();
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
                'items.product.deal',
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
                      streetAddress: user.address.localAddress,
                      landmark: user.address.landmark,
                  }
                : null,
        };

        const defaultShippingAddress: IShippingAddressRequest | null = user.address
            ? {
                  province: user.address.province as IShippingAddressRequest['province'],
                  district: user.address.district || '',
                  city: user.address.city || '',
                  streetAddress: user.address.localAddress || '',
                  landmark: user.address.landmark || '',
              }
            : null;

        const checkoutDefaults = {
            fullName: user.fullName || user.username || '',
            phoneNumber: user.phoneNumber || '',
            shippingAddress: defaultShippingAddress,
            paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        };

        const missingCheckoutFields = [
            !checkoutDefaults.fullName ? 'fullName' : null,
            !checkoutDefaults.phoneNumber ? 'phoneNumber' : null,
            !checkoutDefaults.shippingAddress?.province ? 'province' : null,
            !checkoutDefaults.shippingAddress?.district ? 'district' : null,
            !checkoutDefaults.shippingAddress?.city ? 'city' : null,
            !checkoutDefaults.shippingAddress?.streetAddress ? 'streetAddress' : null,
        ].filter((field): field is string => Boolean(field));

        const checkoutReady =
            Boolean(cart?.items?.length) && missingCheckoutFields.length === 0;

        let checkoutEstimate: Awaited<
            ReturnType<OrderService['estimateCheckout']>
        > | null = null;
        let checkoutEstimateError: string | null = null;

        if (checkoutReady && checkoutDefaults.shippingAddress) {
            try {
                checkoutEstimate = await this.orderService.estimateCheckout(userId, {
                    shippingAddress: checkoutDefaults.shippingAddress,
                });
            } catch (error) {
                checkoutEstimateError =
                    error instanceof Error
                        ? error.message
                        : 'Unable to estimate checkout totals';
            }
        }

        const lineBreakdownsByKey = new Map<string, any>();
        for (const line of checkoutEstimate?.priceBreakdown?.lineItems ?? []) {
            lineBreakdownsByKey.set(`${line.productId ?? ''}:${line.variantId ?? ''}`, line);
        }

        const cartData = cart
            ? {
                  id: cart.id,
                  total: Number(cart.total) || 0,
                  items: cart.items.map((item) => {
                      const vendor = item.product?.vendor;
                      const product = item.product;
                      const variant = item.variant;
                      const lineKey = `${product?.id ?? ''}:${item.variantId ?? ''}`;
                      const priceBreakdown = lineBreakdownsByKey.get(lineKey) ?? null;
                      return {
                          id: item.id,
                          productId: product?.id ?? null,
                          name: item.name,
                          price: Number(item.price) || 0,
                          quantity: item.quantity,
                          image: item.image,
                          variantId: item.variantId ?? null,
                          priceBreakdown,
                          product: product
                              ? {
                                    id: product.id,
                                    name: product.name,
                                    basePrice: product.basePrice ?? null,
                                    finalPrice: product.finalPrice ?? null,
                                    discountAmount: product.discountAmount ?? 0,
                                    discountPercent: product.discountPercent ?? 0,
                                    discountType: product.discountType ?? null,
                                    productImages: product.productImages ?? [],
                                    deal: product.deal
                                        ? {
                                              id: product.deal.id,
                                              name: product.deal.name,
                                              discountPercentage: product.deal.discountPercentage,
                                              status: product.deal.status,
                                          }
                                        : null,
                              }
                              : null,
                          variant: variant
                              ? {
                                    id: variant.id,
                                    sku: variant.sku,
                                    basePrice: variant.basePrice,
                                    finalPrice: variant.finalPrice,
                                    discountAmount: variant.discountAmount,
                                    discountPercent: variant.discountPercent,
                                    discountType: variant.discountType,
                                    attributes: variant.attributes,
                                    variantImages: variant.variantImages,
                                    stock: variant.stock,
                                  }
                              : null,
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
            checkoutReady,
            missingCheckoutFields,
            checkoutDefaults,
            availablePaymentMethods: [
                PaymentMethod.CASH_ON_DELIVERY,
                PaymentMethod.ESEWA,
                PaymentMethod.NPX,
            ],
            checkoutEstimate,
            checkoutEstimateError,
            priceBreakdown: checkoutEstimate?.priceBreakdown ?? null,
            vendorShippingBreakdown: checkoutEstimate?.vendorShippingBreakdown ?? [],
            totals: checkoutEstimate
                ? {
                      merchandiseSubtotal: checkoutEstimate.merchandiseSubtotal,
                      shippingTotal: checkoutEstimate.shippingTotal,
                      discountTotal: checkoutEstimate.discountTotal,
                      appliedPromoCode: checkoutEstimate.appliedPromoCode,
                      taxTotal: checkoutEstimate.taxTotal,
                      grandTotal: checkoutEstimate.grandTotal,
                  }
                : null,
        };
    }
}
