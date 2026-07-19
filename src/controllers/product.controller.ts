import { Request, Response, NextFunction } from "express";
import {
  AuthRequest,
  CombinedAuthRequest,
  VendorAuthRequest,
} from "../middlewares/auth.middleware";
import { ProductInterface } from "../utils/zod_validations/product.zod";
import { ProductService } from "../service/product.service";
import { BadRequestError, NotFoundError } from "../errors";
import {
  IAdminProductQueryParams,
  IProductQueryParams,
} from "../interface/product.interface";
import { v2 as cloudinary } from "cloudinary";
import { DataSource } from "typeorm";
import { ReviewService } from "../service/review.service";
import config from "../config/env.config";

/**
 * @class ProductController
 * @description Handles product-related operations for public users, vendors, and admins.
 */
export class ProductController {
  private productService: ProductService;
  private reviewService: ReviewService;

  constructor(dataSource: DataSource) {
    this.productService = new ProductService(dataSource);
    this.reviewService = new ReviewService();

    cloudinary.config({
      cloud_name: config.CLOUDINARY_CLOUD_NAME,
      api_key: config.CLOUDINARY_API_KEY,
      api_secret: config.CLOUDINARY_API_SECRET,
    });
  }

  /**
   * @method getProductDetailById
   * @route GET /products/:id
   * @access Public
   */
  async getProductDetailById(
    req: Request<{ id: string }, {}, {}>,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const productId = parseInt(req.params.id);

    const product = await this.productService.getProductDetailsById(productId);
    const averageRating =
      await this.reviewService.getReviewsByProductId(productId);

    res.status(200).json({ success: true, product, avgRating: averageRating });
  }

  async createProduct(
    req: VendorAuthRequest<
      { subcategoryId: string; categoryId: string },
      {},
      ProductInterface,
      {}
    >,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const data: ProductInterface = req.body;
    const categoryId = Number(req.params.categoryId);
    const subcategoryId = Number(req.params.subcategoryId);

    if (
      data.hasVariants === "true" &&
      (!data.variants || !Array.isArray(data.variants))
    ) {
      throw new BadRequestError(
        "Variants array is required for variant products",
      );
    }

    const savedProduct = await this.productService.createProduct(
      data,
      categoryId,
      subcategoryId,
      Number(req.vendor.id),
    );

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: savedProduct,
    });
  }

  async updateProduct(
    req: VendorAuthRequest<
      { id: string; categoryId: string; subcategoryId: string },
      {},
      Partial<ProductInterface>,
      {}
    >,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const data: Partial<ProductInterface> = req.body;
    const productId = req.params.id;
    const categoryId = Number(req.params.categoryId);
    const subcategoryId = Number(req.params.subcategoryId);

    const vendorId = await this.productService.getVendorIdByProductId(
      Number(productId),
    );

    const updatedProduct = await this.productService.updateProduct(
      req.vendor ? req.vendor.id : vendorId,
      req.vendor ? false : true,
      Number(productId),
      data,
      categoryId,
      subcategoryId,
    );

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: updatedProduct,
    });
  }

  async returnProuctRatings(products: any[]): Promise<any[]> {
    if (!products.length) return products;

    const productIds = products.map((p) => p.id);
    const ratingsMap =
      await this.reviewService.getBatchAverageRatings(productIds);

    return products.map((product) => {
      const rating = ratingsMap.get(product.id) ?? { avg: 0, count: 0 };
      return { ...product, avgRating: rating.avg, count: rating.count };
    });
  }

  async getAllProducts(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const { page, limit, ...filters } = req.query;

    const queryParams: IProductQueryParams = {
      ...filters,
      page: Number(page) || 1,
      limit: Number(limit) || 40,
    };

    const result = await this.productService.filterProducts(queryParams);
    const productWithRatings = await this.returnProuctRatings(result.data);

    res.status(200).json({
      success: true,
      message: "All products retrieved successfully",
      data: productWithRatings,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  }

  async getProductById(
    req: Request<{ id: string; subcategoryId: string }>,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const { id, subcategoryId } = req.params;

    const product = await this.productService.getProductById(
      Number(id),
      Number(subcategoryId),
    );
    if (!product) throw new NotFoundError("Product");

    const rating = await this.reviewService.getAverageRating(product.id);
    const productWithRating = {
      ...product,
      avgRating: rating.avg,
      count: rating.count,
    };

    res.status(200).json({ success: true, data: productWithRating });
  }

  async getProductsByVendorId(
    req: Request<{ vendorId: string }, {}, {}, { page: string; limit: string }>,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const { vendorId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const { products, total } = await this.productService.getProductsByVendorId(
      Number(vendorId),
      Number(page),
      Number(limit),
    );

    const product = await this.returnProuctRatings(products);

    res.status(200).json({ success: true, data: { product, total } });
  }

  async deleteProduct(
    req: AuthRequest<{ id: string; subcategoryId: string }>,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const { id, subcategoryId } = req.params;

    await this.productService.deleteProduct(
      Number(id),
      Number(subcategoryId),
      req.user!.id,
    );

    res.status(204).json({ success: true });
  }

  /**
   * @method deleteProductImage
   * @route DELETE /products/:id/:subcategoryId/image
   * @access Authenticated
   */
  async deleteProductImage(
    req: CombinedAuthRequest<
      { id: string; subcategoryId: string },
      {},
      { imageUrl: string }
    >,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const { id, subcategoryId } = req.params;
    const { imageUrl } = req.body;

    if (!imageUrl) throw new BadRequestError("Image URL is required");

    const userId = req.user?.id || req.vendor?.id;

    const product = await this.productService.deleteProductImage(
      Number(id),
      Number(subcategoryId),
      userId,
      imageUrl,
    );

    if (!product) throw new NotFoundError("Product or image");

    res.status(200).json({ success: true, data: product });
  }

  async deleteProductById(
    req: Request<{ id: string }>,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const id = Number(req.params.id);

    if (isNaN(id)) throw new BadRequestError("Invalid product ID");

    await this.productService.deleteProductById(id);

    res
      .status(200)
      .json({ success: true, msg: "Product deleted successfully" });
  }

  /**
   * @method getAdminProducts
   * @route GET /admin/products
   * @access Admin and staff
   */
  async getAdminProducts(
    req: AuthRequest<{}, {}, {}, IAdminProductQueryParams>,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const { products, total } = await this.productService.getAdminProducts(
      req.query,
    );
    res.status(200).json({ success: true, data: { products, total } });
  }

  async uplaodImage(
    req: Request,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
      throw new BadRequestError("No files uploaded");
    }

    const files = req.files as Express.Multer.File[];

    const uploadedUrls = await Promise.all(
      files.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            cloudinary.uploader
              .upload_stream(
                {
                  resource_type: "image",
                  folder: "products",
                  public_id: `prod_${Date.now()}`,
                },
                (error, result) => {
                  if (error || !result)
                    return reject(error || new Error("Upload failed"));
                  resolve(result.secure_url);
                },
              )
              .end(file.buffer);
          }),
      ),
    );

    res.status(200).json({ success: true, urls: uploadedUrls });
  }
}
