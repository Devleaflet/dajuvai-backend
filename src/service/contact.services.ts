import { Repository } from 'typeorm';
import { Contact } from '../entities/contact.entity';
import AppDataSource from '../config/db.config';
import { ContactInput } from '../utils/zod_validations/contact.zod';
import { APIError } from '../utils/ApiError.utils';
import { sendContactEmail } from '../utils/nodemailer.utils';
import { IAdminContactQueryParams } from '../interface/contact.interface';
/**
 * Service class for handling contact form submissions and admin-side contact retrieval.
 * 
 * Responsibilities:
 * - Create and persist contact messages submitted via frontend.
 * - Send notification emails to admins using Nodemailer.
 * - Provide paginated contact list for admin dashboard.
 * 
 * Module: Contact / Customer Support
 */
export class ContactService {
    private contactRepository: Repository<Contact>;

    /**
     * Initializes the contact repository.
     */
    constructor() {
        this.contactRepository = AppDataSource.getRepository(Contact);
    }

    /**
     * Creates a new contact entry from user-submitted form data.
     * Sends an email notification to the admin upon successful creation.
     * 
     * @param dto {ContactInput} - Validated contact form input (name, email, subject, message)
     * @returns {Promise<Contact>} - The created contact record
     * @throws {APIError} - If email sending fails
     * @access Public
     */
    async createContact(dto: ContactInput): Promise<Contact> {
        const contact = this.contactRepository.create(dto); // Create contact entity
        const savedContact = await this.contactRepository.save(contact); // Persist to DB

        try {
            await sendContactEmail(dto); // Send email notification to admin
        } catch (error) {
            throw new APIError(500, "Failed to send contact email");
        }

        return savedContact;
    }

    /**
     * Retrieves paginated contact messages for admin dashboard.
     * Sorted by most recent first.
     * 
     * @param params {IAdminContactQueryParams} - Pagination params (page, limit)
     * @returns {Promise<{ contacts: Contact[]; total: number }>} - Paginated result set
     * @access Admin
     */
    async getAdminContacts(params: IAdminContactQueryParams): Promise<{ contacts: Contact[]; total: number }> {
        const { page = 1, limit = 7 } = params;

        const query = this.contactRepository.createQueryBuilder('contact')
            .orderBy('contact.createdAt', 'DESC'); // Sort by latest

        const skip = (page - 1) * limit;
        query.skip(skip).take(limit); // Apply pagination

        const [contacts, total] = await query.getManyAndCount();

        return { contacts, total };
    }
}
