import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { broadcastSearchService } from "../service/broadcast.search.service";
import { broadcastService } from "../service/broadcast.service";
import {
    BroadcastDeliveriesQuery,
    BroadcastListQuery,
    CreateBroadcastInput,
    PreviewBroadcastInput,
    RecipientSearchQuery,
    TargetSearchQuery,
} from "../utils/zod_validations/broadcast.zod";

type IdParams = { id: string };

export class AdminBroadcastController {
    async availability(_req: AuthRequest, res: Response): Promise<void> {
        res.status(200).json({ success: true, data: broadcastService.availability() });
    }

    async recipients(req: AuthRequest<{}, {}, {}, RecipientSearchQuery>, res: Response): Promise<void> {
        res.status(200).json({ success: true, ...(await broadcastSearchService.recipients(req.query)) });
    }

    async targets(req: AuthRequest<{}, {}, {}, TargetSearchQuery>, res: Response): Promise<void> {
        res.status(200).json({ success: true, ...(await broadcastSearchService.targets(req.query)) });
    }

    async list(req: AuthRequest<{}, {}, {}, BroadcastListQuery>, res: Response): Promise<void> {
        res.status(200).json({ success: true, ...(await broadcastService.list(req.query)) });
    }

    async get(req: AuthRequest<IdParams>, res: Response): Promise<void> {
        res.status(200).json({ success: true, data: await broadcastService.get(req.params.id) });
    }

    async deliveries(req: AuthRequest<IdParams, {}, {}, BroadcastDeliveriesQuery>, res: Response): Promise<void> {
        res.status(200).json({ success: true, ...(await broadcastService.deliveries(req.params.id, req.query)) });
    }

    async preview(req: AuthRequest<{}, {}, PreviewBroadcastInput>, res: Response): Promise<void> {
        res.status(200).json({ success: true, data: await broadcastService.preview(req.body) });
    }

    async create(req: AuthRequest<{}, {}, CreateBroadcastInput>, res: Response): Promise<void> {
        res.status(201).json({ success: true, data: await broadcastService.create(req.body, req.user!.id) });
    }

    async update(req: AuthRequest<IdParams, {}, CreateBroadcastInput>, res: Response): Promise<void> {
        res.status(200).json({ success: true, data: await broadcastService.update(req.params.id, req.body) });
    }

    async duplicate(req: AuthRequest<IdParams>, res: Response): Promise<void> {
        res.status(201).json({ success: true, data: await broadcastService.duplicate(req.params.id, req.user!.id) });
    }

    async remove(req: AuthRequest<IdParams>, res: Response): Promise<void> {
        await broadcastService.remove(req.params.id);
        res.status(200).json({ success: true, data: { deleted: true } });
    }

    async send(req: AuthRequest<IdParams, {}, { scheduledAt?: string | null }>, res: Response): Promise<void> {
        res.status(200).json({ success: true, data: await broadcastService.send(req.params.id, req.body.scheduledAt) });
    }

    async cancel(req: AuthRequest<IdParams>, res: Response): Promise<void> {
        res.status(200).json({ success: true, data: await broadcastService.cancel(req.params.id) });
    }

    async test(req: AuthRequest<IdParams, {}, { userId?: number; vendorId?: number }>, res: Response): Promise<void> {
        res.status(200).json({ success: true, data: await broadcastService.test(req.params.id, req.body, req.user!) });
    }

    async unsubscribe(req: Request<{}, {}, { token: string }>, res: Response): Promise<void> {
        res.status(200).json({ success: true, data: await broadcastService.unsubscribe(req.body.token) });
    }
}
