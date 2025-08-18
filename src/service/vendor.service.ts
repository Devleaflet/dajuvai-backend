import { Repository } from 'typeorm';
import { Vendor } from '../entities/vendor.entity';
import AppDataSource from '../config/db.config';
import { IVendorSignupRequest, IUpdateVendorRequest } from '../interface/vendor.interface';
import { Address } from '../entities/address.entity';
import { APIError } from '../utils/ApiError.utils';
import { DistrictService } from './district.service';

/**
 * Service for managing vendor-related operations such as
 * creating, updating, and fetching vendors.
 * Handles validation, error checking, and database interactions.
 */
export class VendorService {
    private readonly vendorRepository: Repository<Vendor>;
    private addressRepository: Repository<Address>;
    private districtService: DistrictService;

    /**
     * Initializes repositories and dependent services.
     */
    constructor() {
        this.vendorRepository = AppDataSource.getRepository(Vendor);
        this.addressRepository = AppDataSource.getRepository(Address);
        this.districtService = new DistrictService();
    }

    /**
     * Fetches all vendors from the database.
     * @returns {Promise<Vendor[]>} Array of all vendor entities.
     */
    async fetchAllVendors(): Promise<Vendor[]> {
        // Simple find all vendors, no filtering.
        return await this.vendorRepository.find();
    }

    async fetchAllUnapprovedVendor() {
        return await this.vendorRepository.find({
            where: {
                isApproved: false
            }
        })
    }

    /**
     * Creates a new vendor with validation on email uniqueness and district existence.
     * @param vendorSignupData - Vendor data for signup, including business info and optional verification.
     * @returns {Promise<Vendor>} The newly created vendor entity.
     * @throws {APIError} Throws error if vendor exists or district invalid.
     */
    async createVendor(vendorSignupData: IVendorSignupRequest): Promise<Vendor> {
        try {
            const { businessName, email, password, phoneNumber, district, verificationCode, verificationCodeExpire } = vendorSignupData;

            // Check if vendor with this email already exists to prevent duplicates
            const existing = await this.vendorRepository.findOne({ where: { email } });
            if (existing) {
                throw new APIError(409, 'Vendor already exists');
            }

            // Validate district exists in DB, if not throw error
            const districtEntity = await this.districtService.findDistrictByName(district);
            if (!districtEntity) {
                throw new APIError(400, 'District does not exist');
            }

            // Create new vendor entity with district relation
            const vendor = this.vendorRepository.create({
                businessName,
                email,
                password,
                phoneNumber,
                district: districtEntity,
                districtId: districtEntity.id,
                verificationCode,
                verificationCodeExpire,
            });

            // Save vendor to DB
            return await this.vendorRepository.save(vendor);

        } catch (error) {
            // Re-throw with more context for easier debugging
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
    async getVendorByIdService(id: number): Promise<Vendor | null> {
        // Straightforward ID-based lookup
        return await this.vendorRepository.findOne({ where: { id } });
    }

    /**
     * Finds a vendor by ID for validation or other use cases.
     * @param id - Vendor ID.
     * @returns {Promise<Vendor | null>} Vendor entity or null.
     */
    async findVendorById(id: number): Promise<Vendor | null> {
        // Duplicate of getVendorByIdService - could unify if desired
        return await this.vendorRepository.findOne({ where: { id } });
    }

    /**
     * Updates vendor information.
     * @param id - Vendor ID.
     * @param updateData - Partial data for vendor update.
     * @returns {Promise<Vendor | null>} Updated vendor or null if vendor does not exist.
     */
    async updateVendorService(id: number, updateData: IUpdateVendorRequest): Promise<Vendor | null> {
        // Verify vendor exists before update
        const vendor = await this.vendorRepository.findOne({ where: { id } });
        if (!vendor) return null;

        // Merge new data into existing vendor entity
        this.vendorRepository.merge(vendor, updateData);

        // Save updated vendor back to DB
        return await this.vendorRepository.save(vendor);
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
}
