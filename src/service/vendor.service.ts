import { Repository } from 'typeorm';
import { Vendor } from '../entities/vendor.entity';
import AppDataSource from '../config/db.config';
import { IVendorSignupRequest, IUpdateVendorRequest } from '../interface/vendor.interface';
import { Address } from '../entities/address.entity';
import { APIError } from '../utils/ApiError.utils';
import { DistrictService } from './district.service';
import { District } from '../entities/district.entity';
import { IUpdateVendorPaymentOptionRequest, IUpdateVendorRequestV2, vendorSignupSchema } from '../utils/zod_validations/vendor.zod';
import { PaymentOption, VendorPaymentOption } from '../entities/vendorPaymentOption';
import { toVendorAdminDTO } from '../utils/vendorAdminDto';

/**
 * Service for managing vendor-related operations such as
 * creating, updating, and fetching vendors.
 * Handles validation, error checking, and database interactions.
 */
export class VendorService {
    private readonly vendorRepository: Repository<Vendor>;
    private addressRepository: Repository<Address>;
    private districtService: DistrictService;
    private vendorPaymentOptionRepository: Repository<VendorPaymentOption>;

    /**
     * Initializes repositories and dependent services.
     */
    constructor() {
        this.vendorRepository = AppDataSource.getRepository(Vendor);
        this.addressRepository = AppDataSource.getRepository(Address);
        this.districtService = new DistrictService();
        this.vendorPaymentOptionRepository = AppDataSource.getRepository(VendorPaymentOption);
    }

    /**
     * Fetches all vendors from the database.
     * @returns {Promise<Vendor[]>} Array of all vendor entities.
     */
    async fetchAllVendors(): Promise<Vendor[]> {
        // Simple find all vendors, no filtering.
        return await this.vendorRepository.find({
            where: {
                isApproved: true
            },
            relations: {
                paymentOptions: true
            }
        });

        // return await this.vendorRepository.find({})
    }
    async fetchPartialVendors(): Promise<Vendor[]> {
        return await this.vendorRepository.find({
            where: {
                isApproved: true
            },
            select: {
                email: true,
                id: true,
                businessName: true
            }
        });

    }

    async fetchAllUnapprovedVendor() {
        const vendors = await this.vendorRepository.find({
            where: {
                isApproved: false,
                isVerified: true
            },
            relations: {
                paymentOptions: true
            }
        })

        return vendors.map(toVendorAdminDTO);
    }



    /**
     * Creates a new vendor with validation on email uniqueness and district existence.
     * @param vendorSignupData - Vendor data for signup, including business info and optional verification.
     * @returns {Promise<Vendor>} The newly created vendor entity.
     * @throws {APIError} Throws error if vendor exists or district invalid.
     */
    async createVendor(vendorSignupData: IVendorSignupRequest): Promise<Vendor> {
        try {
            const email = vendorSignupData.email;
            const district = vendorSignupData.district
            //  Prevent duplicate vendors
            const existing = await this.vendorRepository.findOne({ where: { email } });
            if (existing) throw new APIError(409, "Vendor already exists");

            //  Ensure district exists
            const districtEntity = await this.districtService.findDistrictByName(district);
            if (!districtEntity) throw new APIError(400, "District does not exist");

            // Create vendor entity
            const vendor = this.vendorRepository.create({
                ...vendorSignupData,
                district: districtEntity,
                districtId: districtEntity.id,
                isVerified: false,
                isApproved: false,
            });

            return await this.vendorRepository.save(vendor);
        } catch (error) {
            throw new Error(`Failed to create vendor: ${error.message}`);
        }
    }
    /**
     * Finds a vendor by email.
     * @param email - Vendor's email to search for.
     * @returns {Promise<Vendor | null>} The vendor entity or null if not found.
     */
    async findVendorByEmail(email: string): Promise<Vendor | null> {
        // Simple search by email, useful for signup/login flows
        return await this.vendorRepository.findOne({ where: { email } });
    }

    /**
     * Finds a vendor by email for login purposes.
     * @param email - Vendor's email.
     * @returns {Promise<Vendor | null>} The vendor entity or null if not found.
     */
    async findVendorByEmailLogin(email: string): Promise<Vendor | null> {
        // Same as findVendorByEmail - can customize if login logic differs later
        return await this.vendorRepository.findOne({ where: { email } });
    }

    /**
     * Finds a vendor by reset token (e.g., for password reset).
     * @param token - Reset token string.
     * @returns {Promise<Vendor | null>} Vendor if token matches, null otherwise.
     */
    async findVendorByResetToken(token: string): Promise<Vendor | null> {
        // Used in password reset flows to find vendor by token
        return await this.vendorRepository.findOne({ where: { resetToken: token } });
    }

