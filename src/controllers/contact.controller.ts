import { Request, Response } from 'express';
import { AdminContactQueryInput, ContactInput } from '../utils/zod_validations/contact.zod';
import { APIError } from '../utils/ApiError.utils';
import { ContactService } from '../service/contact.services';
import { IAdminContactQueryParams } from '../interface/contact.interface';

/**
 * @class ContactController
 * @description Controller for handling contact - related operations.
 * Handles creation of contact submission and retrieval for admin  and staff users
 */
export class ContactController {
    private contactService: ContactService;

    /**
     * @constructor
     * @description Initializes a new instance of ContactController
     *  Also instantiates the ContactService used for contact-related business logic.
     */
    constructor() {
        this.contactService = new ContactService();
    }

    /**
     * 
     * @method createContact
     * @route POST /api/contact
     * @description Creates a new contact from submission from the public.
     * @param {Request<{},{},ContactInput> req: Request containing contact form data in body}
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with created contact object
     * @access Public
     */
    async createContact(req: Request<{}, {}, ContactInput>, res: Response): Promise<void> {
        try {
            // Create contact via service
            const contact = await this.contactService.createContact(req.body);
            // Send success response
            res.status(201).json({ success: true, message: 'Contact form submitted successfully', data: contact });
        } catch (error) {
            // Log error for debugging
            console.error('Create contact error:', error);
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }
 /**
     * @method getAdminContacts
     * @route GET /api/contact/admin
     * @description Retrieves all contact form submissions, filtered and paginated for admin use.
     * @param {Request<{}, {}, {}, IAdminContactQueryParams>} req - Request with optional query filters (e.g., page, search, date)
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with list of contacts and total count
     * @access Admin and staff 
     */
    async getAdminContacts(req: Request<{}, {}, {}, IAdminContactQueryParams>, res: Response): Promise<void> {
        try {
            // Fetch contacts with query filters via service
            const { contacts, total } = await this.contactService.getAdminContacts(req.query);
            // Send success response
            res.status(200).json({ success: true, data: { contacts, total } });
        } catch (error) {
            // Log error for debugging
            console.error('getAdminContacts error:', error);
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }
}