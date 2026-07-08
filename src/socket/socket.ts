import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import AppDataSource from "../config/db.config";
import { User } from "../entities/user.entity";
import { Vendor } from "../entities/vendor.entity";
import { Cart } from "../entities/cart.entity";
import { CommissionDocument } from "../entities/commissionDocument.entity";
import { allowedOrigins } from "../config/cors.config";
import config from "../config/env.config";

let io: Server | null = null;

const userRoom = (userId: number) => `user:${userId}`;
const vendorRoom = (vendorId: number) => `vendor:${vendorId}`;
// All connected vendors join this room so admin-wide broadcasts (e.g. commission document changes) reach every vendor dashboard at once.
const VENDORS_ROOM = "vendors:all";

const getTokenFromSocket = (socket: Socket): string | null => {
    const authToken = socket.handshake.auth?.token;
    if (typeof authToken === "string" && authToken.trim().length > 0) {
        return authToken;
    }

    const header = socket.handshake.headers.authorization;
    if (typeof header === "string" && header.startsWith("Bearer ")) {
        return header.split(" ")[1] ?? null;
    }

    const queryToken = socket.handshake.query?.token;
    if (typeof queryToken === "string" && queryToken.trim().length > 0) {
        return queryToken;
    }

    return null;
};

export const initSocket = (server: HttpServer) => {
    io = new Server(server, {
        cors: {
            origin: allowedOrigins,
            credentials: true,
        },
    });

    io.use(async (socket, next) => {
        try {
            const token = getTokenFromSocket(socket);
            if (!token) {
                return next(new Error("Unauthorized"));
            }

            const decoded = jwt.verify(token, config.JWT_SECRET) as {
                id: number;
                role?: string;
                businessName?: string;
                [key: string]: any;
            };

            // Vendor tokens carry businessName (see combinedAuthMiddleware); user tokens carry role.
            if (decoded.businessName) {
                const vendorRepo = AppDataSource.getRepository(Vendor);
                const vendor = await vendorRepo.findOneBy({ id: decoded.id });
                if (!vendor) {
                    return next(new Error("Unauthorized"));
                }
                (socket.data as { vendorId?: number }).vendorId = vendor.id;
                return next();
            }

            const userRepo = AppDataSource.getRepository(User);
            const user = await userRepo.findOneBy({ id: decoded.id });

            if (!user || !user.isVerified) {
                return next(new Error("Unauthorized"));
            }

            (socket.data as { userId?: number }).userId = user.id;
            return next();
        } catch (error) {
            return next(new Error("Unauthorized"));
        }
    });

    io.on("connection", (socket) => {
        console.log(`User connected: ${socket.id}`)
        console.log(socket)
        const userId = (socket.data as { userId?: number }).userId;
        if (userId) {
            socket.join(userRoom(userId));
        }

        const vendorId = (socket.data as { vendorId?: number }).vendorId;
        if (vendorId) {
            socket.join(vendorRoom(vendorId));
            socket.join(VENDORS_ROOM);
        }

        socket.on("disconnect", () => {
            // Rooms are automatically cleared on disconnect.
        });
    });

    return io;
};

export const emitCartUpdate = (userId: number, cart: Cart) => {
    if (!io) return;
    const count = (cart.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
    io.to(userRoom(userId)).emit("cart:update", { count, cart });
    io.to(userRoom(userId)).emit("cart:count", { count });
};

// Notifies every connected vendor dashboard the moment admin uploads/replaces the commission document.
export const emitCommissionUpdate = (document: CommissionDocument) => {
    if (!io) return;
    io.to(VENDORS_ROOM).emit("commission:update", document);
};

// Notifies every connected vendor dashboard the moment admin removes the commission document.
export const emitCommissionDelete = () => {
    if (!io) return;
    io.to(VENDORS_ROOM).emit("commission:delete");
};
