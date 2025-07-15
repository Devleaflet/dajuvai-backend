import { Repository } from "typeorm";
import { District } from '../entities/district.entity';
import AppDataSource from "../config/db.config";
import { APIError } from "../utils/ApiError.utils";
import { Vendor } from "../entities/vendor.entity";

/**
 * Service to manage District entities including create, update, delete,
 * and retrieval operations.
 * 
 * Module: District Management
 */
export class DistrictService {
    private districtRepository: Repository<District>;
    private vendorRepository: Repository<Vendor>;

    /**
     * Initializes repositories for District and Vendor entities.
     */
    constructor() {
        this.districtRepository = AppDataSource.getRepository(District);
        this.vendorRepository = AppDataSource.getRepository(Vendor);
    }

    /**
     * Creates a new district with the given name.
     * 
     * @param districtName {string} - Name of the new district
     * @returns {Promise<District>} - The newly created district
     * @throws {APIError} - If district name is missing or district already exists
     * @access Admin
     */
    async createDistrict(districtName: string): Promise<District> {
        if (!districtName) {
            throw new APIError(400, "District name is required");
        }

        const existing = await this.findDistrictByName(districtName);
        if (existing) {
            throw new APIError(409, "District already exists");
        }

        const newDistrict = this.districtRepository.create({ name: districtName });
        return await this.districtRepository.save(newDistrict);
    }

    /**
     * Updates the name of an existing district by ID.
     * 
     * @param districtId {number} - ID of the district to update
     * @param newName {string} - New name for the district
     * @returns {Promise<District>} - The updated district
     * @throws {APIError} - If parameters missing, district not found,
     *                      or duplicate name exists
     * @access Admin
     */
    async updateDistrict(districtId: number, newName: string): Promise<District> {
        if (!districtId || !newName) {
            throw new APIError(400, "District ID and new name are required");
        }

        const district = await this.findDistrictById(districtId);
        if (!district) {
            throw new APIError(404, "District not found");
        }

        const duplicate = await this.districtRepository.findOne({ where: { name: newName } });
        if (duplicate && duplicate.id !== districtId) {
            throw new APIError(409, "Another district with the same name already exists");
        }

        district.name = newName;
        return await this.districtRepository.save(district);
    }

    /**
     * Deletes a district by its ID after checking no vendors reference it.
     * 
     * @param districtId {number} - ID of the district to delete
     * @returns {Promise<void>}
     * @throws {APIError} - If district ID missing, not found,
     *                      or if any vendors use the district
     * @access Admin
     */
    async deleteDistrict(districtId: number): Promise<void> {
        if (!districtId) {
            throw new APIError(400, "District ID is required");
        }

        // Check if any vendor references this district
        const vendorCount = await this.vendorRepository.count({
            where: { districtId }
        });

        const district = await this.findDistrictById(districtId);
        if (!district) {
            throw new APIError(404, "District not found");
        }

        if (vendorCount > 0) {
            throw new APIError(409, "Cannot delete district: it is used by one or more vendors");
        }

        await this.districtRepository.remove(district);
    }

    /**
     * Retrieves all districts.
     * 
     * @returns {Promise<District[]>} - List of all districts
     * @access Public/Admin
     */
    async getDistricts(): Promise<District[]> {
        return await this.districtRepository.find();
    }

    /**
     * Finds a district by its ID.
     * 
     * @param districtId {number} - ID of the district
     * @returns {Promise<District>} - Found district
     * @throws {APIError} - If district ID missing or not found
     * @access Public/Admin
     */
    async findDistrictById(districtId: number): Promise<District> {
        if (!districtId) {
            throw new APIError(400, "District ID is required");
        }

        const district = await this.districtRepository.findOne({ where: { id: districtId } });
        if (!district) {
            throw new APIError(404, `District with ID ${districtId} not found`);
        }

        return district;
    }

    /**
     * Finds a district by its name.
     * 
     * @param districtName {string} - Name of the district
     * @returns {Promise<District | null>} - Found district or null if not found
     * @throws {APIError} - If district name is missing
     * @access Public/Admin
     */
    async findDistrictByName(districtName: string): Promise<District | null> {
        if (!districtName) {
            throw new APIError(400, "District name is required");
        }

        return await this.districtRepository.findOne({ where: { name: districtName } });
    }
}