    /**
     * Fetches a vendor by their unique ID.
     * @param id - Vendor ID.
     * @returns {Promise<Vendor | null>} Vendor entity or null if not found.
     */
    // async getVendorByIdService(id: number): Promise<Vendor | null> {
    //     // Straightforward ID-based lookup
    //     return await this.vendorRepository.findOne({
    //         select: ["id", "businessName", "district", "districtId", "email", "phoneNumber", "telePhone"],
    //         where: { id }
    //     });
    // }
    async getVendorByIdService(id: number): Promise<Vendor | null> {
        // Straightforward ID-based lookup
        return await this.vendorRepository.findOne({
            where: { id },
            relations: {
                paymentOptions: true
            }
        });
    }

    /**
     * Finds a vendor by ID for validation or other use cases.
     * @param id - Vendor ID.
     * @returns {Promise<Vendor | null>} Vendor entity or null.
     */
    async findVendorById(id: number): Promise<Vendor | null> {
        // Duplicate of getVendorByIdService - could unify if desired
        return await this.vendorRepository.findOne({
            where: { id },
            relations: {
                paymentOptions: true
            }
        });
    }

    /**
     * Updates vendor information.
     * @param id - Vendor ID.
     * @param updateData - Partial data for vendor update.
     * @returns {Promise<Vendor | null>} Updated vendor or null if vendor does not exist.
     */
    async updateVendorService(id: number, updateData: Partial<IUpdateVendorRequest>) {
        let district: District;
        if (updateData.district) {
            const districtDb = AppDataSource.getRepository(District);

            district = await districtDb.findOne({
                where: {
                    id: updateData.districtId
                }
            })
        }

        const updateFinalData = {
            ...updateData,
            district: district
        }
        const updateDistrict = this.vendorRepository.update(id, updateFinalData)

        return this.vendorRepository.findOne({ where: { id } })
    }


    async approveVendor(id: number) {
        return await this.vendorRepository.update(
            { id },
            {
                isApproved: true
            }
        )
    }

    async deleteVendor(id: number) {
        return await this.vendorRepository.delete(id);
    }

    /**
     * Saves a vendor entity directly to the database.
     * @param vendor - Vendor entity to save.
     * @returns {Promise<Vendor>} The saved vendor.
     */
    async saveVendor(vendor: Vendor): Promise<Vendor> {
        // Useful for saving vendor after manual changes outside update method
        return await this.vendorRepository.save(vendor);
    }





