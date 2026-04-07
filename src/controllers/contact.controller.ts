import { Request, Response, NextFunction } from "express";
import { ContactInput } from "../utils/zod_validations/contact.zod";
import { ContactService } from "../service/contact.services";
import { IAdminContactQueryParams } from "../interface/contact.interface";

export class ContactController {
    private contactService: ContactService;

    constructor() {
        this.contactService = new ContactService();
    }

    async createContact(req: Request<{}, {}, ContactInput>, res: Response, _next: NextFunction): Promise<void> {
        const contact = await this.contactService.createContact(req.body);
        res.status(201).json({ success: true, message: "Contact form submitted successfully", data: contact });
    }

    async getAdminContacts(req: Request<{}, {}, {}, IAdminContactQueryParams>, res: Response, _next: NextFunction): Promise<void> {
        const { contacts, total } = await this.contactService.getAdminContacts(req.query);
        res.status(200).json({ success: true, data: { contacts, total } });
    }
}