    // ---------------------------------------------------------------------------------------------------------------------
    async createVendorV2(data: any): Promise<Vendor> {
        const queryRunner = this.vendorRepository.manager.connection.createQueryRunner();

        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const existing = await queryRunner.manager.findOne(Vendor, {
                where: { email: data.email },
            });

            if (existing) throw new APIError(409, "Vendor already exists");

            const vendor = queryRunner.manager.create(Vendor, {
                businessName: data.businessName,
                email: data.email,
                password: data.password,
                phoneNumber: data.phoneNumber,
                telePhone: data.telePhone,
                businessRegNumber: data.businessRegNumber,
                taxNumber: data.taxNumber,
                taxDocuments: data.taxDocuments,
                citizenshipDocuments: data.citizenshipDocuments,
                district: data.districtEntity,
                districtId: data.districtEntity.id,
                verificationCode: data.verificationCode,
                verificationCodeExpire: data.verificationCodeExpire,
                isVerified: true,
                isApproved: false,

                accountName: data.accountName,
                bankName: data.bankName,
                accountNumber: data.accountNumber,
                bankBranch: data.bankBranch,
            });

            const savedVendor = await queryRunner.manager.save(vendor);

            if (data.paymentOptions && data.paymentOptions.length > 0) {
                const paymentEntities = data.paymentOptions.map((option) =>
                    queryRunner.manager.create(VendorPaymentOption, {
                        paymentType: option.paymentType,
                        details: option.details,
                        qrCodeImage: option.qrCodeImage ?? null,
                        isActive: option.isActive ?? true,
                        vendor: savedVendor,
                        vendorId: savedVendor.id,
                    })
                );

                await queryRunner.manager.save(paymentEntities);
            }

            if (
                data.accountNumber &&
                (!data.paymentOptions ||
                    !data.paymentOptions.some((p) => p.paymentType === 'NPS'))
            ) {
                const bankOption = queryRunner.manager.create(VendorPaymentOption, {
                    paymentType: PaymentOption.NPS,
                    details: {
                        accountNumber: data.accountNumber,
                        bankName: data.bankName,
                        accountName: data.accountName,
                        branch: data.bankBranch,
                    },
                    vendor: savedVendor,
                    vendorId: savedVendor.id,
                });

                await queryRunner.manager.save(bankOption);
            }

            await queryRunner.commitTransaction();

            return vendor;
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async updateVendorServiceV2(
        id: number,
        updateData: Partial<IUpdateVendorRequestV2>
    ): Promise<Vendor> {

        const queryRunner = this.vendorRepository.manager.connection.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const vendor = await queryRunner.manager.findOne(Vendor, {
                where: { id },
                relations: {
                    paymentOptions: true
                }
            });

            if (!vendor) throw new APIError(404, "Vendor not found");

            // 🔹 Handle district update
            if (updateData.district) {
                const districtEntity = await queryRunner.manager.findOne(District, {
                    where: { name: updateData.district }
                });

                if (!districtEntity) throw new APIError(404, "District does not exist");

                vendor.district = districtEntity;
                vendor.districtId = districtEntity.id;
            }

            // 🔹 Update scalar fields safely
            Object.assign(vendor, {
                businessName: updateData.businessName ?? vendor.businessName,
                phoneNumber: updateData.phoneNumber ?? vendor.phoneNumber,
                telePhone: updateData.telePhone ?? vendor.telePhone,
                taxNumber: updateData.taxNumber ?? vendor.taxNumber,
                taxDocuments: updateData.taxDocuments ?? vendor.taxDocuments,
                citizenshipDocuments: updateData.citizenshipDocuments ?? vendor.citizenshipDocuments,
            });

            await queryRunner.manager.save(vendor);

            if (updateData.paymentOptions) {

                const existingOptions = vendor.paymentOptions;

                const existingMap = new Map(
                    existingOptions.map(opt => [opt.paymentType, opt])
                );

                const incomingMap = new Map(
                    updateData.paymentOptions.map(opt => [opt.paymentType, opt])
                );

                const toUpdate: VendorPaymentOption[] = [];
                const toCreate: VendorPaymentOption[] = [];
                const toDelete: VendorPaymentOption[] = [];

                // UPDATE OR CREATE
                for (const [paymentType, incomingOption] of incomingMap.entries()) {

                    const existingOption = existingMap.get(paymentType);

                    if (existingOption) {

                        existingOption.details = incomingOption.details;

                        if (incomingOption.qrCodeImage !== undefined) {
                            existingOption.qrCodeImage = incomingOption.qrCodeImage;
                        }

                        if (incomingOption.isActive !== undefined) {
                            existingOption.isActive = incomingOption.isActive;
                        }

                        toUpdate.push(existingOption);

                    } else {

                        const newOption = queryRunner.manager.create(VendorPaymentOption, {
                            paymentType: incomingOption.paymentType,
                            details: incomingOption.details,
                            qrCodeImage: incomingOption.qrCodeImage ?? null,
                            isActive: incomingOption.isActive ?? true,
                            vendor: vendor
                        });

                        toCreate.push(newOption);
                    }
                }

                // DELETE REMOVED
                for (const [paymentType, existingOption] of existingMap.entries()) {
                    if (!incomingMap.has(paymentType)) {
                        toDelete.push(existingOption);
                    }
                }

                if (toUpdate.length) await queryRunner.manager.save(toUpdate);
                if (toCreate.length) await queryRunner.manager.save(toCreate);
                if (toDelete.length) await queryRunner.manager.remove(toDelete);
            }

            await queryRunner.commitTransaction();

            return await queryRunner.manager.findOne(Vendor, {
                where: { id },
                relations: ['paymentOptions', 'district']
            });

        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }

    async updatePaymentOptionService(
        vendorId: number,
        paymentOptionId: number,
        updateData: Partial<IUpdateVendorPaymentOptionRequest>
    ): Promise<VendorPaymentOption> {

        const paymentOption = await this.vendorPaymentOptionRepository.findOne({
            where: {
                id: paymentOptionId,
                vendor: { id: vendorId }
            },
            relations: ['vendor']
        });

        if (!paymentOption) {
            throw new APIError(404, "Payment option not found for this vendor");
        }

        if (updateData.details !== undefined) {
            paymentOption.details = updateData.details;
        }

        if (updateData.qrCodeImage !== undefined) {
            paymentOption.qrCodeImage = updateData.qrCodeImage;
        }

        if (updateData.isActive !== undefined) {
            paymentOption.isActive = updateData.isActive;
        }

        await this.vendorPaymentOptionRepository.save(paymentOption);

        return paymentOption;
    }

}
